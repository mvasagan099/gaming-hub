import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { MatchAbandonmentService } from "../matchAbandonmentService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { MatchRecoveryService } from "../matchRecoveryService";

describe("Feature 11: Abandoned Match Detection & Handling", () => {
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
  // 1. Disconnect + Reconnect (No Immediate Loss)
  // ---------------------------------------------------------------------------
  it("1. Disconnect + reconnect: temporary disconnect is not an immediate loss and match continues", async () => {
    const userA = await createTestUser("u-ab-1-a", 1000);
    const userB = await createTestUser("u-ab-1-b", 1000);
    const matchId = `match-ab-1-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userA temporarily disconnects
    const dc = await MatchAbandonmentService.registerDisconnect({ matchId, userId: userA });
    expect(dc.ok).toBe(true);
    expect(dc.status).toBe("DISCONNECTED");

    // Match remains ACTIVE (not forfeited!)
    let match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");

    // userA reconnects within grace window
    const rc = await MatchAbandonmentService.registerReconnect({ matchId, userId: userA });
    expect(rc.ok).toBe(true);
    expect(rc.status).toBe("CONNECTED");

    match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 2. Disconnect + Grace Window Expiration (Authoritative Forfeit)
  // ---------------------------------------------------------------------------
  it("2. Disconnect + timeout: grace window expiration settles match for remaining player", async () => {
    const userA = await createTestUser("u-ab-2-a", 1000);
    const userB = await createTestUser("u-ab-2-b", 1000);
    const matchId = `match-ab-2-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Disconnected 40 seconds ago (grace window = 30s)
    const disconnectedAt = new Date(Date.now() - 40000);

    const abRes = await MatchAbandonmentService.processAbandonment({
      matchId,
      userId: userA,
      caller: "SYSTEM_WORKER",
      disconnectedAt,
      reason: "reconnect_grace_expired",
    });

    expect(abRes.ok).toBe(true);
    expect(abRes.status).toBe("SETTLED");
    expect(abRes.winners).toEqual([userB]);

    // userB gets 180 coins -> balance = 1080
    expect((await getWallet(userB)).balance).toBe(1080);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 3. Reconnect After Deadline (Presents Loss Without Restart)
  // ---------------------------------------------------------------------------
  it("3. Reconnect after deadline: user sees finalized loss, match does not restart", async () => {
    const userA = await createTestUser("u-ab-3-a", 1000);
    const userB = await createTestUser("u-ab-3-b", 1000);
    const matchId = `match-ab-3-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Abandonment processed
    await MatchAbandonmentService.processAbandonment({
      matchId,
      userId: userA,
      caller: "SYSTEM_WORKER",
      disconnectedAt: new Date(Date.now() - 40000),
    });

    // userA comes back late
    const recRes = await MatchRecoveryService.reconnectMatch({ matchId, userId: userA });
    expect(recRes.ok).toBe(true);
    expect(recRes.status).toBe("FINISHED");
    expect(recRes.outcome).toBe("LOSS");

    // Match remains FINISHED, balances unchanged
    expect((await getWallet(userA)).balance).toBe(900);
    expect((await getWallet(userB)).balance).toBe(1080);
  });

  // ---------------------------------------------------------------------------
  // 4. Duplicate Abandonment Protection
  // ---------------------------------------------------------------------------
  it("4. Duplicate abandonment: repeated triggers are idempotent with 0 extra payouts", async () => {
    const userA = await createTestUser("u-ab-4-a", 1000);
    const userB = await createTestUser("u-ab-4-b", 1000);
    const matchId = `match-ab-4-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const disconnectedAt = new Date(Date.now() - 40000);

    const [res1, res2] = await Promise.all([
      MatchAbandonmentService.processAbandonment({ matchId, userId: userA, caller: "SYSTEM_WORKER", disconnectedAt }),
      MatchAbandonmentService.processAbandonment({ matchId, userId: userA, caller: "SYSTEM_WORKER", disconnectedAt }),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);

    // Winner gets exactly 1 payout: 1080
    expect((await getWallet(userB)).balance).toBe(1080);
  });

  // ---------------------------------------------------------------------------
  // 5. Malicious Client Attempt Rejection
  // ---------------------------------------------------------------------------
  it("5. Malicious client: client cannot force-abandon an opponent", async () => {
    const userA = await createTestUser("u-ab-5-a", 1000);
    const userB = await createTestUser("u-ab-5-b", 1000);
    const matchId = `match-ab-5-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Attacker client attempts to declare userA abandoned
    await expect(
      MatchAbandonmentService.processAbandonment({
        matchId,
        userId: userA,
        caller: "CLIENT",
      })
    ).rejects.toThrow(/FORBIDDEN|Clients cannot trigger/i);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Force-Forfeit with Audit Log
  // ---------------------------------------------------------------------------
  it("6. Admin force-forfeit: executes forfeit settlement and records audit log", async () => {
    const userA = await createTestUser("u-ab-6-a", 1000);
    const userB = await createTestUser("u-ab-6-b", 1000);
    const admin = await createTestUser("u-ab-admin", 1000);
    const matchId = `match-ab-6-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const res = await MatchAbandonmentService.processAdminForceForfeit({
      matchId,
      userId: userA,
      adminId: admin,
      reason: "confirmed_toxic_abandonment",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("SETTLED");
    expect(res.winners).toEqual([userB]);

    // Audit log was created
    const log = await prisma.auditLog.findFirst({
      where: { targetId: matchId, action: "FORCE_FORFEIT_MATCH" },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(admin);
  });
});
