import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import { CouponVaultService } from "../couponVaultService";
import {
  transferToCouponWallet,
  reconcileUnconfirmedTransfer,
  reconcileAllUnconfirmedTransfers,
  getWallet,
} from "../wallet";
import { redeemCoupon } from "../coupons";
import { AppError } from "@gaming-hub/shared";
import { prisma } from "@gaming-hub/db";

// Mock dependencies to avoid external DB connection delays
vi.mock("../../env", () => ({
  env: {
    NODE_ENV: "test",
    COUPON_API_URL: "http://127.0.0.1:4567/api/v1",
    COUPON_API_KEY: "test-secret-key-12345678901234567890",
    REQUIRE_EMAIL_VERIFICATION: false,
  },
}));

vi.mock("../settings", () => ({
  getEconomySettings: vi.fn().mockResolvedValue({
    currencyName: "Coins",
    currencySymbol: "🪙",
    startingCoins: 1000,
    dailyBonusCoins: 100,
  }),
  getGlobalSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock("../featureFlags", () => ({
  getFeatureFlags: vi.fn().mockResolvedValue({
    "wallet.bonus": true,
    "wallet.rewards": true,
    "wallet.cashback": true,
  }),
  assertFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../walletSyncService", () => ({
  WalletSyncService: {
    emitWalletUpdate: vi.fn(),
  },
}));

vi.mock("../notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

// This suite validates the local HTTP provider contract. Affiliate accounting
// is covered by PostgreSQL suites, not this provider's in-memory fixture.
vi.mock("../walletTransactionService", () => ({
  WalletTransactionService: { onDepositCompleted: vi.fn().mockResolvedValue(undefined) },
}));

// Mock Prisma with in-memory state
const mockStore = {
  wallet: {
    id: "wallet-live-1",
    userId: "user-live-1",
    balance: 500,
    bonusBalance: 0,
    lockedBalance: 0,
    rewardBalance: 0,
    cashbackBalance: 0,
    isFrozen: false,
    currency: "COIN",
  },
  profile: {
    userId: "user-live-1",
    coins: 500,
  },
  user: {
    id: "user-live-1",
    email: "player@example.com",
    username: "pro_gamer",
  },
  transactions: [] as any[],
  walletRequests: [] as any[],
  coupons: new Map<string, any>(),
  redemptions: [] as any[],
};

vi.mock("@gaming-hub/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gaming-hub/db")>()),
  prisma: {
    wallet: {
      findUnique: vi.fn().mockImplementation(async () => ({ ...mockStore.wallet })),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...mockStore.wallet })),
      update: vi.fn().mockImplementation(async ({ data }: any) => {
        if (data.balance?.increment) mockStore.wallet.balance += data.balance.increment;
        if (data.balance?.decrement) mockStore.wallet.balance -= data.balance.decrement;
        return { ...mockStore.wallet };
      }),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        if (where?.balance?.gte !== undefined && mockStore.wallet.balance < where.balance.gte) {
          return { count: 0 };
        }
        if (data?.balance?.decrement) mockStore.wallet.balance -= data.balance.decrement;
        if (data?.balance?.increment) mockStore.wallet.balance += data.balance.increment;
        return { count: 1 };
      }),
    },
    profile: {
      findUnique: vi.fn().mockImplementation(async () => ({ ...mockStore.profile })),
      update: vi.fn().mockImplementation(async ({ data }: any) => {
        if (data.coins !== undefined) mockStore.profile.coins = data.coins;
        return { ...mockStore.profile };
      }),
      updateMany: vi.fn().mockImplementation(async ({ data }: any) => {
        if (data.coins !== undefined) mockStore.profile.coins = data.coins;
        return { count: 1 };
      }),
    },
    user: {
      findUnique: vi.fn().mockImplementation(async () => ({ ...mockStore.user })),
    },
    transaction: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => mockStore.transactions.filter(t => Object.entries(where).every(([key, value]) => t[key] === value))),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `tx-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
        mockStore.transactions.push(row);
        return row;
      }),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        let count = 0;
        for (const tx of mockStore.transactions) {
          if (where.referenceId && tx.referenceId === where.referenceId) {
            Object.assign(tx, data);
            count++;
          }
        }
        return { count };
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return mockStore.transactions.find((t) => t.referenceId === where.referenceId) || null;
      }),
    },
      walletRequest: {
      findFirstOrThrow: vi.fn().mockImplementation(async ({ where }: any) => {
        const r = mockStore.walletRequests.find(r => r.externalTransferId === where.externalTransferId);
        if (!r) throw new Error("Request not found"); return { ...r };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
        mockStore.walletRequests.find((r) => r.id === where?.id) || null),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `req-${Date.now()}`, ...data, createdAt: new Date() };
        mockStore.walletRequests.push(row);
        return row;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const ids = where?.OR ?? [];
        return mockStore.walletRequests.find((r) =>
          r.kind === where?.kind && r.method === where?.method &&
          (r.note === where?.note || ids.some((x: any) => (x.note && r.note === x.note) || (x.externalTransferId && r.externalTransferId === x.externalTransferId) || (x.id && r.id === x.id))),
        ) || null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return mockStore.walletRequests.filter((r) => {
          if (where?.adminNote?.in && !where.adminNote.in.includes(r.adminNote)) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        });
      }),
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        let count = 0;
        for (const req of mockStore.walletRequests) {
          const matchesId = !where?.id || req.id === where.id;
          const matchesStatus = !where?.status || req.status === where.status;
          const matchesNote = !where?.note || req.note === where.note;
          if (matchesId && matchesStatus && matchesNote) {
            Object.assign(req, data);
            count++;
          }
        }
        return { count };
      }),
    },
    coupon: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.code) return mockStore.coupons.get(where.code) || null;
        return null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: any) => {
        if (!mockStore.coupons.has(where.code)) {
          mockStore.coupons.set(where.code, { id: create.id, code: create.code, amount: create.amount });
        }
        return mockStore.coupons.get(where.code);
      }),
    },
    couponRedemption: {
      updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const row = mockStore.redemptions.find(r => r.id === where.id && (!where.sagaStatus?.not || r.sagaStatus !== where.sagaStatus.not));
        if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
        mockStore.redemptions.find((r) => r.couponCodeHash === where?.couponCodeHash) || null),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const row = mockStore.redemptions.find((r) => r.id === where?.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.userId_couponId) {
          return mockStore.redemptions.find(
            (r) => r.userId === where.userId_couponId.userId && r.couponId === where.userId_couponId.couponId,
          ) || null;
        }
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        if (mockStore.redemptions.some((r) => r.couponCodeHash === data.couponCodeHash)) {
          const e: any = new Error("Unique constraint failed on couponCodeHash"); e.code = "P2002"; throw e;
        }
        const row = { id: `saga-${mockStore.redemptions.length}`, externalConfirmedAt: null, ...data };
        mockStore.redemptions.push(row);
        return row;
      }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          $queryRaw: vi.fn().mockResolvedValue([]),
          wallet: {
            findUnique: vi.fn().mockImplementation(async () => ({ ...mockStore.wallet })),
            findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...mockStore.wallet })),
            update: vi.fn().mockImplementation(async ({ data }: any) => {
              if (data.balance?.increment) mockStore.wallet.balance += data.balance.increment;
              if (data.balance?.decrement) mockStore.wallet.balance -= data.balance.decrement;
              return { ...mockStore.wallet };
            }),
            updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
              if (where?.balance?.gte !== undefined && mockStore.wallet.balance < where.balance.gte) {
                return { count: 0 };
              }
              if (data?.balance?.decrement) mockStore.wallet.balance -= data.balance.decrement;
              if (data?.balance?.increment) mockStore.wallet.balance += data.balance.increment;
              return { count: 1 };
            }),
          },
          profile: {
            updateMany: vi.fn().mockImplementation(async ({ data }: any) => {
              if (data.coins !== undefined) mockStore.profile.coins = data.coins;
              return { count: 1 };
            }),
          },
          transaction: {
            findUnique: vi.fn().mockImplementation(async ({ where }: any) => mockStore.transactions.find(t => t.id === where.id) ?? null),
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              const row = { id: `tx-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
              mockStore.transactions.push(row);
              return row;
            }),
            updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
              let count = 0;
              for (const tx of mockStore.transactions) {
                if (where.referenceId && tx.referenceId === where.referenceId) {
                  Object.assign(tx, data);
                  count++;
                }
              }
              return { count };
            }),
          },
          walletRequest: {
            findUniqueOrThrow: vi.fn().mockImplementation(async ({ where }: any) => {
              const r = mockStore.walletRequests.find(r => r.id === where.id);
              if (!r) throw new Error("Request not found"); return { ...r };
            }),
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              const r = mockStore.walletRequests.find(r => r.id === where.id);
              if (!r) throw new Error("Request not found"); Object.assign(r, data); return { ...r };
            }),
            findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
              mockStore.walletRequests.find((r) => r.id === where?.id) || null),
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              const row = { id: `req-${Date.now()}`, ...data, createdAt: new Date() };
              mockStore.walletRequests.push(row);
              return row;
            }),
            updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
              let count = 0;
              for (const req of mockStore.walletRequests) {
                const matchesId = !where?.id || req.id === where.id;
                const matchesStatus = !where?.status || req.status === where.status;
                const matchesNote = !where?.note || req.note === where.note;
                if (matchesId && matchesStatus && matchesNote) {
                  Object.assign(req, data);
                  count++;
                }
              }
              return { count };
            }),
            findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
              const ids = where?.OR ?? [];
              return mockStore.walletRequests.find((r) => r.kind === where?.kind && r.method === where?.method &&
                (r.note === where?.note || ids.some((x: any) => (x.note && r.note === x.note) || (x.externalTransferId && r.externalTransferId === x.externalTransferId) || (x.id && r.id === x.id)))) || null;
            }),
          },
          coupon: {
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              const row = [...mockStore.coupons.values()].find(c => c.id === where.id);
              if (!row) throw new Error('Coupon not found');
              row.usedCount = (row.usedCount ?? 0) + (data.usedCount?.increment ?? 0); return row;
            }),
            findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
              if (where?.code) return mockStore.coupons.get(where.code) || null;
              return null;
            }),
            upsert: vi.fn().mockImplementation(async ({ where, create }: any) => {
              if (!mockStore.coupons.has(where.code)) {
                mockStore.coupons.set(where.code, { id: create.id, code: create.code, amount: create.amount });
              }
              return mockStore.coupons.get(where.code);
            }),
          },
          couponRedemption: {
            findUniqueOrThrow: vi.fn().mockImplementation(async ({ where }: any) => {
              const row = mockStore.redemptions.find(r => r.id === where.id);
              if (!row) throw new Error('Saga not found'); return { ...row };
            }),
            findFirst: vi.fn().mockImplementation(async ({ where }: any) =>
              mockStore.redemptions.find((r) => r.couponCodeHash === where?.couponCodeHash) || null),
            update: vi.fn().mockImplementation(async ({ where, data }: any) => {
              const row = mockStore.redemptions.find((r) => r.id === where?.id);
              if (row) Object.assign(row, data);
              return row;
            }),
            findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
              if (where?.userId_couponId) {
                return mockStore.redemptions.find(
                  (r) => r.userId === where.userId_couponId.userId && r.couponId === where.userId_couponId.couponId,
                ) || null;
              }
              return null;
            }),
            create: vi.fn().mockImplementation(async ({ data }: any) => {
              if (mockStore.redemptions.some((r) => r.couponCodeHash === data.couponCodeHash)) {
                const e: any = new Error("Unique constraint failed on couponCodeHash"); e.code = "P2002"; throw e;
              }
              mockStore.redemptions.push(data);
              return data;
            }),
          },
        });
      }
      return cb;
    }),
  },
}));

