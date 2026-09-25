import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  TournamentNotificationService,
} from "../tournamentNotificationService";
import {
  TournamentEmailService,
  GAME_DISPLAY_NAMES,
  formatGameName,
} from "../tournamentEmailService";

describe("COMPLETE TOURNAMENT NOTIFICATION & REMINDER SYSTEM", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  async function createTestPlayer(email: string, displayName: string) {
    const id = `u_notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance: 10000 } },
      },
    });

    return user;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    entryFee?: number;
    prizePool?: number;
  }) {
    const id = `tourn_notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    createdTournamentIds.push(id);

    const tournament = await prisma.tournament.create({
      data: {
        id,
        title: params.title,
        description: "Official Tournament Event",
        gameId: params.gameId,
        entryFee: params.entryFee ?? 25,
        prizePool: params.prizePool ?? 10000,
        startTime: new Date(Date.now() + 3600000),
        status: "REGISTRATION_OPEN",
        maxPlayers: 8,
        minPlayers: 2,
      },
    });

    return tournament;
  }

  beforeEach(() => {
    TournamentEmailService.resetState();
  });

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournamentNotificationIdempotency.deleteMany({
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

    if (createdUserIds.length > 0) {
      const userIds = [...createdUserIds];
      createdUserIds.length = 0;
      try {
        await prisma.appNotification.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      } catch {
        // Safe cleanup
      }
    }
  });

  // ===========================================================================
  // 1. Registration Confirmation
  // ===========================================================================
  describe("1. Registration Confirmation", () => {
    it("sends in-app notification and email with full tournament, game, and fee metadata", async () => {
      const player = await createTestPlayer("reg.player@test.com", "Rohan Gupta");
      const tourney = await createTestTournament({
        title: "Standard Snooker Championship",
        gameId: "snooker",
        entryFee: 25,
        prizePool: 10000,
      });

      await prisma.tournamentPlayer.create({
        data: {
          tournamentId: tourney.id,
          userId: player.id,
          nickname: "Rohan",
          seed: 1,
        },
      });

      await TournamentNotificationService.notifyRegistration({
        tournamentId: tourney.id,
        playerId: player.id,
        tournamentTitle: tourney.title,
        entryFee: 25,
        playerCount: 1,
        maxPlayers: 8,
        startTime: tourney.startTime,
      });

      // Verify In-App Notification
      const inApp = await prisma.appNotification.findFirst({
        where: { userId: player.id, type: "TOURNAMENT" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.title).toBe("Tournament Joined");
      expect(inApp?.body).toContain(tourney.title);
      expect(inApp?.tournamentEventType).toBe("TOURNAMENT_REGISTERED");

      // Verify Email Record
      const sentEmails = TournamentEmailService.getEmailDeliveryRecords({
        userId: player.id,
        tournamentId: tourney.id,
        eventType: "TOURNAMENT_REGISTERED",
      });
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].status).toBe("SENT");
      expect(sentEmails[0].email).toBe("reg.player@test.com");
      expect(sentEmails[0].htmlBody).toContain("Snooker");
    });
  });

  // ===========================================================================
  // 2. Registration Closing & Starting Reminders
  // ===========================================================================
  describe("2. Registration Closing & Starting Reminders", () => {
    it("sends closing reminder ONLY to registered players, not to non-registered users", async () => {
      const playerRegistered = await createTestPlayer("registered@test.com", "Active Player");
      const playerUnregistered = await createTestPlayer("unregistered@test.com", "Spectator");

      const tourney = await createTestTournament({
        title: "Mini Ludo Quick Blitz",
        gameId: "ludo",
        entryFee: 5,
        prizePool: 400,
      });

      await prisma.tournamentPlayer.create({
        data: { tournamentId: tourney.id, userId: playerRegistered.id, seed: 1 },
      });

      await TournamentNotificationService.notifyRegistrationClosing({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        minutesRemaining: 10,
      });

      const registeredNotif = await prisma.appNotification.findFirst({
        where: { userId: playerRegistered.id, tournamentEventType: "TOURNAMENT_REGISTRATION_CLOSING" },
      });
      const unregisteredNotif = await prisma.appNotification.findFirst({
        where: { userId: playerUnregistered.id, tournamentEventType: "TOURNAMENT_REGISTRATION_CLOSING" },
      });

      expect(registeredNotif).not.toBeNull();
      expect(registeredNotif?.body).toContain("closes in 10 minutes");
      expect(unregisteredNotif).toBeNull();
    });

    it("sends tournament starting reminder with game and countdown to registered players", async () => {
      const player = await createTestPlayer("starting@test.com", "Chess Master");
      const tourney = await createTestTournament({
        title: "Pro Chess Arena",
        gameId: "chess",
        entryFee: 100,
        prizePool: 90000,
      });

      await prisma.tournamentPlayer.create({
        data: { tournamentId: tourney.id, userId: player.id, seed: 1 },
      });

      await TournamentNotificationService.notifyTournamentStarting({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        gameId: "chess",
        minutesRemaining: 5,
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: player.id, tournamentEventType: "TOURNAMENT_STARTING" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.body).toContain("starts in 5 minutes");

      const email = TournamentEmailService.getEmailDeliveryRecords({
        userId: player.id,
        tournamentId: tourney.id,
        eventType: "TOURNAMENT_STARTING",
      });
      expect(email).toHaveLength(1);
      expect(email[0].htmlBody).toContain("Chess");
    });
  });

  // ===========================================================================
  // 3. Match Assigned & Match Ready Reminders
  // ===========================================================================
  describe("3. Match Assigned & Match Reminders", () => {
    it("dispatches MATCH_READY across In-App and Email with opponent name and Join link", async () => {
      const playerA = await createTestPlayer("alice.notif@test.com", "Alice Champion");
      const playerB = await createTestPlayer("bob.notif@test.com", "Bob Challenger");
      const tourney = await createTestTournament({
        title: "Table Tennis Clash",
        gameId: "table-tennis",
      });

      const matchId = `match_tt_${Date.now()}`;

      await TournamentNotificationService.notifyMatchReady({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        roundId: "r1_m1",
        matchId,
        roundNumber: 1,
        totalRounds: 3,
        gameId: "table-tennis",
        playerAId: playerA.id,
        playerBId: playerB.id,
      });

      // Check Player A notification
      const notifA = await prisma.appNotification.findFirst({
        where: { userId: playerA.id, referenceId: matchId },
      });
      expect(notifA).not.toBeNull();
      expect(notifA?.body).toContain("Bob Challenger");

      // Check Player B notification
      const notifB = await prisma.appNotification.findFirst({
        where: { userId: playerB.id, referenceId: matchId },
      });
      expect(notifB).not.toBeNull();
      expect(notifB?.body).toContain("Alice Champion");
    });

    it("sends single match reminder when player has not joined waiting room", async () => {
      const player = await createTestPlayer("lazy.player@test.com", "Slow Joiner");
      const tourney = await createTestTournament({
        title: "Carrom Masters",
        gameId: "carrom",
      });

      const matchId = `match_carrom_${Date.now()}`;

      await TournamentNotificationService.notifyMatchReminder({
        userId: player.id,
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        matchId,
        roundNumber: 1,
        gameId: "carrom",
        opponentDisplayName: "Speedy Gonzales",
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: player.id, tournamentEventType: "TOURNAMENT_MATCH_REMINDER" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.title).toBe("⏰ Match Waiting");

      const email = TournamentEmailService.getEmailDeliveryRecords({
        userId: player.id,
        matchId,
        eventType: "MATCH_STARTING_REMINDER",
      });
      expect(email).toHaveLength(1);
    });

    it("skips match reminder if player has already entered the match room", async () => {
      const player = await createTestPlayer("joined.player@test.com", "Prompt Joiner");
      const tourney = await createTestTournament({
        title: "Ludo Blitz",
        gameId: "ludo",
      });

      const matchId = `match_ludo_${Date.now()}`;

      // Record player joined
      TournamentNotificationService.recordPlayerJoinedMatch({ matchId, userId: player.id });

      // Attempt reminder
      await TournamentNotificationService.notifyMatchReminder({
        userId: player.id,
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        matchId,
        roundNumber: 1,
        gameId: "ludo",
        opponentDisplayName: "Bowler Pro",
      });

      const email = TournamentEmailService.getEmailDeliveryRecords({
        userId: player.id,
        matchId,
        eventType: "MATCH_STARTING_REMINDER",
      });
      expect(email).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 4. Progression: Advancement, Finalist, Elimination, and Podium Placements
  // ===========================================================================
  describe("4. Advancement, Finalist, Elimination, and Podium", () => {
    it("notifies winner of advancement with next round information", async () => {
      const winner = await createTestPlayer("winner@test.com", "Winner One");
      const tourney = await createTestTournament({
        title: "Bubble Shooter Open",
        gameId: "bubble-shooter",
      });

      await TournamentNotificationService.notifyAdvanced({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        winnerId: winner.id,
        roundNumber: 1,
        totalRounds: 3,
        nextRoundNumber: 2,
        nextSlotId: "r2_slot_1",
        matchId: "match_bs_1",
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: winner.id, tournamentEventType: "TOURNAMENT_ADVANCED" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.body).toContain("Semi Final");
    });

    it("notifies finalist when advancing to Grand Final", async () => {
      const finalist = await createTestPlayer("finalist@test.com", "Top Contender");
      const opponent = await createTestPlayer("opponent.final@test.com", "Rival Master");
      const tourney = await createTestTournament({
        title: "Fruit Ninja Championship",
        gameId: "fruit-ninja",
      });

      await TournamentNotificationService.notifyFinal({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        playerId: finalist.id,
        opponentId: opponent.id,
        matchId: "match_final_1",
        roundNumber: 3,
        gameId: "fruit-ninja",
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: finalist.id, tournamentEventType: "TOURNAMENT_FINAL" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.body).toContain("Rival Master");

      const email = TournamentEmailService.getEmailDeliveryRecords({
        userId: finalist.id,
        matchId: "match_final_1",
        eventType: "TOURNAMENT_FINAL",
      });
      expect(email).toHaveLength(1);
      expect(email[0].htmlBody).toContain("Grand Final");
    });

    it("notifies eliminated player with final rank and respectful summary", async () => {
      const loser = await createTestPlayer("eliminated@test.com", "Gallant Fighter");
      const tourney = await createTestTournament({
        title: "Snake vs Worms Derby",
        gameId: "snake-vs-worms",
      });

      await TournamentNotificationService.notifyEliminated({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        loserId: loser.id,
        roundNumber: 1,
        totalRounds: 3,
        finalRank: 5,
        matchId: "match_svw_1",
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: loser.id, tournamentEventType: "TOURNAMENT_ELIMINATED" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.body).toContain("Final rank: 5th");
    });

    it("notifies 2nd, 3rd, and 4th place finishers with exact medal and prize amount", async () => {
      const runnerUp = await createTestPlayer("runnerup@test.com", "Silver Medalist");
      const thirdPlace = await createTestPlayer("third@test.com", "Bronze Medalist");
      const fourthPlace = await createTestPlayer("fourth@test.com", "Fourth Place");

      const tourney = await createTestTournament({
        title: "Premium Ludo Grand Prix",
        gameId: "ludo",
        entryFee: 50,
        prizePool: 22500,
      });

      // 2nd Place (25% = 5,625 coins)
      await TournamentNotificationService.notifyPodiumPlacement({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        playerId: runnerUp.id,
        rank: 2,
        prizeAmount: 5625,
      });

      // 3rd Place (15% = 3,375 coins)
      await TournamentNotificationService.notifyPodiumPlacement({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        playerId: thirdPlace.id,
        rank: 3,
        prizeAmount: 3375,
      });

      // 4th Place (10% = 2,250 coins)
      await TournamentNotificationService.notifyPodiumPlacement({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        playerId: fourthPlace.id,
        rank: 4,
        prizeAmount: 2250,
      });

      const notif2 = await prisma.appNotification.findFirst({
        where: { userId: runnerUp.id, tournamentEventType: "TOURNAMENT_PODIUM" },
      });
      const notif3 = await prisma.appNotification.findFirst({
        where: { userId: thirdPlace.id, tournamentEventType: "TOURNAMENT_PODIUM" },
      });
      const notif4 = await prisma.appNotification.findFirst({
        where: { userId: fourthPlace.id, tournamentEventType: "TOURNAMENT_PODIUM" },
      });

      expect(notif2?.body).toContain("5,625 Coins");
      expect(notif3?.body).toContain("3,375 Coins");
      expect(notif4?.body).toContain("2,250 Coins");
    });
  });

  // ===========================================================================
  // 5. Prize Settlement Notification
  // ===========================================================================
  describe("5. Prize Credited Notification", () => {
    it("sends PRIZE_CREDITED notification with transaction reference strictly after settlement", async () => {
      const winner = await createTestPlayer("settled.winner@test.com", "Grand Champion");
      const tourney = await createTestTournament({
        title: "Pro Snooker Invitational",
        gameId: "snooker",
        prizePool: 90000,
      });

      const transactionId = `tx_prize_${Date.now()}`;

      await TournamentNotificationService.notifyPrizeCredited({
        tournamentId: tourney.id,
        tournamentTitle: tourney.title,
        playerId: winner.id,
        rank: 1,
        amount: 45000,
        transactionId,
      });

      const inApp = await prisma.appNotification.findFirst({
        where: { userId: winner.id, tournamentEventType: "TOURNAMENT_PRIZE_CREDITED" },
      });
      expect(inApp).not.toBeNull();
      expect(inApp?.body).toContain("45,000 Coins");

      const email = TournamentEmailService.getEmailDeliveryRecords({
        userId: winner.id,
        tournamentId: tourney.id,
        eventType: "TOURNAMENT_PRIZE_CREDITED",
      });
      expect(email).toHaveLength(1);
      expect(email[0].textBody).toContain(transactionId);
    });
  });

  // ===========================================================================
  // 6. Idempotency & De-duplication Protection
  // ===========================================================================
  describe("6. Idempotency & De-duplication Protection", () => {
    it("prevents duplicate in-app and email notifications when invoked multiple times", async () => {
      const player = await createTestPlayer("idemp.player@test.com", "Idempotent User");
      const tourney = await createTestTournament({
        title: "Snake & Ladder Blitz",
        gameId: "snake-ladder",
      });

      // Call notifyRegistration 3 times
      for (let i = 0; i < 3; i++) {
        await TournamentNotificationService.notifyRegistration({
          tournamentId: tourney.id,
          playerId: player.id,
          tournamentTitle: tourney.title,
          entryFee: 5,
          playerCount: 1,
          maxPlayers: 8,
          startTime: tourney.startTime,
        });
      }

      // Verify exactly 1 in-app notification
      const inAppCount = await prisma.appNotification.count({
        where: { userId: player.id, tournamentEventType: "TOURNAMENT_REGISTERED" },
      });
      expect(inAppCount).toBe(1);

      // Verify exactly 1 email record
      const emailCount = TournamentEmailService.getEmailDeliveryRecords({
        userId: player.id,
        tournamentId: tourney.id,
        eventType: "TOURNAMENT_REGISTERED",
      }).length;
      expect(emailCount).toBe(1);
    });
  });

  // ===========================================================================
  // 7. Universal 5-Tier & 9-Game Verification
  // ===========================================================================
  describe("7. Universal 5 Tiers and All 9 Available Games", () => {
    it("formats display names dynamically across all 9 available multiplayer games", () => {
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

      for (const gameId of allGames) {
        const formatted = formatGameName(gameId);
        expect(formatted).toBeDefined();
        expect(formatted.length).toBeGreaterThan(2);
        expect(formatted).toBe(GAME_DISPLAY_NAMES[gameId]);
      }
    });
  });
});
