import { z } from "zod";

/**
 * Centralized site configuration.
 *
 * Every setting lives in the `SiteSetting` table as a JSON value keyed by a
 * dotted identifier (`<category>.<field>`). This module is the single source
 * of truth for the shape, validation, defaults, and UI metadata of those
 * settings. Both the API (enforcement + admin CRUD) and the web app
 * (rendering + public display) import from here so the model can never drift.
 *
 * Adding a new setting = add it to the relevant category schema + defaults +
 * (optionally) metadata. No migration required — unknown rows are ignored and
 * missing rows fall back to the defaults below.
 */

// ---------------------------------------------------------------------------
// Category schemas
// ---------------------------------------------------------------------------

export const generalSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(80).default("Gaming Hub"),
  logoUrl: z.string().trim().max(500).default("").or(z.literal("")),
  faviconUrl: z.string().trim().max(500).default(""),
  theme: z.enum(["light", "dark", "system"]).default("dark"),
  primaryColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Use a 6-digit hex color, e.g. #6366f1")
    .default("#6366f1"),
  timezone: z.string().trim().max(60).default("UTC"),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).default("YYYY-MM-DD"),
  timeFormat: z.enum(["12h", "24h"]).default("24h"),
  defaultLanguage: z.string().trim().min(2).max(8).default("en"),
  defaultCurrency: z.string().trim().min(3).max(3).default("USD"),
  maintenanceEnabled: z.boolean().default(false),
  maintenanceMessage: z.string().trim().max(280).default(""),
  contactEmail: z.string().trim().max(160).default(""),
  socialLinks: z
    .record(z.string().trim().max(200), z.string().trim().max(500))
    .default({}),
});

export const authSettingsSchema = z.object({
  signupEnabled: z.boolean().default(true),
  emailVerificationRequired: z.boolean().default(true),
  mobileVerificationEnabled: z.boolean().default(false),
  googleLoginEnabled: z.boolean().default(false),
  appleLoginEnabled: z.boolean().default(false),
  discordLoginEnabled: z.boolean().default(false),
  twoFactorRequired: z.boolean().default(false),
  passwordMinLength: z.number().int().min(6).max(128).default(8),
  passwordRequireUppercase: z.boolean().default(true),
  passwordRequireNumber: z.boolean().default(true),
  passwordRequireSymbol: z.boolean().default(false),
  sessionTimeoutMinutes: z.number().int().min(1).max(10080).default(10080),
  maxLoginAttempts: z.number().int().min(1).max(100).default(15),
  accountLockDurationMinutes: z.number().int().min(1).max(1440).default(15),
  rememberMeEnabled: z.boolean().default(true),
});

export const securitySettingsSchema = z.object({
  rateLimitMax: z.number().int().min(1).max(100000).default(300),
  allowedCountries: z.array(z.string().trim().min(2).max(2)).default([]),
  blockedCountries: z.array(z.string().trim().min(2).max(2)).default([]),
  allowedIpAllowlist: z.array(z.string().trim().max(45)).default([]),
  blockedIps: z.array(z.string().trim().max(45)).default([]),
  vpnDetectionEnabled: z.boolean().default(false),
  proxyDetectionEnabled: z.boolean().default(false),
  deviceTrustEnabled: z.boolean().default(false),
  cspEnabled: z.boolean().default(true),
  fileUploadEnabled: z.boolean().default(true),
  maxUploadBytes: z.number().int().min(1).max(100 * 1024 * 1024).default(5 * 1024 * 1024),
  auditLoggingEnabled: z.boolean().default(true),
  captchaEnabled: z.boolean().default(false),
  csrfProtectionEnabled: z.boolean().default(true),
});

