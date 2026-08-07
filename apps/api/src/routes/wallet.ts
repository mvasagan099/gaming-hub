import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import type { WalletRequestKind, WalletRequestStatus } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, requireUser, routeParams, queryParams, queryString } from "../lib/http";
import { assertFeatureEnabled } from "../services/featureFlags";
import { claimPracticeReward, getWallet, getWalletSummary, transferToCouponWallet, listTransactions } from "../services/wallet";
import {
  cancelWalletRequest,
  createDepositRequest,
  createWithdrawalRequest,
  getWalletRequest,
  listWalletRequests,
  requestWithdrawalOtp,
} from "../services/walletRequests";

const practiceRewardSchema = z.object({
  gameId: z.string().min(1).max(40),
});

const transferSchema = z.object({
  amount: z.number().min(50),
});

const depositSchema = z.object({
  amount: z.number().int().min(1),
  method: z.string().trim().min(1).max(40).optional(),
});

const withdrawalSchema = z.object({
  amount: z.number().int().min(1),
  otp: z.string().trim().min(6).max(6),
});

const requestFiltersSchema = z.object({
  kind: z.enum(["DEPOSIT", "WITHDRAWAL"]).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
});

const WALLET_RATE_LIMIT = { max: 120, timeWindow: "1 minute" };

export async function walletRoutes(app: FastifyInstance) {
  app.get("/api/wallet", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    return getWallet(requireUser(request).id);
  });

  app.get("/api/wallet/summary", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    return getWalletSummary(requireUser(request).id);
  });

  app.post("/api/wallet/transfer", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    const { amount } = parseSchema(transferSchema, request.body);
    return transferToCouponWallet(user.id, amount);
  });

  app.get("/api/wallet/transactions", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = clampPagination(query.page, query.pageSize);
    const walletType = (typeof query.walletType === "string" ? query.walletType : undefined) as
      | "MAIN"
      | "BONUS"
      | "LOCKED"
      | "REWARD"
      | "CASHBACK"
      | undefined;
    const referenceType = (typeof query.referenceType === "string" ? query.referenceType : undefined) as
      | "MATCH_WAGER"
      | "MATCH_PAYOUT"
      | "ADMIN"
      | "BONUS"
      | "PRACTICE"
      | "DEPOSIT"
      | "WITHDRAWAL"
      | "REFERRAL"
      | "COUPON"
      | "TOURNAMENT_ENTRY"
      | "TOURNAMENT_PRIZE"
      | "LOCKED_CREDIT"
      | "REWARD_CREDIT"
      | "CASHBACK_CREDIT"
      | "WAGER_REFUND"
      | "REVERSAL"
      | undefined;
    return listTransactions(user.id, page, pageSize, walletType, referenceType);
  });

  app.post("/api/wallet/practice-reward", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("games.practice", "Practice mode");
    const { gameId } = parseSchema(practiceRewardSchema, request.body);
    if (!isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game", 400);
    }
    return claimPracticeReward(user.id, gameId);
  });

  // ---- Withdrawal OTP -----------------------------------------------------

  app.post("/api/wallet/otp", { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    await assertFeatureEnabled("payments.withdrawals", "Withdrawals");
    return requestWithdrawalOtp(requireUser(request).id);
  });

  // ---- Deposit / withdrawal requests --------------------------------------

  app.post("/api/wallet/deposits", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("payments.deposits", "Deposits");
    const { amount, method } = parseSchema(depositSchema, request.body);
    return createDepositRequest(user.id, amount, method);
  });

  app.post("/api/wallet/withdrawals", { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("payments.withdrawals", "Withdrawals");
    const { amount, otp } = parseSchema(withdrawalSchema, request.body);
    return createWithdrawalRequest(user.id, amount, otp);
  });

  app.get("/api/wallet/requests", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const filters = parseSchema(requestFiltersSchema, {
      kind: queryString(q.kind) || undefined,
      status: queryString(q.status) || undefined,
    });
    return listWalletRequests({ userId: user.id, ...filters }, page, pageSize);
  });

  app.get("/api/wallet/requests/:id", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const walletRequest = await getWalletRequest(id);
    if (walletRequest.userId !== user.id) {
      throw new AppError("WALLET_REQUEST_NOT_FOUND", "Request not found", 404);
    }
    return walletRequest;
  });

  app.post("/api/wallet/requests/:id/cancel", { preHandler: authenticate, config: { rateLimit: WALLET_RATE_LIMIT } }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return cancelWalletRequest(user.id, id);
  });
}
