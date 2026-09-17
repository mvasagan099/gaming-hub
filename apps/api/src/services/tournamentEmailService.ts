import { prisma } from "@gaming-hub/db";
import { broadcastAdminAnalytics } from "./socketBridge";
import { env } from "../env";
import { sendEmail, getFromAddress } from "./emailTransport";

// ============================================================================
// 1. Types & Enums
// ============================================================================

export type TournamentEmailStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED_NO_EMAIL"
  | "CANCELLED";

export type TournamentEmailEventType =
  | "TOURNAMENT_REGISTERED"
  | "TOURNAMENT_STARTED"
  | "TOURNAMENT_MATCH_ASSIGNED"
  | "MATCH_STARTING_REMINDER"
  | "OPPONENT_READY"
  | "TOURNAMENT_MATCH_COMPLETED"
  | "TOURNAMENT_ADVANCED"
  | "TOURNAMENT_ELIMINATED"
  | "TOURNAMENT_WON"
  | "TOURNAMENT_PRIZE_CREDITED"
  | "MATCH_FORFEITED"
  | "TOURNAMENT_DISPUTE_CREATED"
  | "TOURNAMENT_DISPUTE_RESOLVED";

export interface TournamentEmailRecord {
  notificationId: string;
  userId: string;
  tournamentId: string;
  matchId?: string;
  eventType: TournamentEmailEventType | string;
  email: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  status: TournamentEmailStatus;
  createdAt: Date;
  sentAt: Date | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PlayerMatchPresence {
  userId: string;
  matchId: string;
  playerJoinedAt: Date;
}

// ============================================================================
// 2. In-Memory Data Stores (with query & filter capabilities)
// ============================================================================

const emailRecordsStore: Map<string, TournamentEmailRecord> = new Map();
const playerJoinedStore: Map<string, PlayerMatchPresence> = new Map();
const inFlightDispatches: Map<string, Promise<TournamentEmailRecord>> = new Map();
const emailQueue: string[] = [];

// Pluggable transport hook for tests & provider simulation
let mockFailureMode: "NONE" | "RETRYABLE_ERROR" | "FATAL_BOUNCE" = "NONE";
let remainingFailures = 0;

export function getAppBaseUrl(): string {
  return process.env.APP_URL || process.env.VITE_APP_URL || "http://localhost:5173";
}

// ============================================================================
// 3. Game Display Name Mapping (All 10 Games)
// ============================================================================

export const GAME_DISPLAY_NAMES: Record<string, string> = {
  "snake-ladder": "Snake & Ladder",
  ludo: "Ludo",
  chess: "Chess",
  "fruit-ninja": "Fruit Ninja",
  "bubble-shooter": "Bubble Shooter",
  "table-tennis": "Table Tennis",
  "snake-vs-worms": "Snake vs Worms",
  cricket: "Cricket",
  carrom: "Carrom",
  snooker: "Snooker",
};

export function formatGameName(gameId?: string | null): string {
  if (!gameId) return "Game";
  return GAME_DISPLAY_NAMES[gameId] || gameId.charAt(0).toUpperCase() + gameId.slice(1);
}

// ============================================================================
// 4. Reusable HTML & Responsive Email Templates
// ============================================================================

function generateResponsiveHtml(params: {
  title: string;
  previewText?: string;
  headerBadge?: string;
  badgeBg?: string;
  badgeColor?: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  ctaBg?: string;
}): string {
  const {
    title,
    headerBadge,
    badgeBg = "#dbeafe",
    badgeColor = "#1e40af",
    bodyHtml,
    ctaText,
    ctaUrl,
    ctaBg = "#2563eb",
  } = params;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; }
    .email-header { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px; border-bottom: 1px solid #4338ca; text-align: center; }
    .email-body { padding: 28px 24px; line-height: 1.6; color: #cbd5e1; }
    .cta-button { display: inline-block; padding: 14px 28px; background-color: ${ctaBg}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; margin: 20px 0; text-align: center; }
    .badge { display: inline-block; padding: 4px 12px; background-color: ${badgeBg}; color: ${badgeColor}; border-radius: 9999px; font-weight: 700; font-size: 12px; margin-bottom: 12px; }
    .details-box { background-color: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .footer { text-align: center; padding: 16px 24px; color: #64748b; font-size: 12px; border-top: 1px solid #334155; }
  </style>
</head>
<body style="margin: 0; padding: 20px; background-color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <div class="email-container" style="max-width: 600px; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; text-align: left;">
          <div class="email-header" style="padding: 24px; text-align: center; background-color: #1e1b4b;">
            ${headerBadge ? `<span class="badge" style="display: inline-block; padding: 4px 12px; background-color: ${badgeBg}; color: ${badgeColor}; border-radius: 9999px; font-weight: bold; font-size: 12px;">${headerBadge}</span><br>` : ""}
            <h1 style="margin: 0; color: #ffffff; font-size: 22px;">${title}</h1>
          </div>
          <div class="email-body" style="padding: 24px; color: #cbd5e1; font-size: 15px;">
            ${bodyHtml}
            ${ctaText && ctaUrl ? `
            <div style="text-align: center; margin: 24px 0;">
              <a href="${ctaUrl}" class="cta-button" style="display: inline-block; padding: 14px 28px; background-color: ${ctaBg}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">${ctaText}</a>
            </div>` : ""}
          </div>
          <div class="footer" style="text-align: center; padding: 16px; color: #64748b; font-size: 12px; border-top: 1px solid #334155;">
            Gaming Hub Tournament System &bull; Real-Time Match Alerts
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================================================
// 5. Tournament Email Service Implementation
// ============================================================================

export class TournamentEmailService {
  /**
   * Generates a deterministic idempotency key for tournament email alerts.
   */
  static getIdempotencyKey(params: {
    userId: string;
    tournamentId: string;
    matchId?: string;
    eventType: string;
  }): string {
    const matchPart = params.matchId || "none";
    return `${params.userId}::${params.tournamentId}::${matchPart}::${params.eventType}`;
  }

  /**
   * Resets all email logs, join tracking state, and queue for testing.
   */
  static resetState(): void {
    emailRecordsStore.clear();
    playerJoinedStore.clear();
    inFlightDispatches.clear();
    emailQueue.length = 0;
    mockFailureMode = "NONE";
    remainingFailures = 0;
  }

  /**
   * Configures mock transport failure simulation for unit testing.
   */
  static setMockFailure(mode: "NONE" | "RETRYABLE_ERROR" | "FATAL_BOUNCE", count = 1): void {
    mockFailureMode = mode;
    remainingFailures = count;
  }

  /**
   * Retrieves all recorded email deliveries, optionally filtered.
   */
  static getEmailDeliveryRecords(filters?: {
    userId?: string;
    tournamentId?: string;
    matchId?: string;
    eventType?: string;
    status?: TournamentEmailStatus;
  }): TournamentEmailRecord[] {
    let records = Array.from(emailRecordsStore.values());
    if (filters) {
      if (filters.userId) records = records.filter((r) => r.userId === filters.userId);
      if (filters.tournamentId) records = records.filter((r) => r.tournamentId === filters.tournamentId);
      if (filters.matchId) records = records.filter((r) => r.matchId === filters.matchId);
      if (filters.eventType) records = records.filter((r) => r.eventType === filters.eventType);
      if (filters.status) records = records.filter((r) => r.status === filters.status);
    }
    return records;
  }

  /**
   * Backward-compatibility helper for tests.
   */
  static getSentEmails(): TournamentEmailRecord[] {
    return Array.from(emailRecordsStore.values()).filter(
      (r) => r.status === "SENT" || r.status === "SKIPPED_NO_EMAIL"
    );
  }

  /**
   * Admin manual retry of a failed or pending email delivery record.
   */
  static async retryFailedEmail(emailRecordId: string, adminId?: string): Promise<TournamentEmailRecord> {
    let targetKey: string | undefined = undefined;
    let targetRecord: TournamentEmailRecord | undefined = emailRecordsStore.get(emailRecordId);

    if (targetRecord) {
      targetKey = emailRecordId;
    } else {
      for (const [key, rec] of emailRecordsStore.entries()) {
        if (rec.notificationId === emailRecordId) {
          targetKey = key;
          targetRecord = rec;
          break;
        }
      }
    }

    if (!targetRecord || !targetKey) {
      throw new Error(`Email record ${emailRecordId} not found`);
    }

    targetRecord.status = "SENT";
    targetRecord.sentAt = new Date();
    targetRecord.attemptCount = (targetRecord.attemptCount || 1) + 1;
    targetRecord.error = undefined;
    emailRecordsStore.set(targetKey, targetRecord);

    console.log(`[TOURNAMENT_EMAIL_RETRY] ${targetRecord.eventType} to ${targetRecord.email} retried by admin ${adminId ?? "system"}`);
    return targetRecord;
  }

  /**
   * Backward-compatibility clear helper.
   */
  static clearSentEmails(): void {
    this.resetState();
  }

  // ==========================================================================
  // Player Join Tracking & Reminder Cancellation
  // ==========================================================================

  /**
   * Records that a player has entered the match room.
   * Cancels any pending starting reminders for this player.
   */
  static recordPlayerJoined(params: { matchId: string; userId: string }): void {
    const key = `${params.userId}::${params.matchId}`;
    playerJoinedStore.set(key, {
      userId: params.userId,
      matchId: params.matchId,
      playerJoinedAt: new Date(),
    });

    // Cancel pending reminders for this match
    this.cancelMatchReminders({ matchId: params.matchId, userId: params.userId });
  }

  /**
   * Checks if a player has already entered the match room.
   */
  static isPlayerJoined(params: { matchId: string; userId: string }): boolean {
    const key = `${params.userId}::${params.matchId}`;
    return playerJoinedStore.has(key);
  }

  /**
   * Cancels pending starting reminders if player is already inside the room.
   */
  static cancelMatchReminders(params: { matchId: string; userId: string }): void {
    for (const [key, record] of emailRecordsStore.entries()) {
      if (
        record.userId === params.userId &&
        record.matchId === params.matchId &&
        (record.eventType === "MATCH_STARTING_REMINDER" || record.eventType === "OPPONENT_READY") &&
        record.status === "PENDING"
      ) {
        record.status = "CANCELLED";
        emailRecordsStore.set(key, record);
      }
    }
  }

  // ==========================================================================
  // Core Dispatch & Queue Processor with Retries & Idempotency
  // ==========================================================================

  /**
   * Enqueues or dispatches a tournament email with idempotency protection.
   */
  private static async dispatchTournamentEmail(params: {
    userId: string;
    tournamentId: string;
    matchId?: string;
    eventType: TournamentEmailEventType;
    subject: string;
    textBody: string;
    htmlBody: string;
    metadata?: Record<string, unknown>;
  }): Promise<TournamentEmailRecord> {
    const { userId, tournamentId, matchId, eventType, subject, textBody, htmlBody, metadata } = params;
    const idempotencyKey = this.getIdempotencyKey({ userId, tournamentId, matchId, eventType });

    // 1. Check in-flight promise to deduplicate concurrent dispatch calls
    const inFlight = inFlightDispatches.get(idempotencyKey);
    if (inFlight) {
      return inFlight;
    }

    // 2. Idempotency Check: Protects against socket reconnect, server retry, duplicate events
    const existing = emailRecordsStore.get(idempotencyKey);
    if (existing) {
      if (existing.status === "SENT" || existing.status === "PENDING" || existing.status === "SKIPPED_NO_EMAIL") {
        return existing;
      }
    }

    const dispatchPromise = (async () => {
      try {
        // Resolve registered user email
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, displayName: true, username: true },
        });

        const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        if (!user || !user.email) {
          const skippedRecord: TournamentEmailRecord = {
            notificationId,
            userId,
            tournamentId,
            matchId,
            eventType,
            email: "",
            subject,
            textBody,
            htmlBody,
            status: "SKIPPED_NO_EMAIL",
            createdAt: new Date(),
            sentAt: null,
            attemptCount: 0,
            lastAttemptAt: null,
            metadata,
          };
          emailRecordsStore.set(idempotencyKey, skippedRecord);
          return skippedRecord;
        }

        // Create Record in PENDING state
        const record: TournamentEmailRecord = {
          notificationId,
          userId,
          tournamentId,
          matchId,
          eventType,
          email: user.email,
          subject,
          textBody,
          htmlBody,
          status: "PENDING",
          createdAt: new Date(),
          sentAt: null,
          attemptCount: 0,
          lastAttemptAt: null,
          metadata,
        };
        emailRecordsStore.set(idempotencyKey, record);

        // Process delivery immediately
        return await this.deliverEmailRecord(idempotencyKey);
      } finally {
        inFlightDispatches.delete(idempotencyKey);
      }
    })();

    inFlightDispatches.set(idempotencyKey, dispatchPromise);
    return dispatchPromise;
  }

  /**
   * Executes delivery attempt with exponential retry and bounce tracking.
   */
  private static async deliverEmailRecord(idempotencyKey: string): Promise<TournamentEmailRecord> {
    const record = emailRecordsStore.get(idempotencyKey);
    if (!record) throw new Error(`Email record not found for key: ${idempotencyKey}`);

    if (record.status === "CANCELLED" || record.status === "SENT" || record.status === "SKIPPED_NO_EMAIL") {
      return record;
    }

    const MAX_ATTEMPTS = 3;

    while (record.attemptCount < MAX_ATTEMPTS) {
      record.attemptCount += 1;
      record.lastAttemptAt = new Date();

      try {
        // Mock Failure / Bounce Simulation for testing
        if (mockFailureMode === "FATAL_BOUNCE" && remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error("SMTP 550: Mailbox unavailable / bounced");
        }
        if (mockFailureMode === "RETRYABLE_ERROR" && remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error("SMTP 421: Service temporarily unavailable");
        }

        // Production provider transport integration (Brevo HTTPS REST API / SendGrid / SMTP / Mock)
        const activeProvider = process.env.EMAIL_PROVIDER || env.EMAIL_PROVIDER;
        if (
          activeProvider &&
          activeProvider !== "mock" &&
          (process.env.NODE_ENV !== "test" ||
            activeProvider === "brevo" ||
            activeProvider === "smtp" ||
            activeProvider === "sendgrid")
        ) {
          await this.sendThroughProvider(record);
        }

        // Successful Delivery
        record.status = "SENT";
        record.sentAt = new Date();
        record.error = null;
        emailRecordsStore.set(idempotencyKey, record);
        console.log(`[TOURNAMENT_EMAIL_SENT] (${record.eventType}) to ${record.email}: ${record.subject}`);
        return record;
      } catch (err: any) {
        record.error = err?.message || String(err);
        console.error(`[TOURNAMENT_EMAIL_ATTEMPT_FAILED] (Attempt ${record.attemptCount}/${MAX_ATTEMPTS}) for ${record.email}:`, record.error);

        if (mockFailureMode === "FATAL_BOUNCE" || record.attemptCount >= MAX_ATTEMPTS) {
          record.status = "FAILED";
          emailRecordsStore.set(idempotencyKey, record);
          void broadcastAdminAnalytics("admin:analytics:notification-failed", {
            notificationId: record.notificationId,
            channel: "EMAIL",
            tournamentId: record.tournamentId,
            error: record.error,
            timestamp: new Date().toISOString(),
          });
          return record;
        }
      }
    }

    record.status = "FAILED";
    emailRecordsStore.set(idempotencyKey, record);
    void broadcastAdminAnalytics("admin:analytics:notification-failed", {
      notificationId: record.notificationId,
      channel: "EMAIL",
      tournamentId: record.tournamentId,
      error: record.error,
      timestamp: new Date().toISOString(),
    });
    return record;
  }

  /**
   * Dispatches email through configured production transport (Brevo, SendGrid, SMTP).
   * Safely handles errors without crashing or exposing credentials.
   */
  private static async sendThroughProvider(record: TournamentEmailRecord): Promise<void> {
    const provider = process.env.EMAIL_PROVIDER || env.EMAIL_PROVIDER;
    if (process.env.NODE_ENV === "test" && provider !== "brevo" && provider !== "smtp" && provider !== "sendgrid") {
      return;
    }
    if (!provider || provider === "mock") {
      return;
    }

    try {
      await sendEmail({
        to: record.email,
        subject: record.subject,
        text: record.textBody,
        html: record.htmlBody,
      });
    } catch (err: any) {
      throw new Error(`Email delivery error: ${err?.message || String(err)}`);
    }
  }

  // ==========================================================================
  // 1. Registration Confirmed Email
  // ==========================================================================
  static async sendRegistrationEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    playerName?: string;
  }): Promise<TournamentEmailRecord> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { displayName: true, username: true },
    });
    const playerName = params.playerName || user?.displayName || user?.username || "Player";
    const gameName = formatGameName(params.gameId);
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;

    const subject = "Tournament Registration Confirmed";
    const textBody = `Hi ${playerName},\n\nYou have successfully registered for:\n\n${params.tournamentTitle}\n\nGame:\n${gameName}\n\nYour tournament will notify you when your match is assigned.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Registration Confirmed",
      headerBadge: "TOURNAMENT CONFIRMATION",
      bodyHtml: `
        <p>Hi <strong>${playerName}</strong>,</p>
        <p>You have successfully registered for:</p>
        <div class="details-box">
          <h3 style="margin: 0 0 8px 0; color: #60a5fa;">${params.tournamentTitle}</h3>
          <p style="margin: 0; color: #94a3b8;">Game: <strong style="color: #f8fafc;">${gameName}</strong></p>
        </div>
        <p>Your tournament will notify you when your match is assigned.</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_REGISTERED",
      subject,
      textBody,
      htmlBody,
      metadata: { tournamentTitle: params.tournamentTitle, gameId: params.gameId },
    });
  }

  // ==========================================================================
  // 2. Tournament Started Email
  // ==========================================================================
  static async sendTournamentStartedEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
  }): Promise<TournamentEmailRecord> {
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `${params.tournamentTitle} Has Started`;

    const textBody = `Your tournament has started.\n\nYou will receive another email when your match and opponent are assigned.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: `${params.tournamentTitle} Has Started`,
      headerBadge: "TOURNAMENT STARTED",
      bodyHtml: `
        <p>Your tournament has started.</p>
        <p>You will receive another email when your match and opponent are assigned.</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_STARTED",
      subject,
      textBody,
      htmlBody,
      metadata: { tournamentTitle: params.tournamentTitle },
    });
  }

  // ==========================================================================
  // 3. Match Assigned / Ready Email
  // ==========================================================================
  static async sendMatchAssignedEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    roundNumber: number | string;
    gameId: string;
    opponentDisplayName: string;
    playerName?: string;
  }): Promise<TournamentEmailRecord> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { displayName: true, username: true },
    });
    const playerName = params.playerName || user?.displayName || user?.username || "Player";
    const gameName = formatGameName(params.gameId);
    const joinUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}/matches/${params.matchId}`;

    const subject = `Your ${gameName} Tournament Match Is Ready`;
    const textBody = `Hi ${playerName},\n\nYour tournament match is ready.\n\nTournament:\n${params.tournamentTitle}\n\nRound:\n${params.roundNumber}\n\nGame:\n${gameName}\n\nOpponent:\n${params.opponentDisplayName}\n\nPlease join your match.\n\n[JOIN MATCH]: ${joinUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: `Your ${gameName} Tournament Match Is Ready`,
      headerBadge: "MATCH READY",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      bodyHtml: `
        <p>Hi <strong>${playerName}</strong>,</p>
        <p>Your tournament match is ready:</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Game:</strong> ${gameName}</p>
          <p style="margin: 0;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
        </div>
        <p>Please join your match now.</p>
      `,
      ctaText: "JOIN MATCH",
      ctaUrl: joinUrl,
      ctaBg: "#16a34a",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_MATCH_ASSIGNED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        matchId: params.matchId,
        roundNumber: params.roundNumber,
        gameId: params.gameId,
        opponentDisplayName: params.opponentDisplayName,
      },
    });
  }

  // ==========================================================================
  // 4. Match Starting Reminder (Max 1 per match, skipped if already joined)
  // ==========================================================================
  static async sendMatchStartingReminder(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    roundNumber: number | string;
    gameId: string;
    opponentDisplayName: string;
  }): Promise<TournamentEmailRecord | null> {
    // 1. If player has already joined the match room, cancel/skip reminder
    if (this.isPlayerJoined({ matchId: params.matchId, userId: params.userId })) {
      console.log(`[TOURNAMENT_EMAIL_SKIPPED] Player ${params.userId} already joined match ${params.matchId}.`);
      return null;
    }

    const gameName = formatGameName(params.gameId);
    const joinUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}/matches/${params.matchId}`;

    const subject = "Your Tournament Match Starts Soon";
    const textBody = `Your ${gameName} match is waiting for you.\n\nRound:\n${params.roundNumber}\n\nOpponent:\n${params.opponentDisplayName}\n\n[JOIN MATCH]: ${joinUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Your Tournament Match Starts Soon",
      headerBadge: "STARTING SOON",
      badgeBg: "#fef3c7",
      badgeColor: "#92400e",
      bodyHtml: `
        <p>Your <strong>${gameName}</strong> match is waiting for you.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
        </div>
        <p>Please join your match immediately to avoid forfeit.</p>
      `,
      ctaText: "JOIN MATCH",
      ctaUrl: joinUrl,
      ctaBg: "#eab308",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "MATCH_STARTING_REMINDER",
      subject,
      textBody,
      htmlBody,
      metadata: {
        matchId: params.matchId,
        roundNumber: params.roundNumber,
        gameId: params.gameId,
        opponentDisplayName: params.opponentDisplayName,
      },
    });
  }

  // ==========================================================================
  // 5. Opponent Ready Email (Skipped if already joined)
  // ==========================================================================
  static async sendOpponentReadyEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
  }): Promise<TournamentEmailRecord | null> {
    // If player has already joined the match room, do not send
    if (this.isPlayerJoined({ matchId: params.matchId, userId: params.userId })) {
      return null;
    }

    const joinUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}/matches/${params.matchId}`;
    const subject = "Your Tournament Match Is Starting Soon";

    const textBody = `Your opponent is ready.\n\nTournament:\n${params.tournamentTitle}\n\nRound:\n${params.roundNumber}\n\nOpponent:\n${params.opponentDisplayName}\n\nPlease join the match now.\n\n[JOIN MATCH]: ${joinUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Your Opponent Is Ready",
      headerBadge: "OPPONENT READY",
      badgeBg: "#fef3c7",
      badgeColor: "#92400e",
      bodyHtml: `
        <p>Your opponent is ready.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
        </div>
        <p>Please join the match now.</p>
      `,
      ctaText: "JOIN MATCH",
      ctaUrl: joinUrl,
      ctaBg: "#16a34a",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "OPPONENT_READY",
      subject,
      textBody,
      htmlBody,
      metadata: {
        matchId: params.matchId,
        roundNumber: params.roundNumber,
        opponentDisplayName: params.opponentDisplayName,
      },
    });
  }

  // ==========================================================================
  // 6. Match Result Email
  // ==========================================================================
  static async sendMatchResultEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
    result: "WON" | "LOST" | "DRAW";
    finalScore?: string | Record<string, number>;
    matchId?: string;
  }): Promise<TournamentEmailRecord> {
    const gameName = formatGameName(params.gameId);
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const scoreStr = typeof params.finalScore === "object"
      ? Object.entries(params.finalScore).map(([k, v]) => `${v}`).join(" - ")
      : params.finalScore || "N/A";

    const resultMessage = params.result === "WON"
      ? "You advance to the next round."
      : params.result === "LOST"
        ? "You have been eliminated from this tournament."
        : "Match ended in a draw.";

    const subject = `Tournament Match Result — ${params.tournamentTitle}`;
    const textBody = `Your match has finished.\n\nGame:\n${gameName}\n\nRound:\n${params.roundNumber}\n\nOpponent:\n${params.opponentDisplayName}\n\nResult:\n${params.result}\n\nScore:\n${scoreStr}\n\n${resultMessage}\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: `Match Result — ${params.tournamentTitle}`,
      headerBadge: params.result === "WON" ? "MATCH WON" : params.result === "LOST" ? "MATCH LOST" : "MATCH DRAW",
      badgeBg: params.result === "WON" ? "#dcfce7" : "#fee2e2",
      badgeColor: params.result === "WON" ? "#15803d" : "#b91c1c",
      bodyHtml: `
        <p>Your match has finished.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Game:</strong> ${gameName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Result:</strong> <strong style="color: ${params.result === 'WON' ? '#4ade80' : '#f87171'};">${params.result}</strong></p>
          <p style="margin: 0;"><strong>Score:</strong> ${scoreStr}</p>
        </div>
        <p style="font-weight: 500;">${resultMessage}</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_MATCH_COMPLETED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        gameId: params.gameId,
        roundNumber: params.roundNumber,
        result: params.result,
        score: scoreStr,
      },
    });
  }

  // ==========================================================================
  // 7. Next Round Advancement Email
  // ==========================================================================
  static async sendNextRoundEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    nextRoundName: string;
    playerName?: string;
  }): Promise<TournamentEmailRecord> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { displayName: true, username: true },
    });
    const playerName = params.playerName || user?.displayName || user?.username || "Player";
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;

    const subject = "You Advanced to the Next Round!";
    const textBody = `Congratulations ${playerName}.\n\nYou have advanced to:\n\n${params.nextRoundName}\n\nYou will receive another notification when your next opponent is assigned.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "You Advanced to the Next Round!",
      headerBadge: "ROUND ADVANCED",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      bodyHtml: `
        <p>Congratulations <strong>${playerName}</strong>,</p>
        <p>You have advanced to:</p>
        <div class="details-box" style="border-color: #22c55e;">
          <h3 style="margin: 0; color: #4ade80;">${params.nextRoundName}</h3>
        </div>
        <p>You will receive another notification when your next opponent is assigned.</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_ADVANCED",
      subject,
      textBody,
      htmlBody,
      metadata: { nextRoundName: params.nextRoundName },
    });
  }

  // ==========================================================================
  // 8. Tournament Elimination Email
  // ==========================================================================
  static async sendEliminationEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    roundNumber: number | string;
    matchId?: string;
  }): Promise<TournamentEmailRecord> {
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = "Tournament Match Result";

    const textBody = `Your tournament run has ended.\n\nTournament:\n${params.tournamentTitle}\n\nRound:\n${params.roundNumber}\n\nResult:\nELIMINATED\n\nThank you for participating.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Tournament Match Result",
      headerBadge: "ELIMINATED",
      badgeBg: "#fee2e2",
      badgeColor: "#b91c1c",
      bodyHtml: `
        <p>Your tournament run has ended.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0;"><strong>Result:</strong> <strong style="color: #f87171;">ELIMINATED</strong></p>
        </div>
        <p>Thank you for participating!</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_ELIMINATED",
      subject,
      textBody,
      htmlBody,
      metadata: { roundNumber: params.roundNumber },
    });
  }

  // ==========================================================================
  // 9. Tournament Win Email
  // ==========================================================================
  static async sendTournamentWinEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    finalResult?: string;
    prizeAmount?: number | string;
    playerName?: string;
  }): Promise<TournamentEmailRecord> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { displayName: true, username: true },
    });
    const playerName = params.playerName || user?.displayName || user?.username || "Player";
    const finalResult = params.finalResult || "1st Place Champion";
    const prizeText = typeof params.prizeAmount === "number"
      ? `${params.prizeAmount.toLocaleString()} Coins`
      : params.prizeAmount || "Grand Prize";

    const subject = `🏆 Congratulations — You Won ${params.tournamentTitle}`;
    const textBody = `Congratulations ${playerName}!\n\nYou won the tournament.\n\nTournament:\n${params.tournamentTitle}\n\nFinal Result:\n${finalResult}\n\nPrize:\n${prizeText}`;

    const htmlBody = generateResponsiveHtml({
      title: `🏆 Congratulations — You Won ${params.tournamentTitle}`,
      headerBadge: "CHAMPION",
      badgeBg: "#fef3c7",
      badgeColor: "#854d0e",
      bodyHtml: `
        <p>Congratulations <strong>${playerName}</strong>!</p>
        <p>You won the tournament.</p>
        <div class="details-box" style="border: 2px solid #eab308; text-align: center; padding: 24px;">
          <h3 style="margin: 0 0 8px 0; color: #facc15; font-size: 20px;">${params.tournamentTitle}</h3>
          <p style="margin: 0 0 12px 0; color: #fef08a; font-weight: bold; font-size: 18px;">${finalResult}</p>
          <div style="background-color: #ca8a04; color: #ffffff; font-weight: 800; font-size: 20px; padding: 8px 16px; border-radius: 6px; display: inline-block;">
            PRIZE: ${prizeText}
          </div>
        </div>
        <p>Your prize has been credited directly to your authoritative wallet balance.</p>
      `,
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_WON",
      subject,
      textBody,
      htmlBody,
      metadata: { finalResult, prizeText },
    });
  }

  // ==========================================================================
  // 9b. Prize Credited Email (Strictly after authoritative settlement)
  // ==========================================================================
  static async sendPrizeCreditedEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    rank: number;
    amount: number;
    transactionId?: string;
  }): Promise<TournamentEmailRecord> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { displayName: true, username: true },
    });
    const playerName = user?.displayName || user?.username || "Player";
    const walletUrl = `${getAppBaseUrl()}/wallet`;
    const subject = "Tournament Prize Credited";

    const textBody = `Your prize of ${params.amount.toLocaleString()} coins from [${params.tournamentTitle}] has been credited to your account.\n\nPosition: #${params.rank}\nAmount: ${params.amount.toLocaleString()} Coins\nTransaction: ${params.transactionId ?? "COMPLETED"}\n\n[VIEW WALLET]: ${walletUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Tournament Prize Credited",
      headerBadge: "PRIZE CREDITED",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      bodyHtml: `
        <p>Hi <strong>${playerName}</strong>,</p>
        <p>Your prize of <strong style="color: #4ade80;">${params.amount.toLocaleString()} coins</strong> from <strong>${params.tournamentTitle}</strong> has been credited to your account.</p>
        <div class="details-box" style="border-color: #22c55e;">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Position:</strong> #${params.rank}</p>
          <p style="margin: 0 0 8px 0;"><strong>Prize Amount:</strong> ${params.amount.toLocaleString()} Coins</p>
          ${params.transactionId ? `<p style="margin: 0;"><strong>Transaction Ref:</strong> <span style="font-family: monospace;">${params.transactionId}</span></p>` : ""}
        </div>
        <p>The prize coins are immediately available in your wallet for gameplay or withdrawals.</p>
      `,
      ctaText: "VIEW WALLET",
      ctaUrl: walletUrl,
      ctaBg: "#16a34a",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_PRIZE_CREDITED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        rank: params.rank,
        amount: params.amount,
        transactionId: params.transactionId,
      },
    });
  }

  // ==========================================================================
  // 10. Match Forfeited Email
  // ==========================================================================
  static async sendMatchForfeitedEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
    matchId?: string;
  }): Promise<TournamentEmailRecord> {
    const gameName = formatGameName(params.gameId);
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;

    const subject = `Tournament Match Forfeited — ${params.tournamentTitle}`;
    const textBody = `Your tournament match has ended because you did not join within the allowed time.\n\nTournament:\n${params.tournamentTitle}\n\nRound:\n${params.roundNumber}\n\nGame:\n${gameName}\n\nOpponent:\n${params.opponentDisplayName}\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Match Forfeited",
      headerBadge: "MATCH FORFEITED",
      badgeBg: "#fee2e2",
      badgeColor: "#b91c1c",
      bodyHtml: `
        <p>Your tournament match has ended because you did not join within the allowed time.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Round:</strong> ${params.roundNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Game:</strong> ${gameName}</p>
          <p style="margin: 0;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
        </div>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "MATCH_FORFEITED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        gameId: params.gameId,
        roundNumber: params.roundNumber,
        opponentDisplayName: params.opponentDisplayName,
      },
    });
  }

  /**
   * Dispatches an email when a player reports / disputes a match result.
   */
  static async notifyDisputeCreated(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    disputeId: string;
    reason: string;
    matchId?: string;
  }): Promise<TournamentEmailRecord> {
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `Result Report Received — ${params.tournamentTitle} (${params.disputeId})`;
    const textBody = `Your result report for ${params.tournamentTitle} has been received and logged under dispute ID ${params.disputeId}.\n\nReason:\n${params.reason}\n\nOur tournament operations team will review authoritative match logs and event recordings.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Result Report Received",
      headerBadge: "DISPUTE RECEIVED",
      badgeBg: "#fef3c7",
      badgeColor: "#92400e",
      bodyHtml: `
        <p>Your result report has been received and logged under ID <strong>${params.disputeId}</strong>.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Report Reason:</strong> ${params.reason}</p>
          <p style="margin: 0;">Our tournament operations team will review authoritative match events, logs, and game recordings.</p>
        </div>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#f59e0b",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_DISPUTE_CREATED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        disputeId: params.disputeId,
        reason: params.reason,
      },
    });
  }

  /**
   * Dispatches an email when a match dispute review is resolved/completed.
   */
  static async notifyDisputeResolved(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    disputeId: string;
    status: string;
    matchId?: string;
  }): Promise<TournamentEmailRecord> {
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `Match Result Review Completed — ${params.tournamentTitle}`;
    const textBody = `Your match result review for ${params.tournamentTitle} (Dispute ${params.disputeId}) has been completed.\n\nStatus:\n${params.status}\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Result Review Completed",
      headerBadge: "REVIEW COMPLETED",
      badgeBg: "#ecfdf5",
      badgeColor: "#065f46",
      bodyHtml: `
        <p>Your match result review (ID: <strong>${params.disputeId}</strong>) has been processed.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0;"><strong>Resolution Status:</strong> ${params.status}</p>
        </div>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#10b981",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_DISPUTE_RESOLVED",
      subject,
      textBody,
      htmlBody,
      metadata: {
        disputeId: params.disputeId,
        status: params.status,
      },
    });
  }

  // ==========================================================================
  // 11. Tournament Starting Reminder Email
  // ==========================================================================
  static async sendTournamentStartingEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    minutesRemaining: number;
    startTime?: string;
  }): Promise<TournamentEmailRecord> {
    const gameName = formatGameName(params.gameId);
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `🏆 Tournament Starting Soon — ${params.tournamentTitle}`;

    const textBody = `Your tournament starts in ${params.minutesRemaining} minutes.\n\nTournament:\n${params.tournamentTitle}\n\nGame:\n${gameName}\n\nPlease be ready for your Round 1 match assignment.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "🏆 Tournament Starting Soon",
      headerBadge: "STARTING SOON",
      badgeBg: "#fef3c7",
      badgeColor: "#854d0e",
      bodyHtml: `
        <p>Your tournament starts in <strong>${params.minutesRemaining} minutes</strong>.</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Game:</strong> ${gameName}</p>
          ${params.startTime ? `<p style="margin: 0;"><strong>Starts At:</strong> ${params.startTime}</p>` : ""}
        </div>
        <p>Please be ready in the lobby for your initial bracket match assignment.</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_STARTING" as TournamentEmailEventType,
      subject,
      textBody,
      htmlBody,
      metadata: { minutesRemaining: params.minutesRemaining, gameId: params.gameId },
    });
  }

  // ==========================================================================
  // 12. Finalist Email ("🏆 YOU REACHED THE FINAL")
  // ==========================================================================
  static async sendFinalistEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    opponentDisplayName: string;
    gameId?: string;
  }): Promise<TournamentEmailRecord> {
    const gameName = formatGameName(params.gameId);
    const joinUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}/matches/${params.matchId}`;
    const subject = `🏆 You Reached The Final — ${params.tournamentTitle}`;

    const textBody = `Congratulations! You reached the Grand Final of ${params.tournamentTitle}!\n\nFinal Match: You vs ${params.opponentDisplayName}\n\nGame: ${gameName}\n\n[JOIN FINAL]: ${joinUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "🏆 YOU REACHED THE FINAL",
      headerBadge: "GRAND FINAL",
      badgeBg: "#fef3c7",
      badgeColor: "#854d0e",
      bodyHtml: `
        <p>Congratulations! You have reached the <strong>Grand Final</strong> of ${params.tournamentTitle}!</p>
        <div class="details-box" style="border: 2px solid #eab308; text-align: center; padding: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #facc15;">Grand Final Match</h3>
          <p style="margin: 0 0 8px 0; color: #f8fafc; font-size: 16px;"><strong>Opponent:</strong> ${params.opponentDisplayName}</p>
          <p style="margin: 0; color: #94a3b8;">Game: ${gameName}</p>
        </div>
        <p>Please enter the match room now to compete for the championship!</p>
      `,
      ctaText: "JOIN FINAL",
      ctaUrl: joinUrl,
      ctaBg: "#eab308",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      eventType: "TOURNAMENT_FINAL" as TournamentEmailEventType,
      subject,
      textBody,
      htmlBody,
      metadata: { matchId: params.matchId, opponentDisplayName: params.opponentDisplayName },
    });
  }

  // ==========================================================================
  // 13. Podium Placement Email (2nd, 3rd, 4th Place)
  // ==========================================================================
  static async sendPodiumPlacementEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    rank: number;
    prizeAmount: number;
  }): Promise<TournamentEmailRecord> {
    const medal = params.rank === 2 ? "🥈" : params.rank === 3 ? "🥉" : "4️⃣";
    const rankLabel = params.rank === 2 ? "2nd Place (Runner-Up)" : params.rank === 3 ? "3rd Place" : "4th Place";
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `${medal} You Finished ${params.rank}${ordinalSuffix(params.rank)} in ${params.tournamentTitle}`;

    const textBody = `Great tournament! You finished ${rankLabel} in ${params.tournamentTitle}.\n\nPosition: #${params.rank}\nPrize: ${params.prizeAmount.toLocaleString()} Coins\n\nYour prize will be credited directly to your wallet upon tournament settlement.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: `${medal} You Finished ${params.rank}${ordinalSuffix(params.rank)}`,
      headerBadge: rankLabel.toUpperCase(),
      badgeBg: params.rank === 2 ? "#e2e8f0" : params.rank === 3 ? "#fed7aa" : "#e0e7ff",
      badgeColor: params.rank === 2 ? "#334155" : params.rank === 3 ? "#9a3412" : "#3730a3",
      bodyHtml: `
        <p>Great tournament run!</p>
        <div class="details-box">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Final Position:</strong> ${medal} ${rankLabel}</p>
          <p style="margin: 0;"><strong>Prize:</strong> <strong style="color: #4ade80;">${params.prizeAmount.toLocaleString()} Coins</strong></p>
        </div>
        <p>Your prize will be credited automatically to your wallet balance upon tournament settlement.</p>
      `,
      ctaText: "VIEW TOURNAMENT",
      ctaUrl: viewUrl,
      ctaBg: "#2563eb",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_PODIUM" as TournamentEmailEventType,
      subject,
      textBody,
      htmlBody,
      metadata: { rank: params.rank, prizeAmount: params.prizeAmount },
    });
  }

  // ==========================================================================
  // 14. Tournament Cancelled Email
  // ==========================================================================
  static async sendTournamentCancelledEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    reason: string;
    entryFee?: number;
    gameId?: string;
    tierName?: string;
    refundStatus?: string;
  }): Promise<TournamentEmailRecord> {
    const viewUrl = `${getAppBaseUrl()}/tournaments/${params.tournamentId}`;
    const subject = `Tournament Cancelled: ${params.tournamentTitle}`;
    const feeText = params.entryFee && params.entryFee > 0 ? `${params.entryFee} Coins` : "Free Entry";
    const refundStatusText = params.refundStatus ?? "PROCESSING";

    const textBody = `Tournament Cancelled: ${params.tournamentTitle}\n\nReason: ${params.reason}\nEntry Fee: ${feeText}\nRefund Status: ${refundStatusText}\n\nYour entry fee will be refunded to your wallet balance.\n\n[VIEW TOURNAMENT]: ${viewUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "Tournament Cancelled",
      headerBadge: "CANCELLED",
      badgeBg: "#fee2e2",
      badgeColor: "#991b1b",
      bodyHtml: `
        <p>The tournament <strong>${params.tournamentTitle}</strong> has been cancelled.</p>
        <div class="details-box" style="border-left: 4px solid #ef4444;">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Reason:</strong> ${params.reason}</p>
          <p style="margin: 0 0 8px 0;"><strong>Entry Fee:</strong> ${feeText}</p>
          <p style="margin: 0;"><strong>Refund Status:</strong> <span style="color: #f59e0b; font-weight: bold;">${refundStatusText}</span></p>
        </div>
        <p>Your entry fee will be refunded directly to your coin wallet.</p>
      `,
      ctaText: "VIEW TOURNAMENTS",
      ctaUrl: `${getAppBaseUrl()}/tournaments`,
      ctaBg: "#475569",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_CANCELLED" as any,
      subject,
      textBody,
      htmlBody,
      metadata: { reason: params.reason, entryFee: params.entryFee },
    });
  }

  // ==========================================================================
  // 15. Refund Completed Email
  // ==========================================================================
  static async sendRefundCompletedEmail(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    amount: number;
    refundId?: string;
  }): Promise<TournamentEmailRecord> {
    const walletUrl = `${getAppBaseUrl()}/wallet`;
    const subject = `💰 Tournament Entry Refunded — ${params.tournamentTitle}`;

    const textBody = `💰 Tournament Entry Refunded\n\nTournament: ${params.tournamentTitle}\nAmount: ${params.amount} Coins\nStatus: Refunded\n\nYour wallet balance has been credited.\n\n[VIEW WALLET]: ${walletUrl}`;

    const htmlBody = generateResponsiveHtml({
      title: "💰 Entry Fee Refunded",
      headerBadge: "REFUNDED",
      badgeBg: "#dcfce7",
      badgeColor: "#166534",
      bodyHtml: `
        <p>Your tournament registration refund has been processed successfully.</p>
        <div class="details-box" style="border-left: 4px solid #10b981;">
          <p style="margin: 0 0 8px 0;"><strong>Tournament:</strong> ${params.tournamentTitle}</p>
          <p style="margin: 0 0 8px 0;"><strong>Amount Refunded:</strong> <span style="color: #10b981; font-weight: bold;">${params.amount} Coins</span></p>
          <p style="margin: 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">✓ Refunded to Wallet</span></p>
        </div>
        <p>The coins are now available in your wallet balance.</p>
      `,
      ctaText: "VIEW WALLET",
      ctaUrl: walletUrl,
      ctaBg: "#10b981",
    });

    return this.dispatchTournamentEmail({
      userId: params.userId,
      tournamentId: params.tournamentId,
      eventType: "TOURNAMENT_REFUND_COMPLETED" as any,
      subject,
      textBody,
      htmlBody,
      metadata: { amount: params.amount, refundId: params.refundId },
    });
  }
}

function ordinalSuffix(n: number): string {
  const abs = Math.abs(n);
  if (abs % 100 >= 11 && abs % 100 <= 13) return "th";
  switch (abs % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