export const walletSettingsSchema = z.object({
  minDeposit: z.number().int().min(0).max(10_000_000).default(0),
  maxDeposit: z.number().int().min(0).max(100_000_000).default(100_000),
  minWithdrawal: z.number().int().min(0).max(10_000_000).default(100),
  maxWithdrawal: z.number().int().min(0).max(100_000_000).default(50_000),
  withdrawalFeePercent: z.number().min(0).max(100).default(0),
  dailyWithdrawalLimit: z.number().int().min(0).max(100_000_000).default(20_000),
  maxPendingWithdrawalRequests: z.number().int().min(1).max(100).default(5),
  otpExpiryMinutes: z.number().int().min(1).max(60).default(10),
  otpMaxAttempts: z.number().int().min(1).max(20).default(5),
  currencyConversionEnabled: z.boolean().default(false),
  bonusWalletEnabled: z.boolean().default(true),
  referralReward: z.number().int().min(0).max(100_000).default(500),
  cashbackPercent: z.number().min(0).max(100).default(0),
});

export const paymentSettingsSchema = z.object({
  stripeEnabled: z.boolean().default(false),
  stripeSecretKey: z.string().trim().max(200).default(""),
  stripePublishableKey: z.string().trim().max(200).default(""),
  stripeWebhookSecret: z.string().trim().max(200).default(""),
  paypalEnabled: z.boolean().default(false),
  paypalClientId: z.string().trim().max(200).default(""),
  paypalClientSecret: z.string().trim().max(200).default(""),
  paypalWebhookId: z.string().trim().max(200).default(""),
  razorpayEnabled: z.boolean().default(false),
  razorpayKeyId: z.string().trim().max(200).default(""),
  razorpayKeySecret: z.string().trim().max(200).default(""),
  razorpayWebhookSecret: z.string().trim().max(200).default(""),
  manualPaymentsEnabled: z.boolean().default(false),
  exchangeRateProvider: z.enum(["none", "fixer", "openexchangerates"]).default("none"),
  paymentTimeoutSeconds: z.number().int().min(10).max(3600).default(300),
  retryAttempts: z.number().int().min(0).max(20).default(3),
});

export const gameSettingsSchema = z.object({
  disabledGames: z.array(z.string().trim().min(1).max(40)).default([]),
  featuredGames: z.array(z.string().trim().min(1).max(40)).default([]),
  matchmakingTimeoutSeconds: z.number().int().min(5).max(600).default(120),
  turnTimerSeconds: z.number().int().min(0).max(600).default(45),
  maxMatchDurationSeconds: z.number().int().min(30).max(600).default(600),
  spectatorModeEnabled: z.boolean().default(true),
  reconnectTimeoutSeconds: z.number().int().min(5).max(600).default(90),
  xpRewardPerWin: z.number().int().min(0).max(10_000).default(50),
  coinRewardPerWin: z.number().int().min(0).max(100_000).default(25),
  dailyRewardEnabled: z.boolean().default(true),
  dailyRewardAmount: z.number().int().min(0).max(10_000).default(100),
  aiDifficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  defaultStake: z.number().int().min(0).max(100_000).default(100),
  defaultMaxPlayers: z.number().int().min(2).max(8).default(4),
  practiceModeEnabled: z.boolean().default(true),
  practiceRewardAmount: z.number().int().min(0).max(10_000).default(50),
  practiceDailyLimit: z.number().int().min(0).max(100_000).default(200),
});

export const lotterySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  ticketPrice: z.number().int().min(0).max(100_000).default(100),
  drawScheduleCron: z.string().trim().max(120).default("0 20 * * *"),
  prizeDistribution: z
    .array(z.object({ place: z.number().int().min(1).max(100), percent: z.number().min(0).max(100) }))
    .default([]),
  jackpotEnabled: z.boolean().default(false),
  jackpotSeed: z.number().int().min(0).max(1_000_000_000).default(0),
  drawTimezone: z.string().trim().max(60).default("UTC"),
  drawAutomated: z.boolean().default(true),
  winnerAnnouncementEnabled: z.boolean().default(true),
});

export const couponSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  defaultExpiryDays: z.number().int().min(1).max(365).default(30),
  maxRedemptionsPerCoupon: z.number().int().min(1).max(1_000_000).default(1000),
  countryRestrictionsEnabled: z.boolean().default(false),
  autoGenerateEnabled: z.boolean().default(false),
});

export const notificationSettingsSchema = z.object({
  emailNotificationsEnabled: z.boolean().default(true),
  smsNotificationsEnabled: z.boolean().default(false),
  pushNotificationsEnabled: z.boolean().default(false),
  inAppNotificationsEnabled: z.boolean().default(true),
  broadcastNotificationsEnabled: z.boolean().default(true),
  scheduledNotificationsEnabled: z.boolean().default(false),
});

