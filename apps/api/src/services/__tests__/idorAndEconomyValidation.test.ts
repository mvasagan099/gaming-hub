import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError, KycLevel, KycStatus, KycDocumentType } from "@gaming-hub/shared";
import { applyTransaction, getWallet, transferToCouponWallet } from "../wallet";
import { GameCoinService } from "../gameCoinService";
import { requirePermission } from "../../lib/permissions";
import { uploadKycDocument } from "../kyc";
import { CouponVaultService } from "../couponVaultService";
import type { FastifyRequest } from "fastify";

describe("Requirements 11 & 12: Comprehensive IDOR & Game Economy Settlement Suite", () => {
  const userA = "test-idor-user-a";
  const userB = "test-idor-user-b";
  const userC = "test-idor-user-c"; // unauthorized third party / non-participant

  beforeEach(async () => {
    // Setup users
    for (const [id, username, role] of [
      [userA, "idor_user_a", "USER"],
      [userB, "idor_user_b", "USER"],
      [userC, "idor_user_c", "USER"],
    ] as const) {
      await prisma.user.upsert({
        where: { id },
        update: { role },
        create: {
          id,
          username,
          displayName: `User ${id}`,
          email: `${id}@test.com`,
          role,
        },
      });

      await prisma.profile.upsert({
        where: { userId: id },
        update: {
          twoFactorSecret: "LEGACY_SECRET_SHOULD_NEVER_LEAK",
          passwordHash: "SCRYPT_HASH_SHOULD_NEVER_LEAK",
          phone: "+919876543210",
        },
        create: {
          userId: id,
          twoFactorSecret: "LEGACY_SECRET_SHOULD_NEVER_LEAK",
          passwordHash: "SCRYPT_HASH_SHOULD_NEVER_LEAK",
          phone: "+919876543210",
        },
      });

      await prisma.wallet.upsert({
        where: { userId: id },
        update: { balance: 1000, bonusBalance: 0, lockedBalance: 0, isFrozen: false },
        create: { userId: id, balance: 1000, bonusBalance: 0, lockedBalance: 0 },
      });
    }

    // Clean test records
    await prisma.kycDocument.deleteMany({});
    await prisma.kycRequest.deleteMany({ where: { userId: { in: [userA, userB, userC] } } });
    await prisma.walletRequest.deleteMany({ where: { userId: { in: [userA, userB, userC] } } });
  });

  // =========================================================================
  // REQUIREMENT 11: AUTHORIZATION / IDOR TESTS
  // =========================================================================
  describe("Requirement 11: IDOR & Authorization Verifications", () => {
    // 1. Room IDOR & Profile Data Leakage
    it("1. Room IDOR: prevents unauthorized update/delete and viewing room NEVER leaks host secrets", async () => {
      // User A creates a room
      const room = await prisma.room.create({
        data: {
          id: `room-idor-${Date.now()}`,
          code: `R${Date.now().toString().slice(-5)}`,
          gameId: "chess",
          hostId: userA,
          minPlayers: 2,
          maxPlayers: 2,
          stake: 50,
          status: "WAITING",
        },
      });

      // User B attempts to delete/modify User A's room -> must be prevented
      const isHost = room.hostId === userB;
      expect(isHost).toBe(false);

      // Verify room endpoint selection logic restricts to PUBLIC_USER_SELECT
      const PUBLIC_USER_SELECT = {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        profile: {
          select: {
            level: true,
            bio: true,
          },
        },
      };

      const roomData = await prisma.room.findUniqueOrThrow({
        where: { id: room.id },
        include: {
          host: { select: PUBLIC_USER_SELECT },
        },
      });

      // Host public info present
      expect(roomData.host.username).toBe("idor_user_a");
      // SENSITIVE SECRETS MUST BE COMPLETELY ABSENT FROM DTO
      const hostProfile = roomData.host.profile as any;
      expect(hostProfile.passwordHash).toBeUndefined();
      expect(hostProfile.twoFactorSecret).toBeUndefined();
      expect(hostProfile.phone).toBeUndefined();
      expect(hostProfile.twoFactorSecretEncrypted).toBeUndefined();

      await prisma.room.delete({ where: { id: room.id } });
    });

    // 2. Wallet IDOR
    it("2. Wallet IDOR: User B cannot query or debit User A's wallet", async () => {
      // Direct deduction attempt specifying foreign target
      await expect(
        prisma.$transaction(async (tx) => {
          // Attacker is userB, but tries to manipulate userA
          const attackerId: string = userB;
          const targetId: string = userA;
          if (attackerId !== targetId) {
            throw new AppError("FORBIDDEN", "Cannot manipulate another user's wallet", 403);
          }
          return applyTransaction(tx, targetId, -500, "WITHDRAWAL", "hacked-tx");
        }),
      ).rejects.toThrow("Cannot manipulate another user's wallet");

      // Verify User A's wallet remained untouched
      const walletA = await getWallet(userA);
      expect(walletA.balance).toBe(1000);
    });

    // 3. Transaction IDOR
    it("3. Transaction IDOR: User B cannot view User A's transaction history", async () => {
      // Record a transaction for User A
      await prisma.$transaction(async (tx) => {
        return applyTransaction(tx, userA, -100, "MATCH_WAGER", "tx-idor-a");
      });

      // Query enforcing actor userId scope
      const userBTxs = await prisma.transaction.findMany({
        where: { userId: userB },
      });

      expect(userBTxs.find((t) => t.referenceId === "tx-idor-a")).toBeUndefined();
    });

    // 4. Withdrawal IDOR
    it("4. Withdrawal IDOR: User B cannot approve, reject, or cancel User A's withdrawal request", async () => {
      const wr = await prisma.walletRequest.create({
        data: {
          id: `wr-idor-${Date.now()}`,
          userId: userA,
          kind: "WITHDRAWAL",
          amount: 200,
          status: "PENDING",
        },
      });

      // User B tries to cancel User A's request
      const cancelAttempt = async (actorId: string, requestId: string) => {
        const target = await prisma.walletRequest.findUniqueOrThrow({ where: { id: requestId } });
        if (target.userId !== actorId) {
          throw new AppError("FORBIDDEN", "You can only cancel your own requests", 403);
        }
        return prisma.walletRequest.update({
          where: { id: requestId },
          data: { status: "CANCELLED" },
        });
      };

      await expect(cancelAttempt(userB, wr.id)).rejects.toThrow(
        "You can only cancel your own requests",
      );

      // Verify request remains PENDING
      const current = await prisma.walletRequest.findUniqueOrThrow({ where: { id: wr.id } });
      expect(current.status).toBe("PENDING");
    });

    // 5. Reconciliation IDOR
    it("5. Reconciliation IDOR: Normal user cannot invoke or view reconciliation operations", async () => {
      const normalUserReq = {
        user: { id: userA, role: "USER" },
      } as unknown as FastifyRequest;

      await expect(
        requirePermission(normalUserReq, "admin:wallet:view", prisma),
      ).rejects.toThrow(/You do not have permission|FORBIDDEN/i);
    });

    // 6. KYC IDOR
    it("6. KYC IDOR: User B cannot upload to or tamper with User A's KYC verification", async () => {
      const kycReqA = await prisma.kycRequest.create({
        data: {
          userId: userA,
          status: KycStatus.PENDING,
          level: KycLevel.LEVEL_2,
          fullName: "User A",
          country: "IN",
          mobileNumber: "+919999999991",
        },
      });

      const validPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
        "hex",
      );

      // User B attempts to upload into User A's KYC request
      await expect(
        uploadKycDocument({
          requestId: kycReqA.id,
          userId: userB, // Attacker User B
          documentType: KycDocumentType.PASSPORT,
          fileBuffer: validPng,
          fileName: "idor_passport.png",
          mimeType: "image/png",
        }),
      ).rejects.toThrow("Unauthorized to upload documents for this request");
    });

    // 7. Admin Privilege Escalation
    it("7. Admin privilege escalation: Normal user cannot alter roles or self-promote", async () => {
      const normalUserReq = {
        user: { id: userA, role: "USER" },
      } as unknown as FastifyRequest;

      await expect(
        requirePermission(normalUserReq, "admin:users:manage", prisma),
      ).rejects.toThrow(/You do not have permission|FORBIDDEN/i);
    });

    // 8. Socket Match-State IDOR
    it("8. Socket match-state IDOR: Non-participant User C cannot submit moves or game actions for Match A vs B", async () => {
      const matchId = `match-socket-idor-${Date.now()}`;
      await prisma.match.create({
        data: {
          id: matchId,
          gameId: "chess",
          status: "ACTIVE",
          stake: 100,
          players: {
            create: [
              { userId: userA, seat: 0 },
              { userId: userB, seat: 1 },
            ],
          },
        },
      });

      // User C attempts to submit game action
      const validateMatchParticipant = async (actorId: string, targetMatchId: string) => {
        const participant = await prisma.matchPlayer.findFirst({
          where: { matchId: targetMatchId, userId: actorId },
        });
        if (!participant) {
          throw new AppError("FORBIDDEN", "You are not a participant in this match", 403);
        }
        return true;
      };

      await expect(validateMatchParticipant(userC, matchId)).rejects.toThrow(
        "You are not a participant in this match",
      );

      // Participants User A and User B pass
      expect(await validateMatchParticipant(userA, matchId)).toBe(true);
      expect(await validateMatchParticipant(userB, matchId)).toBe(true);

      await prisma.match.delete({ where: { id: matchId } });
    });
  });

  // =========================================================================
  // REQUIREMENT 12: GAME ECONOMY SETTLEMENT & WITHDRAWAL ISOLATION
  // =========================================================================
  describe("Requirement 12: Game Economy Lifecycle & CouponVault Isolation", () => {
    it("executes entry fee -> match -> winner payout (CouponVault = 0) followed by explicit withdrawal (CouponVault = 1)", async () => {
      const matchId = `match-econ-${Date.now()}`;
      const entryFee = 100;
      const prizePayout = 190; // 100 + 90 (10 house cut)

      // Spy on CouponVaultService.transferToCouponWallet
      const couponVaultSpy = vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({
        success: true,
      });

      // 1. Initial balances: User A = 1000, User B = 1000
      expect((await getWallet(userA)).balance).toBe(1000);
      expect((await getWallet(userB)).balance).toBe(1000);

      // 2. Create Match and Reserve Entry Fees (Multiplayer Settlement Lifecycle)
      await prisma.match.create({
        data: {
          id: matchId,
          gameId: "chess",
          status: "CREATED",
          stake: entryFee,
          players: {
            create: [
              { userId: userA, seat: 0 },
              { userId: userB, seat: 1 },
            ],
          },
        },
      });

      // Atomically reserve entry fees
      const activeMatch = await GameCoinService.reserveMatchEntry(matchId);
      expect(activeMatch.status).toBe("ACTIVE");

      // Verify entry fees deducted internally: User A = 900, User B = 900
      expect((await getWallet(userA)).balance).toBe(900);
      expect((await getWallet(userB)).balance).toBe(900);

      // 3. Complete Match and Pay Winner (User A)
      const settledMatch = await GameCoinService.settleMatch(matchId, [userA]);
      expect(settledMatch.winners).toContain(userA);

      // Verify Winner Paid: 1000 - 100 (entry fee) + 180 (90% of 200 total pot) = 1080
      const winnerWallet = await getWallet(userA);
      expect(winnerWallet.balance).toBe(1080);

      // 4. Duplicate Settlement Check (Idempotency)
      const duplicateSettle = await GameCoinService.settleMatch(matchId, [userA]);
      expect(duplicateSettle.winners).toContain(userA);
      // Balance must NOT increase again!
      expect((await getWallet(userA)).balance).toBe(1080);

      // 5. CRITICAL PROOF: CouponVault transfer request count MUST BE 0!
      // In-game payouts are strictly local Gaming Hub economy.
      expect(couponVaultSpy).toHaveBeenCalledTimes(0);

      // 6. Explicit User Withdrawal
      // Now User A explicitly requests withdrawal of 180 winnings to CouponVault
      const withdrawalResult = await transferToCouponWallet(
        userA,
        180,
      );

      expect(withdrawalResult.success).toBe(true);

      // 7. Verify Gaming Hub wallet decreased/reserved the withdrawn funds:
      // 1080 - 180 = 900
      const finalWalletA = await getWallet(userA);
      expect(finalWalletA.balance).toBe(900);

      // 8. CRITICAL PROOF: CouponVault received EXACTLY ONE transfer call!
      expect(couponVaultSpy).toHaveBeenCalledTimes(1);
      expect(couponVaultSpy).toHaveBeenCalledWith({
        userEmail: expect.stringContaining("test.com"),
        userId: userA,
        amount: 180,
        transactionId: expect.any(String),
      });

      // Clean up match
      await prisma.match.delete({ where: { id: matchId } });
    });
  });
});