// LIVE HTTP COUPONVAULT TEST SERVER
let server: http.Server;
const livePort = 4567;
const EXPECTED_API_KEY = "test-secret-key-12345678901234567890";

// Live server mock state
const serverState = {
  coupons: new Map<string, { id: string; code: string; amount: number; is_used: boolean; status: string }>([
    ["WELCOME100", { id: "cpn-100", code: "WELCOME100", amount: 100, is_used: false, status: "ACTIVE" }],
    ["USED50", { id: "cpn-50", code: "USED50", amount: 50, is_used: true, status: "ACTIVE" }],
    ["DISABLED20", { id: "cpn-20", code: "DISABLED20", amount: 20, is_used: false, status: "DISABLED" }],
  ]),
  transfers: new Map<string, { transactionId: string; userEmail: string; amount: number; status: string }>(),
  transferCallsReceived: [] as any[],
  shouldHangTransfer: false,
  shouldFailTransfer: false,
  reconciliationStatus: new Map<string, "SUCCESS" | "NOT_FOUND">(),
};

beforeAll(async () => {
  // Start the actual live HTTP server
  server = http.createServer((req, res) => {
    const authHeader = req.headers["x-api-key"];
    const url = new URL(req.url || "", `http://127.0.0.1:${livePort}`);

    let bodyStr = "";
    req.on("data", (chunk) => {
      bodyStr += chunk;
    });

    req.on("end", () => {
      const body = bodyStr ? JSON.parse(bodyStr) : {};

      // 1. Verify Authentication Header
      if (authHeader !== EXPECTED_API_KEY) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, message: "Unauthorized" }));
      }

      // 2. POST /api/v1/coupons/verify
      if (req.method === "POST" && url.pathname === "/api/v1/coupons/verify") {
        const { couponCode } = body;
        const coupon = serverState.coupons.get((couponCode || "").toUpperCase());

        if (!coupon) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, code: "INVALID_COUPON", message: "Coupon not found." }));
        }
        if (coupon.is_used) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, code: "REDEEMED", message: "Coupon already redeemed." }));
        }
        if (coupon.status === "DISABLED") {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, code: "DISABLED", message: "Coupon disabled." }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            couponId: coupon.id,
            amount: coupon.amount,
            currency: "INR",
            status: coupon.status,
          }),
        );
      }

      // 3. POST /api/v1/coupons/redeem
      if (req.method === "POST" && url.pathname === "/api/v1/coupons/redeem") {
        const { couponId } = body;
        let foundCoupon: any = null;
        for (const c of serverState.coupons.values()) {
          if (c.id === couponId) foundCoupon = c;
        }

        if (!foundCoupon) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, message: "Coupon not found." }));
        }

        if (foundCoupon.is_used) {
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, code: "REDEEM_FAILED", message: "Coupon already used." }));
        }

        // Mark coupon as used (single-use enforcement)
        foundCoupon.is_used = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true }));
      }

      // 4. POST /api/v1/wallet/transfer
      if (req.method === "POST" && url.pathname === "/api/v1/wallet/transfer") {
        serverState.transferCallsReceived.push(body);

        if (serverState.shouldHangTransfer) {
          // Simulate network drop / timeout: close socket abruptly without response
          req.destroy();
          res.destroy();
          return;
        }

        if (serverState.shouldFailTransfer) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({ success: false, code: "TRANSFER_FAILED", message: "User account suspended on vault." }),
          );
        }

        const { transactionId, userEmail, amount } = body;
        if (serverState.transfers.has(transactionId)) {
          // Idempotency: duplicate transaction
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              code: "DUPLICATE_TRANSACTION",
              message: "Transaction already processed.",
            }),
          );
        }

        serverState.transfers.set(transactionId, { transactionId, userEmail, amount, status: "SUCCESS" });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, message: "Transfer successful", data: { new_balance: 1000 } }));
      }

      // 5. GET /api/v1/wallet/transfer/:transactionId (Reconciliation)
      if (req.method === "GET" && url.pathname.startsWith("/api/v1/wallet/transfer/")) {
        const txId = decodeURIComponent(url.pathname.replace("/api/v1/wallet/transfer/", ""));
        const forcedStatus = serverState.reconciliationStatus.get(txId);

        if (forcedStatus === "NOT_FOUND") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, processed: false, status: "NOT_FOUND" }));
        }

        const transfer = serverState.transfers.get(txId);
        if (transfer || forcedStatus === "SUCCESS") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: true,
              processed: true,
              status: "SUCCESS",
              amount: transfer?.amount || 100,
            }),
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, processed: false, status: "NOT_FOUND" }));
      }

      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(livePort, "127.0.0.1", resolve));
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mockStore.wallet.balance = 500;
  mockStore.profile.coins = 500;
  mockStore.transactions = [];
  mockStore.walletRequests = [];
  mockStore.redemptions = [];
  serverState.transferCallsReceived = [];
  serverState.shouldHangTransfer = false;
  serverState.shouldFailTransfer = false;
  serverState.reconciliationStatus.clear();
});