export const storageSettingsSchema = z.object({
  provider: z.enum(["supabase", "s3"]).default("supabase"),
  s3Bucket: z.string().trim().max(200).default(""),
  s3Region: z.string().trim().max(80).default(""),
  s3AccessKeyId: z.string().trim().max(200).default(""),
  s3SecretAccessKey: z.string().trim().max(200).default(""),
  maxUploadBytes: z.number().int().min(1).max(100 * 1024 * 1024).default(5 * 1024 * 1024),
  allowedFileTypes: z.array(z.string().trim().max(40)).default([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ]),
  backupStoragePath: z.string().trim().max(500).default(""),
});

export const emailSettingsSchema = z.object({
  smtpHost: z.string().trim().max(200).default(""),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUsername: z.string().trim().max(200).default(""),
  smtpPassword: z.string().trim().max(200).default(""),
  senderEmail: z.string().trim().max(200).default(""),
  senderName: z.string().trim().max(120).default("Gaming Hub"),
  verificationTemplateEnabled: z.boolean().default(true),
  passwordResetTemplateEnabled: z.boolean().default(true),
});

export const apiSettingsSchema = z.object({
  webhooksEnabled: z.boolean().default(false),
  webhookSecret: z.string().trim().max(200).default(""),
  apiVersion: z.string().trim().max(20).default("v1"),
  perKeyRateLimit: z.number().int().min(1).max(100000).default(300),
});

export const backupSettingsSchema = z.object({
  automaticBackupsEnabled: z.boolean().default(false),
  backupScheduleCron: z.string().trim().max(120).default("0 3 * * *"),
  backupRetentionDays: z.number().int().min(1).max(3650).default(30),
  lastBackupAt: z.string().trim().max(40).default(""),
});

export const localizationSettingsSchema = z.object({
  enabledLanguages: z.array(z.string().trim().min(2).max(8)).default(["en"]),
  enabledCountries: z.array(z.string().trim().min(2).max(2)).default([]),
  enabledCurrencies: z.array(z.string().trim().min(3).max(3)).default(["USD"]),
  translationManagementEnabled: z.boolean().default(false),
});

export const developerSettingsSchema = z.object({
  debugMode: z.boolean().default(false),
  featureFlags: z.record(z.string().trim().max(80), z.boolean()).default({}),
  experimentalFeaturesEnabled: z.boolean().default(false),
  apiTestingEnabled: z.boolean().default(false),
  queueMonitorEnabled: z.boolean().default(false),
});

export const referralSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  referrerReward: z.number().int().min(0).max(100_000).default(500),
  referredReward: z.number().int().min(0).max(100_000).default(250),
  commissionPercent: z.number().min(0).max(100).default(5),
  minDepositToReward: z.number().int().min(0).max(100_000).default(0),
  qualificationRule: z
    .enum(["REGISTRATION", "FIRST_GAME", "FIRST_WIN", "FIRST_DEPOSIT", "TOURNAMENT_JOIN"])
    .default("FIRST_GAME"),
  maxRewardsPerUser: z.number().int().min(0).max(100_000).default(0),
  campaignStartDate: z.string().nullable().default(null),
  campaignEndDate: z.string().nullable().default(null),
  leaderboardEnabled: z.boolean().default(true),
  codeAutoGenerate: z.boolean().default(true),
});

export const tournamentSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  autoScheduling: z.boolean().default(false),
  defaultMaxPlayers: z.number().int().min(2).max(256).default(16),
  defaultEntryFee: z.number().int().min(0).max(100_000).default(0),
  defaultPrizePool: z.number().int().min(0).max(1_000_000).default(1000),
  entryFeeEnabled: z.boolean().default(true),
  refundOnCancel: z.boolean().default(true),
  maxPerUserPerDay: z.number().int().min(1).max(100).default(10),
});

