import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, changePasswordSchema, setup2FASchema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import { auditFromRequest } from "../services/audit";

const scryptAsync = promisify(scrypt);

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
  return randomBytes(20).toString("base64");
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
      select: { twoFactorEnabled: true, passwordHash: true },
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
    
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: data.enable,
      },
    });
    
    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: data.enable ? "security.2fa.enabled" : "security.2fa.disabled",
      category: "security",
      targetType: "user",
      targetId: user.id,
    });
    
    return {
      ok: true,
      enabled: data.enable,
      secret: data.enable ? secret : undefined,
    };
  });
  
  app.post("/api/security/2fa/disable", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    
    if (!profile?.twoFactorEnabled) {
      throw new AppError("VALIDATION_ERROR", "2FA is not enabled", 400);
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
}
