import { z } from "zod";
import { GAME_IDS } from "./games";

const requiredString = (max: number) => z.string().trim().min(1).max(max);

export const authSessionSchema = z.object({
  token: z.string().min(20, "A valid Supabase access token is required"),
});

export const chessTimeControlSchema = z.object({
  baseSeconds: z.number().int().min(0).max(7_200),
  incrementSeconds: z.number().int().min(0).max(300),
  delaySeconds: z.number().int().min(0).max(300),
});

export const matchSettingsSchema = z.object({
  timeControl: chessTimeControlSchema.nullable().optional(),
  rated: z.boolean().optional(),
});

export const createRoomSchema = z.object({
  gameId: z.enum(GAME_IDS),
  isPrivate: z.boolean().default(false),
  stake: z.number().int().min(1).max(1_000_000).default(100),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  settings: matchSettingsSchema.optional(),
});

export const joinRoomSchema = z.object({
  roomId: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6}$/, "Room code must be 6 characters")
    .optional(),
  asSpectator: z.boolean().default(false),
}).refine((v) => Boolean(v.roomId) !== Boolean(v.code), {
  message: "Provide exactly one of roomId or code",
});

export const readySchema = z.object({
  roomId: z.string().uuid(),
  ready: z.boolean(),
});

export const startGameSchema = z.object({
  roomId: z.string().uuid(),
});

export const leaveRoomSchema = z.object({
  roomId: z.string().uuid(),
});

export const gameActionSchema = z.object({
  roomId: z.string().uuid(),
  action: z.record(z.string(), z.unknown()).refine(
    (a) => typeof a === "object" && a !== null && "type" in a && typeof a.type === "string",
    "action must be an object with a string `type`",
  ),
});

export const chatMessageSchema = z.object({
  roomId: z.string().uuid(),
  text: requiredString(500),
});

export const chatEmojiSchema = z.object({
  roomId: z.string().uuid(),
  emoji: z.string().length(1).refine((v) => /\p{Emoji}/u.test(v), "must be an emoji"),
});

export const matchmakingJoinSchema = z.object({
  gameId: z.enum(GAME_IDS),
  stake: z.number().int().min(0).max(1_000_000).default(100),
  gameMode: z.enum(["casual", "ranked"]).optional().default("casual"),
  settings: matchSettingsSchema.optional(),
});

export const updateProfileSchema = z.object({
  displayName: requiredString(40).optional(),
  bio: z.string().trim().max(240).optional(),
  country: z.string().trim().max(60).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  phone: z.string().trim().max(20).optional(),
  dateOfBirth: z.string().datetime().optional(),
  streetAddress: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
  isPrivate: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const setup2FASchema = z.object({
  enable: z.boolean(),
  currentPassword: z.string().optional(),
});

export const verify2FASchema = z.object({
  token: z.string().length(6, "Token must be 6 digits").regex(/^\d+$/, "Token must be digits only"),
  userId: z.string().uuid().optional(),
});

export const disable2FASchema = z.object({
  token: z.string().length(6, "Token must be 6 digits").regex(/^\d+$/, "Token must be digits only"),
});

export const sendFriendRequestSchema = z.object({
  username: requiredString(40),
});

export const respondFriendRequestSchema = z.object({
  requestId: z.string().uuid(),
  accept: z.boolean(),
});