export const messagingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  dmEnabled: z.boolean().default(true),
  maxMessageLength: z.number().int().min(1).max(4000).default(1000),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(60),
  attachmentsEnabled: z.boolean().default(false),
  readReceiptsEnabled: z.boolean().default(true),
  blockEnabled: z.boolean().default(true),
});

export const supportSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  autoReplyEnabled: z.boolean().default(false),
  autoReplyText: z.string().trim().max(1000).default(""),
  categories: z
    .array(z.string().trim().min(1).max(60))
    .default(["GENERAL", "PAYMENT", "ACCOUNT", "TECHNICAL", "REPORT"]),
  maxTicketsPerUserPerDay: z.number().int().min(1).max(100).default(5),
});

export const automationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  cleanupRetentionDays: z.number().int().min(1).max(3650).default(90),
  sessionRevocationEnabled: z.boolean().default(false),
  sessionRevocationAfterDays: z.number().int().min(1).max(365).default(30),
  expiredCouponCleanupEnabled: z.boolean().default(true),
  expiredAnnouncementCleanupEnabled: z.boolean().default(true),
  backupEnabled: z.boolean().default(false),
  backupScheduleCron: z.string().trim().max(120).default("0 3 * * *"),
});

export const searchSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  saveHistory: z.boolean().default(true),
  maxResults: z.number().int().min(1).max(200).default(50),
  userSearchEnabled: z.boolean().default(true),
  tournamentSearchEnabled: z.boolean().default(true),
  eventSearchEnabled: z.boolean().default(true),
  achievementSearchEnabled: z.boolean().default(true),
  ticketSearchEnabled: z.boolean().default(true),
  couponSearchEnabled: z.boolean().default(true),
});

export const leaderboardSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  refreshIntervalMinutes: z.number().int().min(1).max(1440).default(30),
  topPlayersCount: z.number().int().min(1).max(1000).default(100),
  weeklyResetEnabled: z.boolean().default(true),
  showWinnings: z.boolean().default(true),
  gameEnabled: z.boolean().default(true),
  countryEnabled: z.boolean().default(true),
  regionEnabled: z.boolean().default(true),
  friendsEnabled: z.boolean().default(true),
  tournamentEnabled: z.boolean().default(true),
  periodsEnabled: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export const SETTINGS_CATEGORIES = {
  general: generalSettingsSchema,
  auth: authSettingsSchema,
  security: securitySettingsSchema,
  wallet: walletSettingsSchema,
  payment: paymentSettingsSchema,
  game: gameSettingsSchema,
  lottery: lotterySettingsSchema,
  coupon: couponSettingsSchema,
  notification: notificationSettingsSchema,
  storage: storageSettingsSchema,
  email: emailSettingsSchema,
  api: apiSettingsSchema,
  backup: backupSettingsSchema,
  localization: localizationSettingsSchema,
  developer: developerSettingsSchema,
  referral: referralSettingsSchema,
  tournament: tournamentSettingsSchema,
  messaging: messagingSettingsSchema,
  support: supportSettingsSchema,
  automation: automationSettingsSchema,
  search: searchSettingsSchema,
  leaderboard: leaderboardSettingsSchema,
} as const;

export type SettingsCategoryName = keyof typeof SETTINGS_CATEGORIES;

export type SettingsShape = {
  general: z.infer<typeof generalSettingsSchema>;
  auth: z.infer<typeof authSettingsSchema>;
  security: z.infer<typeof securitySettingsSchema>;
  wallet: z.infer<typeof walletSettingsSchema>;
  payment: z.infer<typeof paymentSettingsSchema>;
  game: z.infer<typeof gameSettingsSchema>;
  lottery: z.infer<typeof lotterySettingsSchema>;
  coupon: z.infer<typeof couponSettingsSchema>;
  notification: z.infer<typeof notificationSettingsSchema>;
  storage: z.infer<typeof storageSettingsSchema>;
  email: z.infer<typeof emailSettingsSchema>;
  api: z.infer<typeof apiSettingsSchema>;
  backup: z.infer<typeof backupSettingsSchema>;
  localization: z.infer<typeof localizationSettingsSchema>;
  developer: z.infer<typeof developerSettingsSchema>;
  referral: z.infer<typeof referralSettingsSchema>;
  tournament: z.infer<typeof tournamentSettingsSchema>;
  messaging: z.infer<typeof messagingSettingsSchema>;
  support: z.infer<typeof supportSettingsSchema>;
  automation: z.infer<typeof automationSettingsSchema>;
  search: z.infer<typeof searchSettingsSchema>;
  leaderboard: z.infer<typeof leaderboardSettingsSchema>;
};

