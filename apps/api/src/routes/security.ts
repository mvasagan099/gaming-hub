import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { generateSecret, generateURI, verify, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { prisma } from "@gaming-hub/db";
import { AppError, changePasswordSchema, setup2FASchema, verify2FASchema, disable2FASchema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import { auditFromRequest } from "../services/audit";

const scryptAsync = promisify(scrypt);

const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return derivedKey.toString("hex") === hash;
}

function generateTOTPSecret(): string {
  return generateSecret();
}

async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({
      token,
      secret,
      crypto: cryptoPlugin,
      base32: base32Plugin,
      epochTolerance: 30,
    });
    return result.valid;
  } catch {
    return false;
  }
}

function getTOTPAuthUrl(userEmail: string, secret: string, issuer: string = "Gaming Hub"): string {
  return generateURI({
    secret,
    label: userEmail,
    issuer,
  });
}

export async function securityRoutes(app: FastifyInstance) {
  app.patch("/api/security/password", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(changePasswordSchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { passwordHash: true },
    });
    
    if (!profile?.passwordHash) {
      throw new AppError("VALIDATION_ERROR", "Account uses external authentication. Password cannot be changed here.", 400);
    }
    
    if (!(await verifyPassword(data.currentPassword, profile.passwordHash))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.password.failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_current_password" },
      });
      throw new AppError("VALIDATION_ERROR", "Current password is incorrect", 401);
    }
    
    if (data.newPassword !== data.confirmPassword) {
      throw new AppError("VALIDATION_ERROR", "New passwords do not match", 400);
    }
    
    if (data.newPassword.length < 8) {
      throw new AppError("VALIDATION_ERROR", "Password must be at least 8 characters", 400);
    }
    
    const newPasswordHash = await hashPassword(data.newPassword);
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: { passwordHash: newPasswordHash },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.password.changed",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true };
  });
  
  app.post("/api/security/2fa/setup", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(setup2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, passwordHash: true, email: true },
    });
    
    if (!profile) {
      throw new AppError("NOT_FOUND", "Profile not found", 404);
    }
    
    if (!profile.passwordHash) {
      throw new AppError("VALIDATION_ERROR", "You must set a password before enabling 2FA", 400);
    }
    
    if (profile.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is already enabled", 400);
    }
    
    const secret = generateTOTPSecret();
    const email = profile.email ?? user.email ?? "user";
    const authUrl = getTOTPAuthUrl(email, secret);
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        twoFactorSecret: secret,
      },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.setup_initiated",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return {
      ok: true,
      secret,
      authUrl,
    };
  });
  
  app.post("/api/security/2fa/verify", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(verify2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    
    if (!profile) {
      throw new AppError("NOT_FOUND", "Profile not found", 404);
    }
    
    if (profile.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is already enabled", 400);
    }
    
    if (!profile.twoFactorSecret) {
      throw new AppError("VALIDATION_ERROR", "2FA setup not initiated. Call /setup first", 400);
    }
    
    if (!(await verifyTOTP(data.token, profile.twoFactorSecret))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.2fa.verify_failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_totp" },
      });
      throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
    }
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: { twoFactorEnabled: true },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.enabled",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true, enabled: true };
  });
  
  app.post("/api/security/2fa/disable", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(disable2FASchema, request.body);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true, passwordHash: true },
    });
    
    if (!profile?.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is not enabled", 400);
    }
    
    if (!(await verifyTOTP(data.token, profile.twoFactorSecret!))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "security.2fa.disable_failed",
        category: "security",
        targetType: "user",
        targetId: user.id,
        meta: { reason: "invalid_totp" },
      });
      throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
    }
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
      },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "security.2fa.disabled",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return { ok: true };
  });
  
  app.post("/api/security/2fa/verify-login", async (request) => {
    const data = parseSchema(verify2FASchema, request.body);
    
    if (!data.userId || !data.token) {
      throw new AppError("VALIDATION_ERROR", "userId and token are required", 400);
    }
    
    const profile = await prisma.profile.findUnique({
      where: { userId: data.userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    
    if (!profile || !profile.twoFactorEnabled || !profile.twoFactorSecret) {
      throw new AppError("VALIDATION_ERROR", "2FA is not enabled for this account", 400);
    }
    
    if (!(await verifyTOTP(data.token, profile.twoFactorSecret))) {
      await auditFromRequest(request, {
        actorType: "user",
        actorId: data.userId,
        action: "security.2fa.login_failed",
        category: "security",
        targetType: "user",
        targetId: data.userId,
        meta: { reason: "invalid_totp" },
      });
      throw new AppError("VALIDATION_ERROR", "Invalid verification code", 400);
    }
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: data.userId,
      action: "security.2fa.login_success",
      category: "security",
      targetType: "user",
      targetId: data.userId,
    });
    
    return { ok: true };
  });
}
