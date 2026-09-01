import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  TournamentEmailService,
  GAME_DISPLAY_NAMES,
  formatGameName,
} from "../tournamentEmailService";
import { TournamentNotificationService } from "../tournamentNotificationService";

describe("TOURNAMENT EMAIL REMINDER & MATCH-READY SYSTEM", () => {
  const createdUserIds: string[] = [];

  async function createTestUserWithEmail(email: string, displayName: string) {
    const id = `u_email_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
        wallet: { create: { balance: 1000 } },
      },
    });

    return user;
  }

  async function createTestUserWithoutEmail(displayName: string) {
    const id = `u_noemail_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: null,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance: 1000 } },
      },
    });

    return user;
  }

  beforeEach(() => {
    TournamentEmailService.resetState();
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ===========================================================================
  // 1. Email Source & Privacy Security
  // ===========================================================================
  describe("1. Email Source & Privacy Security", () => {
    it("uses verified user.email stored in user profile without asking for another email", async () => {
      const user = await createTestUserWithEmail("player.reg@gaminghub.test", "Mani Player");
      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: user.id,
        tournamentId: "tourn_src_1",
        tournamentTitle: "Snooker Masters Cup",
        gameId: "snooker",
      });

      expect(record.status).toBe("SENT");
      expect(record.email).toBe("player.reg@gaminghub.test");
      expect(record.userId).toBe(user.id);
    });

    it("never exposes opponent email address in match assigned emails", async () => {
      const playerA = await createTestUserWithEmail("player.a.secret@test.com", "Alice Champion");
      const playerB = await createTestUserWithEmail("player.b.private@test.com", "Bob Challenger");

      const record = await TournamentEmailService.sendMatchAssignedEmail({
        userId: playerA.id,
        tournamentId: "tourn_sec_1",
        tournamentTitle: "Chess Grand Prix",
        matchId: "match_sec_100",
        roundNumber: "Quarter Final",
        gameId: "chess",
        opponentDisplayName: playerB.displayName,
      });

      expect(record.status).toBe("SENT");
      expect(record.email).toBe("player.a.secret@test.com");
      expect(record.textBody).not.toContain("player.b.private@test.com");
      expect(record.htmlBody).not.toContain("player.b.private@test.com");
      expect(record.subject).not.toContain("player.b.private@test.com");
      expect(record.textBody).toContain("Bob Challenger");
      expect(record.htmlBody).toContain("Bob Challenger");
    });

    it("gracefully handles users without registered email (SKIPPED_NO_EMAIL)", async () => {
      const userNoEmail = await createTestUserWithoutEmail("Guest User");

      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: userNoEmail.id,
        tournamentId: "tourn_noemail_1",
        tournamentTitle: "Ludo Knockout",
        gameId: "ludo",
      });

      expect(record.status).toBe("SKIPPED_NO_EMAIL");
      expect(record.email).toBe("");
    });
  });

  // ===========================================================================
  // 2. Email Event Flow & Reminders
  // ===========================================================================
  describe("2. Full Email Event Flow", () => {
    it("1. Registration email contains player name, tournament title, game name, and view link", async () => {
      const user = await createTestUserWithEmail("flow.reg@test.local", "Vikram");
      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Cricket Premier League",
        gameId: "cricket",
      });

      expect(record.subject).toBe("Tournament Registration Confirmed");
      expect(record.textBody).toContain("Hi Vikram");
      expect(record.textBody).toContain("Cricket Premier League");
      expect(record.textBody).toContain("Cricket");
      expect(record.textBody).toContain("/tournaments/tourn_flow_1");
    });

    it("2. Tournament started email notifies registered players", async () => {
      const user = await createTestUserWithEmail("flow.start@test.local", "Sara");
      const record = await TournamentEmailService.sendTournamentStartedEmail({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Carrom Championship",
      });

      expect(record.subject).toBe("Carrom Championship Has Started");
      expect(record.textBody).toContain("Your tournament has started.");
      expect(record.textBody).toContain("You will receive another email when your match and opponent are assigned.");
    });

    it("3. Match assigned email contains round, opponent, and safe join URL", async () => {
      const user = await createTestUserWithEmail("flow.match@test.local", "David");
      const record = await TournamentEmailService.sendMatchAssignedEmail({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Snooker Open",
        matchId: "match_flow_10",
        roundNumber: "Round 1",
        gameId: "snooker",
        opponentDisplayName: "John Doe",
      });

      expect(record.subject).toBe("Your Snooker Tournament Match Is Ready");
      expect(record.textBody).toContain("Round 1");
      expect(record.textBody).toContain("John Doe");
      expect(record.textBody).toContain("/tournaments/tourn_flow_1/matches/match_flow_10");
      expect(record.htmlBody).toContain("JOIN MATCH");
    });

    it("4. Match starting reminder sent when player has NOT joined", async () => {
      const user = await createTestUserWithEmail("flow.rem@test.local", "Ravi");
      const record = await TournamentEmailService.sendMatchStartingReminder({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Table Tennis Open",
        matchId: "match_flow_20",
        roundNumber: "Round 1",
        gameId: "table-tennis",
        opponentDisplayName: "Priya",
      });

      expect(record).not.toBeNull();
      expect(record?.subject).toBe("Your Tournament Match Starts Soon");
      expect(record?.textBody).toContain("Your Table Tennis match is waiting for you.");
      expect(record?.textBody).toContain("Priya");
    });

    it("5. Match starting reminder suppressed if player has already joined the match", async () => {
      const user = await createTestUserWithEmail("flow.joined@test.local", "Elena");
      TournamentEmailService.recordPlayerJoined({ matchId: "match_flow_30", userId: user.id });

      const record = await TournamentEmailService.sendMatchStartingReminder({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Bubble Shooter Cup",
        matchId: "match_flow_30",
        roundNumber: "Round 1",
        gameId: "bubble-shooter",
        opponentDisplayName: "Alex",
      });

      expect(record).toBeNull();
    });

    it("6. Opponent ready email sent if player has not joined, but suppressed if player already joined", async () => {
      const userA = await createTestUserWithEmail("flow.opp1@test.local", "Player One");
      const userB = await createTestUserWithEmail("flow.opp2@test.local", "Player Two");

      // Player One has not joined -> receives opponent ready email
      const recA = await TournamentEmailService.sendOpponentReadyEmail({
        userId: userA.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Fruit Ninja Frenzy",
        matchId: "match_flow_40",
        roundNumber: "Round 2",
        opponentDisplayName: "Player Two",
      });
      expect(recA).not.toBeNull();
      expect(recA?.subject).toBe("Your Tournament Match Is Starting Soon");

      // Player Two joins
      TournamentEmailService.recordPlayerJoined({ matchId: "match_flow_40", userId: userB.id });

      // Player Two should NOT receive opponent ready email
      const recB = await TournamentEmailService.sendOpponentReadyEmail({
        userId: userB.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Fruit Ninja Frenzy",
        matchId: "match_flow_40",
        roundNumber: "Round 2",
        opponentDisplayName: "Player One",
      });
      expect(recB).toBeNull();
    });

    it("7. Match forfeited email sent if player did not join within allowed time", async () => {
      const user = await createTestUserWithEmail("flow.forfeit@test.local", "Late Player");
      const record = await TournamentEmailService.sendMatchForfeitedEmail({
        userId: user.id,
        tournamentId: "tourn_flow_1",
        tournamentTitle: "Chess Classic",
        gameId: "chess",
        roundNumber: "Round 1",
        opponentDisplayName: "Grandmaster Y",
        matchId: "match_flow_50",
      });

      expect(record.subject).toBe("Tournament Match Forfeited — Chess Classic");
      expect(record.textBody).toContain("Your tournament match has ended because you did not join within the allowed time.");
      expect(record.textBody).toContain("Grandmaster Y");
    });
  });

  // ===========================================================================
  // 3. Email Idempotency Protection
  // ===========================================================================
  describe("3. Email Idempotency Protection", () => {
    it("does not send duplicate emails for the same userId, tournamentId, matchId, and eventType", async () => {
      const user = await createTestUserWithEmail("idempotent.test@test.local", "Idem User");

      const first = await TournamentEmailService.sendMatchAssignedEmail({
        userId: user.id,
        tournamentId: "tourn_idem_1",
        tournamentTitle: "Snake & Ladder Cup",
        matchId: "match_idem_10",
        roundNumber: "Round 1",
        gameId: "snake-ladder",
        opponentDisplayName: "Rival",
      });

      const second = await TournamentEmailService.sendMatchAssignedEmail({
        userId: user.id,
        tournamentId: "tourn_idem_1",
        tournamentTitle: "Snake & Ladder Cup",
        matchId: "match_idem_10",
        roundNumber: "Round 1",
        gameId: "snake-ladder",
        opponentDisplayName: "Rival",
      });

      expect(first.notificationId).toBe(second.notificationId);
      const allRecords = TournamentEmailService.getEmailDeliveryRecords({
        userId: user.id,
        tournamentId: "tourn_idem_1",
        eventType: "TOURNAMENT_MATCH_ASSIGNED",
      });
      expect(allRecords).toHaveLength(1);
    });

    it("strictly limits match starting reminder to ONE reminder per assigned match", async () => {
      const user = await createTestUserWithEmail("reminder.limit@test.local", "Remindee");

      const first = await TournamentEmailService.sendMatchStartingReminder({
        userId: user.id,
        tournamentId: "tourn_rem_1",
        tournamentTitle: "Snake vs Worms Derby",
        matchId: "match_rem_100",
        roundNumber: "Round 2",
        gameId: "snake-vs-worms",
        opponentDisplayName: "Opponent 1",
      });

      const second = await TournamentEmailService.sendMatchStartingReminder({
        userId: user.id,
        tournamentId: "tourn_rem_1",
        tournamentTitle: "Snake vs Worms Derby",
        matchId: "match_rem_100",
        roundNumber: "Round 2",
        gameId: "snake-vs-worms",
        opponentDisplayName: "Opponent 1",
      });

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.notificationId).toBe(second?.notificationId);

      const reminders = TournamentEmailService.getEmailDeliveryRecords({
        userId: user.id,
        matchId: "match_rem_100",
        eventType: "MATCH_STARTING_REMINDER",
      });
      expect(reminders).toHaveLength(1);
    });
  });

  // ===========================================================================
  // 4. Delivery Status Tracking, Retries, and Fail-Safe Isolation
  // ===========================================================================
  describe("4. Delivery Status Tracking & Failure Isolation", () => {
    it("tracks PENDING -> SENT with attempt count and timestamps", async () => {
      const user = await createTestUserWithEmail("tracking.test@test.local", "Tracker");

      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: user.id,
        tournamentId: "tourn_track_1",
        tournamentTitle: "Ludo Knockout",
        gameId: "ludo",
      });

      expect(record.status).toBe("SENT");
      expect(record.attemptCount).toBe(1);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.sentAt).toBeInstanceOf(Date);
      expect(record.error).toBeNull();
    });

    it("retries on transient failure up to maximum attempts and succeeds on retry", async () => {
      const user = await createTestUserWithEmail("retry.test@test.local", "Retryer");

      // Simulate 1 transient failure before succeeding
      TournamentEmailService.setMockFailure("RETRYABLE_ERROR", 1);

      const record = await TournamentEmailService.sendTournamentStartedEmail({
        userId: user.id,
        tournamentId: "tourn_retry_1",
        tournamentTitle: "Chess Cup",
      });

      expect(record.status).toBe("SENT");
      expect(record.attemptCount).toBe(2); // Attempt 1 failed, Attempt 2 succeeded
      expect(record.sentAt).toBeInstanceOf(Date);
    });

    it("marks status as FAILED on fatal bounce without throwing or blocking", async () => {
      const user = await createTestUserWithEmail("bounce.test@test.local", "Bouncer");

      // Simulate fatal mailbox bounce
      TournamentEmailService.setMockFailure("FATAL_BOUNCE", 1);

      const record = await TournamentEmailService.sendTournamentStartedEmail({
        userId: user.id,
        tournamentId: "tourn_bounce_1",
        tournamentTitle: "Chess Cup",
      });

      expect(record.status).toBe("FAILED");
      expect(record.attemptCount).toBe(1);
      expect(record.error).toContain("550");
    });
  });

  // ===========================================================================
  // 5. Admin Monitoring & Delivery Querying
  // ===========================================================================
  describe("5. Admin Monitoring & Delivery Querying", () => {
    it("allows querying email delivery status by user, tournament, match, event, and status", async () => {
      const userA = await createTestUserWithEmail("admin.query.a@test.local", "Alice");
      const userB = await createTestUserWithEmail("admin.query.b@test.local", "Bob");

      await TournamentEmailService.sendRegistrationEmail({
        userId: userA.id,
        tournamentId: "tourn_mon_10",
        tournamentTitle: "Snooker Masters",
        gameId: "snooker",
      });

      await TournamentEmailService.sendMatchAssignedEmail({
        userId: userA.id,
        tournamentId: "tourn_mon_10",
        tournamentTitle: "Snooker Masters",
        matchId: "match_mon_99",
        roundNumber: "Final",
        gameId: "snooker",
        opponentDisplayName: "Bob",
      });

      await TournamentEmailService.sendMatchAssignedEmail({
        userId: userB.id,
        tournamentId: "tourn_mon_10",
        tournamentTitle: "Snooker Masters",
        matchId: "match_mon_99",
        roundNumber: "Final",
        gameId: "snooker",
        opponentDisplayName: "Alice",
      });

      const userARecords = TournamentEmailService.getEmailDeliveryRecords({ userId: userA.id });
      expect(userARecords).toHaveLength(2);

      const matchRecords = TournamentEmailService.getEmailDeliveryRecords({ matchId: "match_mon_99" });
      expect(matchRecords).toHaveLength(2);

      const sentRecords = TournamentEmailService.getEmailDeliveryRecords({
        tournamentId: "tourn_mon_10",
        status: "SENT",
      });
      expect(sentRecords).toHaveLength(3);
    });
  });

  // ===========================================================================
  // 6. Dynamic Game Name Resolution Across All 10 Games
  // ===========================================================================
  describe("6. Dynamic Game Names Across All 10 Games", () => {
    const allGames = [
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

    it.each(allGames)("formats game name correctly for $id -> $name", async ({ id, name }) => {
      expect(formatGameName(id)).toBe(name);

      const user = await createTestUserWithEmail(`game.${id}@test.local`, "Player X");
      const record = await TournamentEmailService.sendMatchAssignedEmail({
        userId: user.id,
        tournamentId: `tourn_${id}`,
        tournamentTitle: `${name} Championship`,
        matchId: `match_${id}_1`,
        roundNumber: "Round 1",
        gameId: id,
        opponentDisplayName: "Player Y",
      });

      expect(record.subject).toBe(`Your ${name} Tournament Match Is Ready`);
      expect(record.textBody).toContain(`Game:\n${name}`);
      expect(record.htmlBody).toContain(name);
    });
  });

  // ===========================================================================
  // 7. Tournament Winner & Prize Integration
  // ===========================================================================
  describe("7. Tournament Winner & Authoritative Prize", () => {
    it("sources prize amount strictly from authoritative data without recalculating in email service", async () => {
      const user = await createTestUserWithEmail("champ.auth@test.local", "Grand Winner");

      const record = await TournamentEmailService.sendTournamentWinEmail({
        userId: user.id,
        tournamentId: "tourn_win_100",
        tournamentTitle: "Snooker Super League",
        finalResult: "1st Place Champion",
        prizeAmount: 75000,
      });

      expect(record.subject).toBe("🏆 Congratulations — You Won Snooker Super League");
      expect(record.textBody).toContain("75,000 Coins");
      expect(record.htmlBody).toContain("75,000 Coins");
      expect(record.textBody).toContain("1st Place Champion");
    });
  });

  // ===========================================================================
  // 8. Integrated Notification & Email Pipeline
  // ===========================================================================
  describe("8. Integrated Notification Pipeline (Online & Offline)", () => {
    it("dispatches both in-app notification and email on match ready and result", async () => {
      const userA = await createTestUserWithEmail("int.a@test.local", "Alice Int");
      const userB = await createTestUserWithEmail("int.b@test.local", "Bob Int");

      await TournamentNotificationService.notifyMatchReady({
        tournamentId: "tourn_int_1",
        tournamentTitle: "Chess Masters",
        roundId: "r1",
        matchId: "match_int_1",
        roundNumber: 1,
        totalRounds: 3,
        gameId: "chess",
        playerAId: userA.id,
        playerBId: userB.id,
      });

      // Check User A in-app notification
      const notifA = await prisma.appNotification.findFirst({
        where: { userId: userA.id, tournamentEventType: "TOURNAMENT_MATCH_READY" },
      });
      expect(notifA).toBeDefined();

      // Check User A email delivery record
      const emailsA = TournamentEmailService.getEmailDeliveryRecords({
        userId: userA.id,
        matchId: "match_int_1",
        eventType: "TOURNAMENT_MATCH_ASSIGNED",
      });
      expect(emailsA).toHaveLength(1);
      expect(emailsA[0].status).toBe("SENT");
      expect(emailsA[0].email).toBe("int.a@test.local");
    });
  });

  // ===========================================================================
  // 9. Production Provider Routing & Security Verification
  // ===========================================================================
  describe("9. Production Provider Routing & Security Verification", () => {
    it("never logs or exposes SMTP / SendGrid credentials in delivery records or errors", async () => {
      const user = await createTestUserWithEmail("sec.test@gaminghub.test", "Security User");
      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: user.id,
        tournamentId: "tourn_sec_1",
        tournamentTitle: "Secure Cup",
        gameId: "chess",
      });

      expect(record.status).toBe("SENT");
      expect(JSON.stringify(record)).not.toContain("SG.");
      expect(JSON.stringify(record)).not.toContain("password");
      expect(JSON.stringify(record)).not.toContain("SECRET");
    });

    it("deduplicates concurrent email dispatch attempts across same event and user", async () => {
      const user = await createTestUserWithEmail("dedup.test@gaminghub.test", "Dedup User");
      const [res1, res2, res3] = await Promise.all([
        TournamentEmailService.sendRegistrationEmail({
          userId: user.id,
          tournamentId: "tourn_dedup_1",
          tournamentTitle: "Dedup Cup",
          gameId: "ludo",
        }),
        TournamentEmailService.sendRegistrationEmail({
          userId: user.id,
          tournamentId: "tourn_dedup_1",
          tournamentTitle: "Dedup Cup",
          gameId: "ludo",
        }),
        TournamentEmailService.sendRegistrationEmail({
          userId: user.id,
          tournamentId: "tourn_dedup_1",
          tournamentTitle: "Dedup Cup",
          gameId: "ludo",
        }),
      ]);

      expect(res1.notificationId).toBe(res2.notificationId);
      expect(res2.notificationId).toBe(res3.notificationId);
      const deliveryRecords = TournamentEmailService.getEmailDeliveryRecords({
        userId: user.id,
        tournamentId: "tourn_dedup_1",
        eventType: "TOURNAMENT_REGISTERED",
      });
      expect(deliveryRecords).toHaveLength(1);
    });
  });
});