/** Full aggregated settings object (all categories). */
export const siteSettingsSchema = z.object(SETTINGS_CATEGORIES);

function extractDefaults<K extends SettingsCategoryName>(category: K): SettingsShape[K] {
  return SETTINGS_CATEGORIES[category].parse({}) as SettingsShape[K];
}

/** Defaults derived from the schemas themselves (`.default(...)` applied). */
export const DEFAULT_SETTINGS: SettingsShape = {
  general: extractDefaults("general"),
  auth: extractDefaults("auth"),
  security: extractDefaults("security"),
  wallet: extractDefaults("wallet"),
  payment: extractDefaults("payment"),
  game: extractDefaults("game"),
  lottery: extractDefaults("lottery"),
  coupon: extractDefaults("coupon"),
  notification: extractDefaults("notification"),
  storage: extractDefaults("storage"),
  email: extractDefaults("email"),
  api: extractDefaults("api"),
  backup: extractDefaults("backup"),
  localization: extractDefaults("localization"),
  developer: extractDefaults("developer"),
  referral: extractDefaults("referral"),
  tournament: extractDefaults("tournament"),
  messaging: extractDefaults("messaging"),
  support: extractDefaults("support"),
  automation: extractDefaults("automation"),
  search: extractDefaults("search"),
  leaderboard: extractDefaults("leaderboard"),
};

export type SiteSettings = SettingsShape;

/**
 * Keys whose values must never be returned to non-admin clients (the public
 * `/api/settings` endpoint strips these). Listed by dotted key path.
 */
export const SECRET_SETTING_KEYS: ReadonlySet<string> = new Set([
  "payment.stripeSecretKey",
  "payment.stripeWebhookSecret",
  "payment.paypalClientSecret",
  "payment.paypalWebhookId",
  "payment.razorpayKeySecret",
  "payment.razorpayWebhookSecret",
  "storage.s3AccessKeyId",
  "storage.s3SecretAccessKey",
  "email.smtpPassword",
  "api.webhookSecret",
]);

// ---------------------------------------------------------------------------
// Field metadata (drives the admin settings editor)
// ---------------------------------------------------------------------------

export type SettingsFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "stringArray"
  | "objectArray"
  | "record";

export interface SettingsFieldMeta {
  key: string;
  label: string;
  kind: SettingsFieldKind;
  /** Present when `kind === "enum"`. */
  enumValues?: readonly string[];
  /** Present when `kind === "stringArray"`. */
  itemHint?: string;
}

function settingFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase());
}

function unwrapZodDefault(schema: { _def?: { type?: string; innerType?: unknown } }): unknown {
  let current: unknown = schema;
  while (
    current &&
    typeof current === "object" &&
    (current as { _def?: { type?: string } })._def?.type === "default"
  ) {
    current = (current as { _def: { innerType: unknown } })._def.innerType;
  }
  return current;
}

function describeSettingField(schema: unknown): { kind: SettingsFieldKind; enumValues?: readonly string[] } {
  const def = unwrapZodDefault(schema as { _def?: { type?: string; innerType?: unknown } });
  if (!def || typeof def !== "object") return { kind: "string" };
  const type = (def as { _def?: { type?: string } })._def?.type;

  switch (type) {
    case "boolean":
      return { kind: "boolean" };
    case "number":
      return { kind: "number" };
    case "string":
      return { kind: "string" };
    case "enum": {
      const entries = (def as { _def?: { entries?: Record<string, string> } })._def?.entries;
      return { kind: "enum", enumValues: entries ? Object.keys(entries) : [] };
    }
    case "array": {
      const element = (def as { _def?: { element?: unknown } })._def?.element;
      const elementDef = element && typeof element === "object"
        ? (element as { _def?: { type?: string } })._def?.type
        : undefined;
      return { kind: elementDef === "object" || elementDef === "record" ? "objectArray" : "stringArray" };
    }
    case "record":
      return { kind: "record" };
    default:
      return { kind: "string" };
  }
}

