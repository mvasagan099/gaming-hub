import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  verifyAndSnapshotTournamentMatchResult,
  getTournamentResultSnapshot,
} from "../tournamentResultVerification";
import {
  createTournamentDispute,
  getDisputeDetail,
  listPlayerDisputes,
  listAdminDisputes,
  resolveTournamentDispute,
} from "../tournamentDisputeService";
import {
  buildSingleEliminationBracket,
  processMatchResult,
  finalizeTournament,
} from "../tournamentEngine";

describe("TOURNAMENT RESULT VERIFICATION & DISPUTE MANAGEMENT", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string, role: "USER" | "ADMIN" = "USER") {
    const id = `u_vd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `${emailPrefix}_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName,
        role,
        profile: { create: {} },
        wallet: { create: { balance: 5000 } },
      },
    });

    return user;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    playerCount: number;
    maxPlayers?: number;
    status?: "DRAFT" | "REGISTRATION_OPEN" | "IN_PROGRESS" | "COMPLETED";
  }) {
    const tournamentId = `tourn_vd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        seedMethod: "ADMIN_DEFINED",
        status: params.status ?? "IN_PROGRESS",
        entryFee: 50,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers ?? params.playerCount,
        startTime: new Date(Date.now() - 600_000),
        registrationStartsAt: new Date(Date.now() - 3600_000),
        registrationEndsAt: new Date(Date.now() - 1800_000),
      },
    });

    const players = [];
    for (let i = 0; i < params.playerCount; i++) {
      const p = await createTestPlayer(`Player ${i + 1}`, `vd_p${i + 1}`);
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId,
          userId: p.id,
          seed: i + 1,
          registeredAt: new Date(Date.now() - (params.playerCount - i) * 1000),
        },
      });
      players.push(p);
    }

    return { tournament, players };
  }

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournamentDispute.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentResultSnapshot.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentResultIdempotency.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPrize.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentRound.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdMatchIds.length > 0) {
      await prisma.tournamentDispute.deleteMany({
        where: { matchId: { in: createdMatchIds } },
      }).catch(() => undefined);
      await prisma.tournamentResultSnapshot.deleteMany({
        where: { matchId: { in: createdMatchIds } },
      }).catch(() => undefined);
      await prisma.matchPlayer.deleteMany({
        where: { matchId: { in: createdMatchIds } },
      }).catch(() => undefined);
      await prisma.match.deleteMany({
        where: { id: { in: createdMatchIds } },
      }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.appNotification.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.transaction.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.wallet.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.profile.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ===========================================================================
  // 1. Authoritative Result Verification & SHA256 Integrity Snapshot
  // ===========================================================================
  describe("1. Result Verification & Immutable Snapshot", () => {
    it("verifies authoritative match result, generates SHA256 integrity hash, and saves immutable snapshot", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Pro Master",
        gameId: "snooker",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      const slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1 },
      });
      expect(slot).toBeDefined();

      const match = await prisma.match.create({
        data: {
          gameId: "snooker",
          status: "FINISHED",
          winnerIds: [players[0].id],
          resultReason: "NORMAL",
          startedAt: new Date(Date.now() - 300_000),
          endedAt: new Date(),
        },
      });
      createdMatchIds.push(match.id);

      // Verify and snapshot result
      const verification = await verifyAndSnapshotTournamentMatchResult({
        tournamentId: tournament.id,
        roundId: slot!.id,
        matchId: match.id,
        winnerId: players[0].id,
        loserId: players[1].id,
        scores: { [players[0].id]: 75, [players[1].id]: 42 },
        resultReason: "NORMAL",
      });

      expect(verification.isVerified).toBe(true);
      expect(verification.reviewStatus).toBe("VERIFIED");
      expect(verification.integrityHash).toMatch(/^[a-f0-9]{64}$/);
      expect(verification.snapshot.playerAScore).toBe(75);
      expect(verification.snapshot.playerBScore).toBe(42);
      expect(verification.snapshot.winnerId).toBe(players[0].id);

      // Fetch snapshot by match ID
      const fetchedSnapshot = await getTournamentResultSnapshot(match.id);
      expect(fetchedSnapshot).toBeDefined();
      expect(fetchedSnapshot?.integrityHash).toBe(verification.integrityHash);
    });

    it("flags inconsistent result as RESULT_REVIEW_REQUIRED when declared winner has fewer points under NORMAL reason", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Chess Integrity Check",
        gameId: "chess",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      const slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1 },
      });

      const match = await prisma.match.create({
        data: {
          gameId: "chess",
          status: "FINISHED",
          winnerIds: [players[1].id],
          resultReason: "NORMAL",
        },
      });
      createdMatchIds.push(match.id);

      // Player 0 had 50 points, Player 1 had 20 points, but winner is claimed as Player 1 under NORMAL reason
      await expect(
        verifyAndSnapshotTournamentMatchResult({
          tournamentId: tournament.id,
          roundId: slot!.id,
          matchId: match.id,
          winnerId: players[1].id,
          loserId: players[0].id,
          scores: { [players[0].id]: 50, [players[1].id]: 20 },
          resultReason: "NORMAL",
        }),
      ).rejects.toThrow(/inconsistent with authoritative score records|RESULT_REVIEW_REQUIRED/);

      const snapshot = await getTournamentResultSnapshot(match.id);
      expect(snapshot?.reviewStatus).toBe("RESULT_REVIEW_REQUIRED");
      expect(snapshot?.isVerified).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Player Dispute Submission & Duplicate Protection
  // ===========================================================================
  describe("2. Player Dispute Submission & Duplicate Protection", () => {
    it("allows participant to file a match dispute with in-app & email notifications", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Table Tennis Clash",
        gameId: "table-tennis",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      const slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id },
      });

      const match = await prisma.match.create({
        data: {
          gameId: "table-tennis",
          status: "FINISHED",
          winnerIds: [players[0].id],
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      // Player 1 reports wrong result
      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "WRONG_RESULT",
        description: "My final shot hit the table edge and was counted out erroneously.",
        evidenceUrls: ["https://imgur.com/example-shot.png"],
      });

      expect(dispute.disputeId).toMatch(/^DISP-\d+/);
      expect(dispute.status).toBe("OPEN");
      expect(dispute.priority).toBe("CRITICAL"); // Final match of 2-player tourney
      expect(dispute.evidenceUrls).toHaveLength(1);

      // Verify in-app notification created
      const notif = await prisma.appNotification.findFirst({
        where: { userId: players[1].id, tournamentEventType: "DISPUTE_CREATED" },
      });
      expect(notif).toBeDefined();
    });

    it("rejects duplicate active dispute for the same match and player", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Carrom Duplicate Check",
        gameId: "carrom",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "carrom", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      // Submit first dispute
      await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "CONNECTION_ISSUE",
        description: "Server disconnected on my striker turn.",
      });

      // Submit duplicate dispute
      await expect(
        createTournamentDispute(players[1].id, {
          matchId: match.id,
          reason: "CONNECTION_ISSUE",
          description: "Trying to submit second dispute.",
        }),
      ).rejects.toThrow("You already have an active dispute open for this match");
    });

    it("rejects dispute submission when 10-minute window has expired", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Dispute Window Expired Tourney",
        gameId: "bubble-shooter",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      // Match ended 15 minutes ago (> 10-minute limit)
      const match = await prisma.match.create({
        data: {
          gameId: "bubble-shooter",
          status: "FINISHED",
          winnerIds: [players[0].id],
          endedAt: new Date(Date.now() - 15 * 60 * 1000),
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      await expect(
        createTournamentDispute(players[1].id, {
          matchId: match.id,
          reason: "WRONG_RESULT",
          description: "Disputing 15 minutes after match ended.",
        }),
      ).rejects.toThrow(/dispute reporting window for this match has expired/);
    });

    it("rejects dispute submission containing dangerous executable file extensions", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Malicious Evidence Check",
        gameId: "ludo",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "ludo", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      await expect(
        createTournamentDispute(players[1].id, {
          matchId: match.id,
          reason: "SUSPECTED_CHEATING",
          description: "Attaching exploit script proof.",
          evidenceUrls: ["https://evil-site.com/exploit.exe"],
        }),
      ).rejects.toThrow(/Executable or dangerous file types/);
    });

    it("rejects dispute submission from non-participating outsider", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Ludo Closed Match",
        gameId: "ludo",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "ludo", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      const outsider = await createTestPlayer("Outsider", "outsider_disp");

      await expect(
        createTournamentDispute(outsider.id, {
          matchId: match.id,
          reason: "OTHER",
          description: "I am trying to dispute someone else's match.",
        }),
      ).rejects.toThrow("You can only dispute matches you participated in");
    });
  });

  // ===========================================================================
  // 3. Admin Dispute Queue & Resolution (Confirm, Reject, Override)
  // ===========================================================================
  describe("3. Admin Review & Controlled Result Override", () => {
    it("allows admin to review dispute, inspect snapshot, and confirm valid result", async () => {
      const admin = await createTestPlayer("Admin Reviewer", "admin_rev", "ADMIN");
      const { tournament, players } = await createTestTournament({
        title: "Ludo Blitz Cup",
        gameId: "ludo",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "ludo", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "INCORRECT_SCORE",
        description: "Review my 6-run boundary at ball 4.",
      });

      // Admin views dispute detail
      const detail = await getDisputeDetail(dispute.disputeId, admin.id, true);
      expect(detail.disputeId).toBe(dispute.disputeId);
      expect(detail.match.id).toBe(match.id);

      // Admin confirms server result
      const resolved = await resolveTournamentDispute(admin.id, dispute.disputeId, {
        action: "CONFIRM_RESULT",
        adminNotes: "Replay review confirms ball was caught on the boundary line.",
      });

      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolutionAction).toBe("CONFIRM_RESULT");
      expect(resolved.adminNotes).toBe("Replay review confirms ball was caught on the boundary line.");
    });

    it("allows admin to reject invalid dispute with clear resolution status", async () => {
      const admin = await createTestPlayer("Admin Rejecter", "admin_rej", "ADMIN");
      const { tournament, players } = await createTestTournament({
        title: "Snooker Reject Test",
        gameId: "snooker",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "snooker", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "OTHER",
        description: "I accidentally potted the cue ball.",
      });

      const rejected = await resolveTournamentDispute(admin.id, dispute.disputeId, {
        action: "REJECT_DISPUTE",
        adminNotes: "Self-inflicted cue ball in-off foul is valid game rule.",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.resolutionAction).toBe("REJECT_DISPUTE");
    });

    it("executes controlled result override with bracket reconciliation and audit log", async () => {
      const admin = await createTestPlayer("Admin Super", "admin_super", "ADMIN");
      const { tournament, players } = await createTestTournament({
        title: "Fruit Ninja Championship",
        gameId: "fruit-ninja",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "fruit-ninja", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: {
          matchId: match.id,
          winnerId: players[0].id,
          playerAScore: 100,
          playerBScore: 80,
          status: "COMPLETED",
        },
      });

      // Verify and snapshot initial result
      await verifyAndSnapshotTournamentMatchResult({
        tournamentId: tournament.id,
        roundId: slot!.id,
        matchId: match.id,
        winnerId: players[0].id,
        scores: { [players[0].id]: 100, [players[1].id]: 80 },
      });

      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "GAME_STATE_ISSUE",
        description: "Opponent hit a bomb on final combo frame causing negative points glitch.",
      });

      // Admin overrides result to Player 1 (newWinner)
      const overrideResult = await resolveTournamentDispute(admin.id, dispute.disputeId, {
        action: "OVERRIDE_RESULT",
        newWinnerId: players[1].id,
        newScoreA: 100,
        newScoreB: 125,
        justificationReason: "Video and state recording shows player 1 completed 125 slice combo before frame freeze.",
        adminNotes: "Override confirmed by integrity review board.",
      });

      expect(overrideResult.status).toBe("RESOLVED");
      expect(overrideResult.resolutionAction).toBe("OVERRIDE_RESULT");

      // Verify round slot updated
      const updatedSlot = await prisma.tournamentRound.findUnique({ where: { id: slot!.id } });
      expect(updatedSlot?.winnerId).toBe(players[1].id);
      expect(updatedSlot?.playerBScore).toBe(125);

      // Verify snapshot updated to OVERRIDDEN
      const updatedSnapshot = await getTournamentResultSnapshot(match.id);
      expect(updatedSnapshot?.reviewStatus).toBe("OVERRIDDEN");
      expect(updatedSnapshot?.winnerId).toBe(players[1].id);
      expect(updatedSnapshot?.resultReason).toBe("ADMIN_OVERRIDE");

      // Verify audit log created
      const auditEntry = await prisma.auditLog.findFirst({
        where: { action: "tournament.result.override", targetId: match.id },
      });
      expect(auditEntry).toBeDefined();
    });

    it("reconciles already-advanced player slot in subsequent round upon result override", async () => {
      const admin = await createTestPlayer("Admin Bracket", "admin_brk", "ADMIN");
      const { tournament, players } = await createTestTournament({
        title: "4-Player Advancement Recovery",
        gameId: "table-tennis",
        playerCount: 4,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      // Round 1 Slot 1
      const r1Slot1 = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1, matchNumber: 1 },
      });
      expect(r1Slot1).toBeDefined();
      const pAId = r1Slot1!.playerAId!;
      const pBId = r1Slot1!.playerBId!;

      // Match 1
      const m1 = await prisma.match.create({
        data: { gameId: "table-tennis", status: "FINISHED", winnerIds: [pAId] },
      });
      createdMatchIds.push(m1.id);

      await prisma.tournamentRound.update({
        where: { id: r1Slot1!.id },
        data: { matchId: m1.id },
      });

      // Process match result (Player A won, advances to Round 2)
      await processMatchResult({
        tournamentId: tournament.id,
        roundId: r1Slot1!.id,
        matchId: m1.id,
        winnerId: pAId,
        loserId: pBId,
        scores: { [pAId]: 11, [pBId]: 9 },
      });

      // Verify Player A is in next slot
      const r2Slot = await prisma.tournamentRound.findUnique({
        where: { id: r1Slot1!.nextSlotId! },
      });
      expect(r2Slot?.playerAId).toBe(pAId);

      // Player B disputes Match 1
      const dispute = await createTournamentDispute(pBId, {
        matchId: m1.id,
        reason: "WRONG_RESULT",
        description: "Official score card correction.",
      });

      // Admin overrides result to Player B
      await resolveTournamentDispute(admin.id, dispute.disputeId, {
        action: "OVERRIDE_RESULT",
        newWinnerId: pBId,
        newScoreA: 9,
        newScoreB: 11,
        justificationReason: "Review shows player B won match point 11-9.",
      });

      // Verify that Round 2 slot was automatically reconciled to Player B
      const updatedR2Slot = await prisma.tournamentRound.findUnique({
        where: { id: r1Slot1!.nextSlotId! },
      });
      expect(updatedR2Slot?.playerAId).toBe(pBId);
    });

    it("halts premature tournament completion while final match is under active dispute", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Final Dispute Protection Cup",
        gameId: "chess",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "chess", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      // Open dispute on final match
      await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "GAME_STATE_ISSUE",
        description: "Fifty-move rule draw was not recognized.",
      });

      // Attempt to finalize tournament
      await finalizeTournament(tournament.id);

      // Tournament should NOT have transitioned to COMPLETED
      const t = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      expect(t?.status).toBe("IN_PROGRESS");
    });
  });

  // ===========================================================================
  // 4. Admin Queue Filtering & Player Isolation
  // ===========================================================================
  describe("4. Admin Queue Filtering & Player Isolation", () => {
    it("filters disputes by status, priority, and isolates player views", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Filter Queue Tournament",
        gameId: "ludo",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId: "ludo", status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "SUSPECTED_CHEATING",
        description: "Opponent rolled consecutive sixes abnormally.",
      });

      // Player lists their own disputes
      const playerList = await listPlayerDisputes(players[1].id);
      expect(playerList.some((d) => d.disputeId === dispute.disputeId)).toBe(true);

      // Other player cannot see this dispute in list
      const otherList = await listPlayerDisputes(players[0].id);
      expect(otherList.some((d) => d.disputeId === dispute.disputeId)).toBe(false);

      // Admin queries dispute queue
      const adminQueue = await listAdminDisputes({
        status: "OPEN",
        priority: "CRITICAL",
        tournamentId: tournament.id,
        page: 1,
        pageSize: 10,
      });

      expect(adminQueue.items.some((d) => d.disputeId === dispute.disputeId)).toBe(true);
      expect(adminQueue.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 5. Available Games Compatibility
  // ===========================================================================
  describe("5. Verification & Dispute Coverage Across Available Games", () => {
    const allGames = [
      "snake-ladder",
      "ludo",
      "chess",
      "fruit-ninja",
      "bubble-shooter",
      "table-tennis",
      "snake-vs-worms",
      "carrom",
      "snooker",
    ];

    it.each(allGames)("runs authoritative result verification and dispute lifecycle for game: %s", async (gameId) => {
      const { tournament, players } = await createTestTournament({
        title: `${gameId} Tournament Cup`,
        gameId,
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const slot = await prisma.tournamentRound.findFirst({ where: { tournamentId: tournament.id } });

      const match = await prisma.match.create({
        data: { gameId, status: "FINISHED", winnerIds: [players[0].id] },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId: match.id },
      });

      // Verify match
      const verification = await verifyAndSnapshotTournamentMatchResult({
        tournamentId: tournament.id,
        roundId: slot!.id,
        matchId: match.id,
        winnerId: players[0].id,
        scores: { [players[0].id]: 60, [players[1].id]: 45 },
        resultReason: "NORMAL",
      });

      expect(verification.isVerified).toBe(true);
      expect(verification.integrityHash).toBeDefined();

      // Submit dispute
      const dispute = await createTournamentDispute(players[1].id, {
        matchId: match.id,
        reason: "WRONG_RESULT",
        description: `Dispute verification for ${gameId}`,
      });

      expect(dispute.status).toBe("OPEN");
    });
  });
});