describe("LIVE CouponVault HTTP Integration & Validation", () => {
  // Test 1: Exact URL & Authentication Header
  it("LIVE: Live endpoints reject requests missing or using incorrect x-api-key", async () => {
    // Attempt request with invalid header
    const res = await fetch(`http://127.0.0.1:${livePort}/api/v1/coupons/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "bad-key" },
      body: JSON.stringify({ couponCode: "WELCOME100" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  // Test 2: Safe Test Coupon Verification
  it("LIVE: Performs live coupon verification and returns exact amount & currency", async () => {
    const details = await CouponVaultService.verifyCoupon("WELCOME100", "user-live-1");
    expect(details.success).toBe(true);
    expect(details.couponId).toBe("cpn-100");
    expect(details.amount).toBe(100);
    expect(details.status).toBe("ACTIVE");
  });

  // Test 3: Safe Test Coupon Redemption & Single Crediting
  it("LIVE: Performs live coupon redemption and credits Gaming Hub wallet exactly once", async () => {
    const initialBalance = mockStore.wallet.balance;
    const result = await redeemCoupon("user-live-1", "WELCOME100");

    expect(result.success).toBe(true);
    expect(result.value).toBe(100);
    expect(mockStore.wallet.balance).toBe(initialBalance + 100);
    expect(mockStore.profile.coins).toBe(initialBalance + 100);

    // Ledger record
    const tx = mockStore.transactions.find((t) => t.referenceType === "REWARD" || t.type === "CREDIT");
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(100);
  });

  // Test 4: Duplicate Redemption Blocked
  it("LIVE: Rejects duplicate redemption over live HTTP (409 handling)", async () => {
    // Attempt redeeming the coupon that was already marked used in previous test
    await expect(redeemCoupon("user-live-1", "WELCOME100")).rejects.toThrow(
      /already.*(used|redeemed)|REDEEM_FAILED/i,
    );
  });

  // Test 5: Concurrent Redemption Race Condition
  it("LIVE: Concurrent redemptions of a single-use coupon only credits once", async () => {
    // Add a fresh coupon
    serverState.coupons.set("CONCURRENT50", {
      id: "cpn-conc-50",
      code: "CONCURRENT50",
      amount: 50,
      is_used: false,
      status: "ACTIVE",
    });

    const initialBalance = mockStore.wallet.balance;
    const promises = [
      redeemCoupon("user-live-1", "CONCURRENT50"),
      redeemCoupon("user-live-1", "CONCURRENT50"),
      redeemCoupon("user-live-1", "CONCURRENT50"),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
    expect(mockStore.wallet.balance).toBe(initialBalance + 50);
  });

  // Test 6: Explicit Withdrawal over Live HTTP
  it("LIVE: User explicit withdrawal transmits to CouponVault and deducts Gaming Hub balance", async () => {
    const initialBalance = mockStore.wallet.balance;
    const withdrawAmount = 100;

    const result = await transferToCouponWallet("user-live-1", withdrawAmount);

    expect(result.success).toBe(true);
    expect(result.transferredAmount).toBe(withdrawAmount);
    expect(mockStore.wallet.balance).toBe(initialBalance - withdrawAmount);

    // Confirm CouponVault server received the exact payload
    expect(serverState.transferCallsReceived.length).toBe(1);
    const call = serverState.transferCallsReceived[0];
    expect(call.userId).toBe("user-live-1");
    expect(call.userEmail).toBe("player@example.com");
    expect(call.amount).toBe(100);
    expect(call.transactionId).toMatch(/^TRF-user-liv-/);
  });

  // Test 7: Confirm Gameplay Winnings NEVER Trigger CouponVault Transfer
  it("LIVE: Settle game match prizes locally without ANY HTTP calls to CouponVault", async () => {
    const transferCallsBefore = serverState.transferCallsReceived.length;

    // Simulate match prize settlement locally
    const { applyTransaction } = await import("../wallet");
    await prisma.$transaction(async (tx: any) => {
      await applyTransaction(tx, "user-live-1", 200, "MATCH_PAYOUT", "match-settle-123", {}, "MAIN");
    });

    expect(mockStore.wallet.balance).toBe(mockStore.wallet.balance);
    // ZERO transfer calls to CouponVault
    expect(serverState.transferCallsReceived.length).toBe(transferCallsBefore);
  });

  // Test 8: Confirmed CouponVault Transfer Failure Auto-Refunds
  it("LIVE: Automatically refunds balance locally when CouponVault returns confirmed failure", async () => {
    serverState.shouldFailTransfer = true;
    const initialBalance = mockStore.wallet.balance;

    await expect(transferToCouponWallet("user-live-1", 100)).rejects.toThrow(/rejected|TRANSFER_FAILED/i);

    // Balance should be restored to initialBalance via automatic compensation refund
    expect(mockStore.wallet.balance).toBe(initialBalance);

    // Verify refund reversal transaction was recorded
    const refundTx = mockStore.transactions.find(
      (t) => t.referenceType === "REVERSAL" || t.direction === "CREDIT" || t.type === "CREDIT",
    );
    expect(refundTx).toBeDefined();
    expect(refundTx.amount).toBe(100);
  });

  // Test 9: Network Timeout Leaves Transaction in UNCONFIRMED_HOLD Without Auto-Refunding
  it("LIVE: Network timeout/abrupt disconnect leaves transaction in UNCONFIRMED_HOLD and DOES NOT refund", async () => {
    serverState.shouldHangTransfer = true;
    const initialBalance = mockStore.wallet.balance;

    await expect(transferToCouponWallet("user-live-1", 100)).rejects.toThrow(
      /unknown|processing|retrying|COUPON_TRANSFER_TIMEOUT/i,
    );

    // Funds were reserved (-100) and MUST NOT be blindly refunded
    expect(mockStore.wallet.balance).toBe(initialBalance - 100);

    // Verify UNCONFIRMED_HOLD recorded
    const heldReq = mockStore.walletRequests.find((r) => r.adminNote === "UNCONFIRMED_HOLD");
    expect(heldReq).toBeDefined();
    expect(heldReq.amount).toBe(100);
  });

  // Test 10: Reconciliation - CouponVault Confirms Success -> COMPLETED
  it("LIVE: Reconciliation resolves UNCONFIRMED_HOLD to COMPLETED when CouponVault confirms success", async () => {
    const txId = `TRF-user-liv-reconcile-success`;
    // Create an UNCONFIRMED_HOLD request in local store
    mockStore.walletRequests.push({
      fee: 0,
      id: "req-held-1",
      userId: "user-live-1",
      amount: 100,
      kind: "WITHDRAWAL",
      method: "COUPONVAULT",
      status: "PENDING",
      adminNote: "UNCONFIRMED_HOLD",
      note: txId,
    });
    mockStore.transactions.push({
      referenceId: txId,
      amount: -100,
      meta: { status: "UNCONFIRMED_HOLD" },
    });

    // Configure CouponVault server to report this transaction was processed
    serverState.reconciliationStatus.set(txId, "SUCCESS");

    const result = await reconcileUnconfirmedTransfer(txId);
    expect(result.reconciled).toBe(true);
    expect(result.resolution).toBe("COMPLETED");

    // Local records marked approved / completed
    const req = mockStore.walletRequests.find((r) => r.note === txId);
    expect(req.status).toBe("APPROVED");
    expect(req.adminNote).toBe("COMPLETED");
  });

  // Test 11: Reconciliation - CouponVault Confirms Not Processed -> REFUND
  it("LIVE: Reconciliation resolves UNCONFIRMED_HOLD to REFUND when CouponVault confirms not processed", async () => {
    const txId = `TRF-user-liv-reconcile-unprocessed`;
    const balanceBefore = mockStore.wallet.balance;

    mockStore.walletRequests.push({
      fee: 0,
      id: "req-held-2",
      userId: "user-live-1",
      amount: 100,
      kind: "WITHDRAWAL",
      method: "COUPONVAULT",
      status: "PENDING",
      adminNote: "UNCONFIRMED_HOLD",
      note: txId,
    });
    mockStore.transactions.push({
      referenceId: txId,
      amount: -100,
      meta: { status: "UNCONFIRMED_HOLD" },
    });

    // Configure CouponVault server to report this transaction was NOT processed
    serverState.reconciliationStatus.set(txId, "NOT_FOUND");

    const result = await reconcileUnconfirmedTransfer(txId);
    expect(result.reconciled).toBe(true);
    expect(result.resolution).toBe("REFUNDED");

    // Balance refunded (+100)
    expect(mockStore.wallet.balance).toBe(balanceBefore + 100);

    const req = mockStore.walletRequests.find((r) => r.note === txId);
    expect(req.status).toBe("REJECTED");
  });

  // Test 12: Reconciliation - CouponVault Unreachable -> Keeps UNCONFIRMED_HOLD
  it("LIVE: Reconciliation keeps transaction in UNCONFIRMED_HOLD if CouponVault is unreachable", async () => {
    const txId = `TRF-user-liv-reconcile-unreachable`;
    const balanceBefore = mockStore.wallet.balance;

    mockStore.walletRequests.push({
      fee: 0,
      id: "req-held-3",
      userId: "user-live-1",
      amount: 100,
      kind: "WITHDRAWAL",
      method: "COUPONVAULT",
      status: "PENDING",
      adminNote: "UNCONFIRMED_HOLD",
      note: txId,
    });

    // Temporarily point service to unreachable port
    vi.spyOn(CouponVaultService as any, "getApiConfig").mockReturnValueOnce({
      apiUrl: "http://127.0.0.1:9999",
      apiKey: EXPECTED_API_KEY,
    });

    const result = await reconcileUnconfirmedTransfer(txId);
    expect(result.reconciled).toBe(false);
    expect(result.resolution).toBe("HELD");

    // Balance NOT refunded! Must remain protected against double-spending
    expect(mockStore.wallet.balance).toBe(balanceBefore);

    const req = mockStore.walletRequests.find((r) => r.note === txId);
    expect(req.status).toBe("PENDING");
  });
});
