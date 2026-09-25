import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { GameResultSecurityService } from "../gameResultSecurityService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { registerForTournament } from "../tournaments";
import { env } from "../../env";

describe("Feature 8: Server-Authoritative Game Result Security", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance,
          },
        },
        profile: {
          create: {},
        },
      },
    });

    return userId;
  }

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Fake Winner Attempt (Client Direct Declaration Rejection)
  // ---------------------------------------------------------------------------
  it("1. Fake winner: client directly declaring victory or settlement is rejected with FORBIDDEN", async () => {
    const userA = await createTestUser("u-sec-win-a", 1000);
    const userB = await createTestUser("u-sec-win-b", 1000);
    const matchId = `match-sec-1-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Attacker client attempts to declare themselves winner directly
    await expect(
      GameResultSecurityService.validateAndSettleAuthoritativeResult({
        matchId,
        caller: "CLIENT",
        winnerIds: [userA],
      })
    ).rejects.toThrow(/FORBIDDEN|Clients cannot directly declare/i);

    // Verify match is still ACTIVE and no coins were awarded
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 2. Fake Winner with Non-Participant ID
  // ---------------------------------------------------------------------------
  it("2. Fake winner: reporting winner who is not in match is rejected with VALIDATION_ERROR", async () => {
    const userA = await createTestUser("u-sec-p-a", 1000);
    const userB = await createTestUser("u-sec-p-b", 1000);
    const userC = await createTestUser("u-sec-intruder", 1000);
    const matchId = `match-sec-fake-winner-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await expect(
      GameResultSecurityService.validateAndSettleAuthoritativeResult({
        matchId,
        caller: "INTERNAL_SOCKET",
        internalKey: env.INTERNAL_API_KEY,
        winnerIds: [userC], // Not a seated player
      })
    ).rejects.toThrow(/VALIDATION_ERROR|not a player/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Fake Reward Tampering (Disregards Client-Supplied Coin Values)
  // ---------------------------------------------------------------------------
  it("3. Fake reward: client-supplied coinsWon is ignored, server calculates authoritative prize pool", async () => {
    const userA = await createTestUser("u-sec-rew-a", 1000);
    const userB = await createTestUser("u-sec-rew-b", 1000);
    const matchId = `match-sec-fakereward-${Date.now()}`;

    // 2 players @ 100 stake = total pot 200, 90% prize pool = 180
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Socket server reports match finished, attacker tried to inject clientSuppliedCoinsWon = 999999
    const result = await GameResultSecurityService.validateAndSettleAuthoritativeResult({
      matchId,
      caller: "INTERNAL_SOCKET",
      internalKey: env.INTERNAL_API_KEY,
      winnerIds: [userA],
      clientSuppliedCoinsWon: 999999, // Should be completely ignored!
    });

    expect(result.status).toBe("SETTLED");
    expect(result.totalPot).toBe(200);
    expect(result.prizePool).toBe(180);

    // Winner gets 180 coins -> balance = 900 + 180 = 1080 (never 900 + 999999)
    expect((await getWallet(userA)).balance).toBe(1080);
  });

  // ---------------------------------------------------------------------------
  // 4. Opponent Move Rejection (Turn-Based Games)
  // ---------------------------------------------------------------------------
  it("4. Opponent move: player attempting to move during opponent's turn is rejected with FORBIDDEN", async () => {
    const userA = await createTestUser("u-turn-a", 1000);
    const userB = await createTestUser("u-turn-b", 1000);
    const matchId = `match-turn-sec-${Date.now()}`;

    // userA is seat 0 (turn), userB is seat 1
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userB tries to submit action when it is seat 0's turn
    await expect(
      GameResultSecurityService.validateAction({
        matchId,
        userId: userB,
        action: { type: "move", from: "e7", to: "e5" },
        currentTurnSeat: 0,
      })
    ).rejects.toThrow(/FORBIDDEN|not your turn/i);

    // userA acting on seat 0 succeeds
    const validMove = await GameResultSecurityService.validateAction({
      matchId,
      userId: userA,
      action: { type: "move", from: "e2", to: "e4" },
      currentTurnSeat: 0,
    });
    expect(validMove.ok).toBe(true);
    expect(validMove.seat).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Stale Move Sequence Rejection
  // ---------------------------------------------------------------------------
  it("5. Stale move: action with obsolete sequenceNumber is rejected with STALE_ACTION", async () => {
    const userA = await createTestUser("u-stale-a", 1000);
    const userB = await createTestUser("u-stale-b", 1000);
    const matchId = `match-stale-sec-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Server state is at version 10, client sends action based on state version 8
    await expect(
      GameResultSecurityService.validateAction({
        matchId,
        userId: userA,
        action: { type: "roll_dice", sequenceNumber: 8 },
        expectedStateVersion: 10,
      })
    ).rejects.toThrow(/STALE_ACTION|stale/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Non-Participant / Wrong Match ID Action Rejection
  // ---------------------------------------------------------------------------
  it("6. Non-participant: action from user not seated in match is rejected with FORBIDDEN", async () => {
    const userA = await createTestUser("u-seat-a", 1000);
    const userB = await createTestUser("u-seat-b", 1000);
    const intruder = await createTestUser("u-intruder", 1000);
    const matchId = `match-nonpart-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await expect(
      GameResultSecurityService.validateAction({
        matchId,
        userId: intruder,
        action: { type: "strike", force: 50 },
      })
    ).rejects.toThrow(/FORBIDDEN|not a seated player/i);
  });

  // ---------------------------------------------------------------------------
  // 7. Forged Internal Key Rejection
  // ---------------------------------------------------------------------------
  it("7. Forged internal API key: requests without valid internal key are rejected with UNAUTHORIZED", async () => {
    const userA = await createTestUser("u-auth-a", 1000);
    const userB = await createTestUser("u-auth-b", 1000);
    const matchId = `match-forged-key-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await expect(
      GameResultSecurityService.validateAndSettleAuthoritativeResult({
        matchId,
        caller: "INTERNAL_SOCKET",
        internalKey: "forged-fake-key-12345",
        winnerIds: [userA],
      })
    ).rejects.toThrow(/UNAUTHORIZED|Invalid or missing internal API key/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Fake Tournament Bracket Advancement Rejection
  // ---------------------------------------------------------------------------
  it("8. Fake tournament bracket result: client advancing tournament bracket is rejected with FORBIDDEN", async () => {
    const userA = await createTestUser("u-tadv-a", 1000);
    const tournamentId = `tourn-sec-test-${Date.now()}`;

    await expect(
      GameResultSecurityService.validateTournamentMatchResult({
        tournamentId,
        matchId: "match-123",
        roundId: "round-1",
        winnerId: userA,
        caller: "CLIENT",
      })
    ).rejects.toThrow(/FORBIDDEN|Clients cannot directly advance/i);
  });

  // ---------------------------------------------------------------------------
  // 9. Authoritative Forfeit Execution
  // ---------------------------------------------------------------------------
  it("9. Authoritative forfeit: player surrender settles match cleanly for remaining participants", async () => {
    const userA = await createTestUser("u-ff-a", 1000);
    const userB = await createTestUser("u-ff-b", 1000);
    const matchId = `match-forfeit-sec-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "snake-ladder", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "snake-ladder", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userA forfeits
    const summary = await GameResultSecurityService.validateForfeit({
      matchId,
      forfeitingUserId: userA,
      reason: "player_resignation",
    });

    expect(summary.status).toBe("SETTLED");
    expect(summary.winners).toEqual([userB]);
    expect((await getWallet(userB)).balance).toBe(1080);
    expect((await getWallet(userA)).balance).toBe(900);
  });
});
