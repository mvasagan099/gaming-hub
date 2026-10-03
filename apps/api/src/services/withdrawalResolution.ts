import { prisma, Prisma } from "@gaming-hub/db";
import { applyTransaction } from "./wallet";

/** Finalize under a row lock. The claim timestamp fences out a stale worker. */
export async function resolveWithdrawal(
  id: string,
  outcome: "COMPLETED" | "REFUNDED" | "UNCONFIRMED_HOLD",
  claim?: Date | null,
  reason = outcome,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "WalletRequest" WHERE "id" = ${id} FOR UPDATE`);
    const current = await tx.walletRequest.findUniqueOrThrow({ where: { id } });
    if (current.status !== "PENDING") return current;
    if (claim && current.processingStartedAt?.getTime() !== claim.getTime()) return current;
    if (outcome === "REFUNDED") {
      await applyTransaction(tx, current.userId, current.amount + current.fee, "REVERSAL",
        current.externalTransferId || current.note || current.id,
        { reason, originalTransactionId: current.id }, "MAIN");
    }
    return tx.walletRequest.update({
      where: { id },
      data: {
        status: outcome === "COMPLETED" ? "APPROVED" : outcome === "REFUNDED" ? "REJECTED" : "PENDING",
        adminNote: outcome,
        decidedAt: outcome === "UNCONFIRMED_HOLD" ? null : new Date(),
        processingStartedAt: null,
      },
    });
  });
}

/** Only an explicit rejection is refundable; transport/local failures are uncertain. */
export function isDefinitiveTransferFailure(error: unknown): boolean {
  const e = error as { statusCode?: number; isTimeout?: boolean; isUncertain?: boolean };
  return !e?.isTimeout && !e?.isUncertain && !!e?.statusCode &&
    e.statusCode >= 400 && e.statusCode < 500 && e.statusCode !== 409 && e.statusCode !== 408;
}