/**
 * Per-category field descriptors used by the admin settings UI. Derived from
 * the zod schemas so the editor never drifts from validation.
 */
export const SETTINGS_FIELD_META: Record<SettingsCategoryName, SettingsFieldMeta[]> = (() => {
  const out = {} as Record<SettingsCategoryName, SettingsFieldMeta[]>;
  for (const [category, schema] of Object.entries(SETTINGS_CATEGORIES) as Array<
    [SettingsCategoryName, { shape: Record<string, unknown> }]
  >) {
    const fields = Object.entries(schema.shape ?? {}).map(([key, fieldSchema]) => ({
      key,
      label: settingFieldLabel(key),
      ...describeSettingField(fieldSchema),
    }));
    out[category] = fields;
  }
  return out;
})();

/** Human-readable category metadata for UI rendering. */
export const SETTINGS_CATEGORY_META: Record<
  SettingsCategoryName,
  { label: string; description: string; icon: string }
> = {
  general: { label: "General", description: "Branding, locale, and maintenance.", icon: "Globe" },
  auth: { label: "Authentication", description: "Sign-in methods and password policy.", icon: "ShieldCheck" },
  security: { label: "Security", description: "Rate limits, geo/IP rules, hardening.", icon: "Lock" },
  wallet: { label: "Wallet", description: "Deposit and withdrawal limits and rewards.", icon: "Wallet" },
  payment: { label: "Payments", description: "Gateways, webhooks, and retry rules.", icon: "CreditCard" },
  game: { label: "Games", description: "Game enablement, matchmaking, and rewards.", icon: "Gamepad2" },
  lottery: { label: "Lottery", description: "Draws, jackpots, and prize splits.", icon: "Ticket" },
  coupon: { label: "Coupons", description: "Coupon expiry and redemption rules.", icon: "TicketPercent" },
  notification: { label: "Notifications", description: "Email, SMS, push, and broadcast.", icon: "Bell" },
  storage: { label: "Storage", description: "Object store and upload limits.", icon: "Database" },
  email: { label: "Email", description: "SMTP and transactional templates.", icon: "Mail" },
  api: { label: "API", description: "Webhooks, versioning, and rate limits.", icon: "Webhook" },
  backup: { label: "Backup", description: "Schedule and retention of backups.", icon: "Archive" },
  localization: { label: "Localization", description: "Languages, countries, currencies.", icon: "Languages" },
  developer: { label: "Developer", description: "Debug, feature flags, experiments.", icon: "Terminal" },
  referral: { label: "Referrals", description: "Rewards, commissions, and code rules.", icon: "Users" },
  tournament: { label: "Tournaments", description: "Entry fees, prizes, and scheduling.", icon: "Trophy" },
  messaging: { label: "Messaging", description: "DMs, rate limits, and attachments.", icon: "MessageSquare" },
  support: { label: "Support", description: "Tickets, categories, and auto-replies.", icon: "Headset" },
  automation: { label: "Automation", description: "Cleanup, sessions, and backups.", icon: "Bot" },
  search: { label: "Search", description: "Discovery scope and history.", icon: "Search" },
  leaderboard: { label: "Leaderboard", description: "Scope, period, and refresh options.", icon: "BarChart3" },
};

/**
 * Flatten a settings object into dotted key/value pairs, e.g.
 * `{ auth: { signupEnabled: true } }` -> `[{ key: "auth.signupEnabled", value: true, category: "auth" }]`.
 */
