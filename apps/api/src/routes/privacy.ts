/**
 * M-01: Privacy routes — persistent privacy settings for users.
 *
 * GET  /api/privacy   — returns caller's privacy settings
 * PATCH /api/privacy  — updates caller's privacy settings (partial)
 */

import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { getPrivacySettings, updatePrivacySettings } from "../services/privacyService";
import { auditFromRequest } from "../services/audit";

export async function privacyRoutes(app: FastifyInstance) {
  // GET /api/privacy — retrieve caller's privacy settings
  app.get("/api/privacy", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const settings = await getPrivacySettings(user.id);
    return { ok: true, data: settings };
  });

  // PATCH /api/privacy — update caller's privacy settings (partial)
  app.patch("/api/privacy", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const body = request.body as Record<string, unknown> | null | undefined;

    if (!body || typeof body !== "object") {
      throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object", 400);
    }

    const ALLOWED_KEYS = new Set([
      "profileVisibility",
      "showEmail",
      "showPhone",
      "showStats",
      "allowFriendRequests",
      "allowGameInvites",
    ]);

    // Only pass known keys to avoid prototype pollution or unexpected fields
    const patch: Record<string, unknown> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError("VALIDATION_ERROR", "No valid privacy fields provided", 400);
    }

    let settings;
    try {
      settings = await updatePrivacySettings(user.id, patch as Parameters<typeof updatePrivacySettings>[1]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid privacy settings";
      throw new AppError("VALIDATION_ERROR", msg, 400);
    }

    await auditFromRequest(request, {
      actorType: "user",
      actorId: user.id,
      action: "user.privacy.updated",
      category: "account",
      targetType: "user",
      targetId: user.id,
      meta: { fields: Object.keys(patch) },
    });

    return { ok: true, data: settings };
  });
}
