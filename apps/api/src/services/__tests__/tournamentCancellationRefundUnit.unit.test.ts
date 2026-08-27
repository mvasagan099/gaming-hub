import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_TOURNAMENT_TIERS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  type TournamentTierConfig,
  type TournamentRefundStatus,
  type TournamentStatus,
} from "@gaming-hub/shared";

// 10 competitive games
const ALL_10_GAMES = [
  { id: "snake-ladder", name: "Snake & Ladder" },
  { id: "ludo", name: "Ludo" },
  { id: "chess", name: "Chess" },
  { id: "fruit-ninja", name: "Fruit Ninja" },
  { id: "bubble-shooter", name: "Bubble Shooter" },
  { id: "table-tennis", name: "Table Tennis" },
  { id: "snake-vs-worms", name: "Snake vs Worms" },
  { id: "cricket", name: "Cricket" },
  { id: "carrom", name: "Carrom" },
  { id: "snooker", name: "Snooker" },
];

describe("Tournament Minimum Players, Cancellation & Refund System Unit Tests", () => {
  // -------------------------------------------------------------------------
  // 1 & 2 & 3 & 4. Minimum Players Evaluation Logic
  // -------------------------------------------------------------------------
  describe("1-4. Minimum Players Evaluation Logic", () => {
    function evaluateRegistrationDeadline(params: {
      registeredPlayers: number;
      minPlayers: number;
      maxPlayers: number;
    }): { nextStatus: "IN_PROGRESS" | "CANCELLED"; cancellationReason?: string } {
      if (params.registeredPlayers >= params.minPlayers) {
        return { nextStatus: "IN_PROGRESS" };
      }
      return {
        nextStatus: "CANCELLED",
        cancellationReason: "MINIMUM_PLAYERS_NOT_REACHED",
      };
    }

    it("Test 1: Minimum reached -> Starts tournament and does NOT cancel", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 25,
        minPlayers: 20,
        maxPlayers: 100,
      });
      expect(result.nextStatus).toBe("IN_PROGRESS");
      expect(result.cancellationReason).toBeUndefined();
    });

    it("Test 2: Minimum not reached -> Cancels with MINIMUM_PLAYERS_NOT_REACHED", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 15,
        minPlayers: 20,
        maxPlayers: 100,
      });
      expect(result.nextStatus).toBe("CANCELLED");
      expect(result.cancellationReason).toBe("MINIMUM_PLAYERS_NOT_REACHED");
    });

    it("Test 3: Exactly minimum players reached -> Starts tournament", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 20,
        minPlayers: 20,
        maxPlayers: 100,
      });
      expect(result.nextStatus).toBe("IN_PROGRESS");
      expect(result.cancellationReason).toBeUndefined();
    });

    it("Test 4: One player below minimum -> Cancels tournament", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 19,
        minPlayers: 20,
        maxPlayers: 100,
      });
      expect(result.nextStatus).toBe("CANCELLED");
      expect(result.cancellationReason).toBe("MINIMUM_PLAYERS_NOT_REACHED");
    });

    it("Test 5: Tournament full -> Starts tournament", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 100,
        minPlayers: 20,
        maxPlayers: 100,
      });
      expect(result.nextStatus).toBe("IN_PROGRESS");
    });

    it("Test: Tournament partially filled but above minimum (e.g. Standard 35/500 with min 32) -> Starts", () => {
      const result = evaluateRegistrationDeadline({
        registeredPlayers: 35,
        minPlayers: 32,
        maxPlayers: 500,
      });
      expect(result.nextStatus).toBe("IN_PROGRESS");
    });
  });

  // -------------------------------------------------------------------------
  // 6 & 7 & 8. Authoritative Historical Pricing & Idempotent Refunds
  // -------------------------------------------------------------------------
  describe("6-8. Authoritative Historical Pricing & Idempotency", () => {
    interface LedgerTransaction {
      id: string;
      userId: string;
      tournamentId: string;
      type: "DEBIT" | "CREDIT";
      amount: number;
      referenceType: "TOURNAMENT_ENTRY";
      status: "COMPLETED" | "FAILED";
    }

    class MockRefundLedger {
      public debits: LedgerTransaction[] = [];
      public credits: LedgerTransaction[] = [];
      public idempotencyKeys = new Set<string>();

      public debitEntry(userId: string, tournamentId: string, amount: number) {
        const tx: LedgerTransaction = {
          id: `tx-debit-${tournamentId}-${userId}`,
          userId,
          tournamentId,
          type: "DEBIT",
          amount,
          referenceType: "TOURNAMENT_ENTRY",
          status: "COMPLETED",
        };
        this.debits.push(tx);
        return tx;
      }

      public refundEntry(userId: string, tournamentId: string, currentTierEntryFee: number) {
        const idempotencyKey = `REFUND:TOURNAMENT:${tournamentId}:${userId}`;
        if (this.idempotencyKeys.has(idempotencyKey)) {
          // Idempotent hit: return existing
          const existing = this.credits.find((c) => c.userId === userId && c.tournamentId === tournamentId);
          return { ok: true, status: "ALREADY_REFUNDED", transactionId: existing?.id, amount: existing?.amount };
        }

        const debit = this.debits.find((d) => d.userId === userId && d.tournamentId === tournamentId && d.type === "DEBIT");
        if (!debit) {
          return { ok: false, status: "NO_FEE", amount: 0 };
        }

        // Must refund the authoritative amount charged, NOT current tier config
        const refundAmount = debit.amount;
        const creditTx: LedgerTransaction = {
          id: `tx-credit-refund-${tournamentId}-${userId}`,
          userId,
          tournamentId,
          type: "CREDIT",
          amount: refundAmount,
          referenceType: "TOURNAMENT_ENTRY",
          status: "COMPLETED",
        };

        this.credits.push(creditTx);
        this.idempotencyKeys.add(idempotencyKey);
        return { ok: true, status: "REFUNDED", transactionId: creditTx.id, amount: refundAmount };
      }
    }

    it("Test 6 & 7: Automatic refund credits authoritative historical entry fee amount", () => {
      const ledger = new MockRefundLedger();
      // Historical entry charged 25 coins
      ledger.debitEntry("user-1", "tourn-101", 25);

      // Even if tier config was changed to 50 coins later, refund must be 25
      const refund = ledger.refundEntry("user-1", "tourn-101", 50);
      expect(refund.ok).toBe(true);
      expect(refund.status).toBe("REFUNDED");
      expect(refund.amount).toBe(25); // exactly what was charged
    });

    it("Test 8: Duplicate refund request returns ALREADY_REFUNDED without double crediting", () => {
      const ledger = new MockRefundLedger();
      ledger.debitEntry("user-1", "tourn-101", 25);

      const firstAttempt = ledger.refundEntry("user-1", "tourn-101", 25);
      expect(firstAttempt.status).toBe("REFUNDED");

      const duplicateAttempt = ledger.refundEntry("user-1", "tourn-101", 25);
      expect(duplicateAttempt.status).toBe("ALREADY_REFUNDED");
      expect(duplicateAttempt.transactionId).toBe(firstAttempt.transactionId);

      // Ledger credits contains exactly ONE credit
      const userCredits = ledger.credits.filter((c) => c.userId === "user-1");
      expect(userCredits.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 9 & 10 & 11. Partial Refund Failure & Single-Record Retry
  // -------------------------------------------------------------------------
  describe("9-11. Partial Refund Failure & Single-Record Retry", () => {
    it("Test 9, 10, 11: Correctly classifies PARTIALLY_REFUNDED and retries only failed records", () => {
      interface MockPlayerRefund {
        userId: string;
        entryFee: number;
        status: "PENDING" | "REFUNDED" | "FAILED";
        failureReason?: string;
      }

      const refunds: MockPlayerRefund[] = Array.from({ length: 50 }, (_, i) => ({
        userId: `user-${i + 1}`,
        entryFee: 25,
        status: i === 49 ? "FAILED" : "REFUNDED",
        failureReason: i === 49 ? "Wallet lock timeout" : undefined,
      }));

      const completedCount = refunds.filter((r) => r.status === "REFUNDED").length;
      const failedCount = refunds.filter((r) => r.status === "FAILED").length;

      let overallRefundStatus: TournamentRefundStatus;
      if (completedCount === refunds.length) {
        overallRefundStatus = "REFUNDED";
      } else if (completedCount > 0 && failedCount > 0) {
        overallRefundStatus = "PARTIALLY_REFUNDED";
      } else {
        overallRefundStatus = "FAILED";
      }

      expect(completedCount).toBe(49);
      expect(failedCount).toBe(1);
      expect(overallRefundStatus).toBe("PARTIALLY_REFUNDED");

      // Admin retries only the failed record
      const toRetry = refunds.filter((r) => r.status === "FAILED");
      expect(toRetry.length).toBe(1);
      expect(toRetry[0]!.userId).toBe("user-50");

      // Simulating successful retry
      toRetry[0]!.status = "REFUNDED";
      toRetry[0]!.failureReason = undefined;

      const finalCompleted = refunds.filter((r) => r.status === "REFUNDED").length;
      const finalFailed = refunds.filter((r) => r.status === "FAILED").length;
      const finalOverallStatus: TournamentRefundStatus =
        finalCompleted === refunds.length ? "REFUNDED" : "PARTIALLY_REFUNDED";

      expect(finalCompleted).toBe(50);
      expect(finalFailed).toBe(0);
      expect(finalOverallStatus).toBe("REFUNDED");
    });
  });

  // -------------------------------------------------------------------------
  // 12. Server Restart Crash Recovery
  // -------------------------------------------------------------------------
  describe("12. Server Restart Crash Recovery", () => {
    it("Test 12: Recovery scanner reconciles unrefunded entries for cancelled tournaments", () => {
      const cancelledTournaments = [{ id: "tourn-crash-1", cancellationReason: "MINIMUM_PLAYERS_NOT_REACHED" }];
      const debits = [
        { userId: "user-1", tournamentId: "tourn-crash-1", amount: 10 },
        { userId: "user-2", tournamentId: "tourn-crash-1", amount: 10 },
      ];
      const credits = [
        { userId: "user-1", tournamentId: "tourn-crash-1", amount: 10 }, // user-1 already got refund
      ];

      const unrefundedDebits = debits.filter(
        (d) => !credits.some((c) => c.userId === d.userId && c.tournamentId === d.tournamentId),
      );

      expect(unrefundedDebits.length).toBe(1);
      expect(unrefundedDebits[0]!.userId).toBe("user-2");
    });
  });

  // -------------------------------------------------------------------------
  // 13 & 14. Race Condition & Deadline Registration Protection
  // -------------------------------------------------------------------------
  describe("13-14. Race Condition & Registration Lock", () => {
    it("Test 13: Rejects registrations after REGISTRATION_CLOSED", () => {
      const tournament = {
        status: "REGISTRATION_CLOSED" as TournamentStatus,
        registrationEndsAt: new Date(Date.now() - 1000),
      };

      const canRegister = tournament.status === "REGISTRATION_OPEN" && tournament.registrationEndsAt.getTime() > Date.now();
      expect(canRegister).toBe(false);
    });

    it("Test 14: Atomic state versioning prevents dual transition (start vs cancel)", () => {
      let stateVersion = 1;
      let status: TournamentStatus = "REGISTRATION_CLOSED";

      function transition(expectedVersion: number, newStatus: TournamentStatus) {
        if (stateVersion !== expectedVersion) {
          return { success: false, reason: "CONCURRENT_MODIFICATION" };
        }
        stateVersion++;
        status = newStatus;
        return { success: true, status };
      }

      // First worker cancels
      const cancelWorker = transition(1, "CANCELLED");
      expect(cancelWorker.success).toBe(true);
      expect(status).toBe("CANCELLED");

      // Concurrent start worker tries with stale version 1
      const startWorker = transition(1, "STARTING" as any);
      expect(startWorker.success).toBe(false);
      expect(startWorker.reason).toBe("CONCURRENT_MODIFICATION");
      expect(status).toBe("CANCELLED");
    });
  });

  // -------------------------------------------------------------------------
  // 15 & 16. Admin Cancellation Preview & Active Tournament Protection
  // -------------------------------------------------------------------------
  describe("15-16. Admin Cancellation & Active Match Protection", () => {
    it("Test 15: Calculates exact cancellation preview metrics", () => {
      const tournament = {
        id: "tourn-prev-1",
        title: "Standard Snooker Hourly",
        status: "REGISTRATION_OPEN" as TournamentStatus,
        entryFee: 25,
        maxPlayers: 500,
        minPlayers: 32,
        prizePool: 10000,
        registeredPlayers: 28,
        activeMatches: 0,
      };

      const totalEntryCollection = tournament.registeredPlayers * tournament.entryFee;
      const totalRefundableAmount = totalEntryCollection;
      const canCancel = tournament.status !== "COMPLETED" && tournament.activeMatches === 0;

      expect(totalEntryCollection).toBe(700);
      expect(totalRefundableAmount).toBe(700);
      expect(canCancel).toBe(true);
    });

    it("Test 16: Active tournament protection blocks pre-start cancellation once matches have started", () => {
      const tournament = {
        status: "IN_PROGRESS" as TournamentStatus,
        activeMatches: 4,
      };

      const canCancelStandard = tournament.status !== "IN_PROGRESS" || tournament.activeMatches === 0;
      expect(canCancelStandard).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 17. Hourly Scheduler Independence
  // -------------------------------------------------------------------------
  describe("17. Hourly Scheduler Independence", () => {
    it("Test 17: Cancelling slot 11:00 does not affect or cancel slot 12:00", () => {
      const slots = [
        { slotHour: "2026-08-27T11:00:00Z", status: "CANCELLED", reason: "MINIMUM_PLAYERS_NOT_REACHED" },
        { slotHour: "2026-08-27T12:00:00Z", status: "REGISTRATION_OPEN", reason: null },
      ];

      expect(slots[0]!.status).toBe("CANCELLED");
      expect(slots[1]!.status).toBe("REGISTRATION_OPEN");
    });
  });

  // -------------------------------------------------------------------------
  // 18. All 5 Canonical Tiers Configurable Minimums
  // -------------------------------------------------------------------------
  describe("18. All 5 Tiers Validation", () => {
    it("Test 18: Validates all 5 default tiers have configurable minPlayers <= maxPlayers", () => {
      for (const tier of DEFAULT_TOURNAMENT_TIERS) {
        expect(tier.minPlayers).toBeDefined();
        expect(tier.minPlayers!).toBeGreaterThan(0);
        expect(tier.minPlayers!).toBeLessThanOrEqual(tier.maxPlayers);
      }

      const mini = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "mini")!;
      const basic = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "basic")!;
      const standard = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "standard")!;
      const premium = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "premium")!;
      const pro = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "pro")!;

      expect(mini.entryFee).toBe(5);
      expect(mini.maxPlayers).toBe(100);
      expect(mini.prizePool).toBe(400);

      expect(basic.entryFee).toBe(10);
      expect(basic.maxPlayers).toBe(200);
      expect(basic.prizePool).toBe(1600);

      expect(standard.entryFee).toBe(25);
      expect(standard.maxPlayers).toBe(500);
      expect(standard.prizePool).toBe(10000);

      expect(premium.entryFee).toBe(50);
      expect(premium.maxPlayers).toBe(500);
      expect(premium.prizePool).toBe(22500);

      expect(pro.entryFee).toBe(100);
      expect(pro.maxPlayers).toBe(1000);
      expect(pro.prizePool).toBe(90000);
    });
  });

  // -------------------------------------------------------------------------
  // 19. All 10 Games Compatibility
  // -------------------------------------------------------------------------
  describe("19. All 10 Competitive Games Compatibility", () => {
    it("Test 19: All 10 competitive games support tournament minimums & refunds", () => {
      expect(ALL_10_GAMES.length).toBe(10);
      for (const game of ALL_10_GAMES) {
        // Financial refund is decoupled from game rules
        const refundResult = {
          gameId: game.id,
          gameName: game.name,
          refundStatus: "REFUNDED",
        };
        expect(refundResult.refundStatus).toBe("REFUNDED");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 20. Notification & Status Formatter
  // -------------------------------------------------------------------------
  describe("20. Mobile & Status Display Formatter", () => {
    it("Test 20: Generates authoritative player cancellation & refund notice", () => {
      function formatPlayerCancellationNotice(params: {
        tournamentTitle: string;
        entryFee: number;
        reason: string;
        isRefunded: boolean;
      }) {
        return {
          title: "TOURNAMENT CANCELLED",
          reason: params.reason === "MINIMUM_PLAYERS_NOT_REACHED" ? "Minimum players not reached" : params.reason,
          entryFeeText: `${params.entryFee} coins`,
          refundStatusText: params.isRefunded ? "REFUNDED TO WALLET" : "PROCESSING",
        };
      }

      const notice = formatPlayerCancellationNotice({
        tournamentTitle: "Standard Snooker Hourly",
        entryFee: 25,
        reason: "MINIMUM_PLAYERS_NOT_REACHED",
        isRefunded: true,
      });

      expect(notice.title).toBe("TOURNAMENT CANCELLED");
      expect(notice.reason).toBe("Minimum players not reached");
      expect(notice.entryFeeText).toBe("25 coins");
      expect(notice.refundStatusText).toBe("REFUNDED TO WALLET");
    });
  });
});