export function flattenSettings(settings: Partial<SiteSettings>): Array<{
  key: string;
  value: unknown;
  category: SettingsCategoryName;
}> {
  const out: Array<{ key: string; value: unknown; category: SettingsCategoryName }> = [];
  for (const [category, group] of Object.entries(settings) as Array<
    [SettingsCategoryName, Record<string, unknown>]
  >) {
    if (!group || typeof group !== "object") continue;
    for (const [field, value] of Object.entries(group)) {
      out.push({ key: `${category}.${field}`, value, category });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Enterprise feature-flag catalog. Stored in `developer.featureFlags` as a
 * flat `Record<string, boolean>`. Admin UI renders groups from here; the API
 * and socket server enforce the flags via `assertFeatureEnabled`.
 */
export interface FeatureFlagDef {
  key: string;
  label: string;
  description: string;
  default: boolean;
}

export const FEATURE_FLAG_GROUPS: Array<{
  group: string;
  label: string;
  description: string;
  flags: FeatureFlagDef[];
}> = [
  {
    group: "games",
    label: "Games & Betting",
    description: "Core game features, real-money play, and matchmaking.",
    flags: [
      { key: "games.enabled", label: "Games", description: "Master toggle for all game play.", default: true },
      { key: "games.realMoney", label: "Real-money play", description: "Allow wagering real wallet balances.", default: true },
      { key: "games.practice", label: "Practice mode", description: "Allow free practice games.", default: true },
      { key: "games.matchmaking", label: "Matchmaking", description: "Allow queue-based matchmaking.", default: true },
      { key: "games.spectator", label: "Spectator mode", description: "Allow watching live matches.", default: true },
    ],
  },
  {
    group: "payments",
    label: "Payments & Wallet",
    description: "Deposits, withdrawals, and bonus wallets.",
    flags: [
      { key: "payments.deposits", label: "Deposits", description: "Allow users to add funds.", default: true },
      { key: "payments.withdrawals", label: "Withdrawals", description: "Allow users to cash out.", default: true },
      { key: "payments.bonusWallet", label: "Bonus wallet", description: "Enable the separate bonus balance.", default: true },
      { key: "payments.lockedWallet", label: "Locked wallet", description: "Enable locked/vesting balances.", default: true },
      { key: "payments.cashback", label: "Cashback", description: "Enable cashback balance credits.", default: true },
    ],
  },
  {
    group: "social",
    label: "Social & Engagement",
    description: "Friends, messaging, leaderboards, and referrals.",
    flags: [
      { key: "social.friends", label: "Friends", description: "Enable friend requests and lists.", default: true },
      { key: "social.messaging", label: "Messaging", description: "Enable direct messages.", default: true },
      { key: "social.leaderboards", label: "Leaderboards", description: "Enable leaderboard views.", default: true },
      { key: "social.referrals", label: "Referrals", description: "Enable the referral program.", default: true },
      { key: "social.profiles", label: "Public profiles", description: "Allow viewing other users' profiles.", default: true },
    ],
  },
  {
    group: "content",
    label: "Content & Commerce",
    description: "Coupons, tournaments, announcements, and store.",
    flags: [
      { key: "content.coupons", label: "Coupons", description: "Enable coupon redemption.", default: true },
      { key: "content.tournaments", label: "Tournaments", description: "Enable tournament registration.", default: true },
      { key: "content.announcements", label: "Announcements", description: "Enable the announcement center.", default: true },
      { key: "content.store", label: "Item store", description: "Enable the in-app store.", default: true },
    ],
  },
  {
    group: "support",
    label: "Support & Trust",
    description: "Tickets, KYC, and account protection.",
    flags: [
      { key: "support.tickets", label: "Support tickets", description: "Enable the help desk.", default: true },
      { key: "support.kyc", label: "KYC verification", description: "Enable identity verification.", default: true },
      { key: "support.chat", label: "Live chat", description: "Enable live agent chat.", default: true },
    ],
  },
  {
    group: "infrastructure",
    label: "Infrastructure",
    description: "Platform-level operational toggles.",
    flags: [
      { key: "infra.maintenance", label: "Maintenance mode", description: "Read-only maintenance for all users.", default: false },
      { key: "infra.beta", label: "Beta channel", description: "Expose beta-only builds/features.", default: false },
      { key: "infra.auditLogging", label: "Audit logging", description: "Record audit events.", default: true },
      { key: "infra.errorCapture", label: "Error capture", description: "Record errors to the error center.", default: true },
    ],
  },
];

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = Object.fromEntries(
  FEATURE_FLAG_GROUPS.flatMap((g) => g.flags.map((f) => [f.key, f.default] as const)),
);
