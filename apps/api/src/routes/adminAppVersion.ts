import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError, isValidSemver } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requirePermission } from "../lib/permissions";
import { parseSchema } from "../lib/http";
import { auditFromRequest } from "../services/audit";

const APP_VERSION_CONFIG_ID = "app-version-config-singleton";

const updateSchema = z.object({
  latestVersion: z.string().trim().min(1).max(20),
  minimumSupportedVersion: z.string().trim().min(1).max(20),
  downloadUrl: z.string().trim().url().max(500),
  updateMessage: z.string().trim().min(1).max(500),
  forceUpdate: z.boolean(),
});

export async function adminAppVersionRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/app/version-config
   * Returns the full config including admin metadata.
   */
  app.get(
    "/api/admin/app/version-config",
    { preHandler: authenticate },
    async (request) => {
      await requirePermission(request, "admin:settings:view", prisma);

      const config = await prisma.appVersionConfig.findFirst({
        // Backlog fix: desc ensures the most recently updated record wins.
        orderBy: { updatedAt: "desc" },
      });

      if (!config) {
        // Seed a default record if none exists yet.
        return prisma.appVersionConfig.create({
          data: {
            id: APP_VERSION_CONFIG_ID,
            latestVersion: "1.0",
            minimumSupportedVersion: "1.0",
            downloadUrl:
              "https://play.google.com/store/apps/details?id=com.gaminghub.app",
            updateMessage:
              "A new version of Gaming Hub is required. Please update to continue playing.",
            forceUpdate: false,
          },
        });
      }

      return config;
    },
  );

  /**
   * PUT /api/admin/app/version-config
   * Upserts the version config. Validates semver format before writing.
   */
  app.put(
    "/api/admin/app/version-config",
    { preHandler: authenticate },
    async (request) => {
      const actor = await requirePermission(
        request,
        "admin:settings:edit",
        prisma,
      );

      const body = parseSchema(updateSchema, request.body);

      // Validate semver format for both version fields
      if (!isValidSemver(body.latestVersion)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Invalid latestVersion "${body.latestVersion}": must be a valid version like "1.0" or "1.2.3"`,
          422,
        );
      }
      if (!isValidSemver(body.minimumSupportedVersion)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Invalid minimumSupportedVersion "${body.minimumSupportedVersion}": must be a valid version like "1.0" or "1.2.3"`,
          422,
        );
      }

      // SECURITY: Restrict downloadUrl to safe schemes only.
      // Zod .url() already validates format, but it accepts any scheme including
      // javascript:, data:, file:, etc.  We explicitly allow only https:// and
      // market:// (Google Play Store deep link) to prevent URI injection.
      const parsedUrl = (() => {
        try { return new URL(body.downloadUrl); } catch { return null; }
      })();
      if (!parsedUrl || (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "market:")) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Invalid downloadUrl: only https:// and market:// schemes are permitted`,
          422,
        );
      }

      const config = await prisma.appVersionConfig.upsert({
        where: { id: APP_VERSION_CONFIG_ID },
        create: {
          id: APP_VERSION_CONFIG_ID,
          ...body,
          updatedBy: actor.id,
        },
        update: {
          ...body,
          updatedBy: actor.id,
        },
      });

      auditFromRequest(request, {
        actorType: "user",
        actorId: actor.id,
        action: "admin.appVersion.update",
        category: "admin",
        targetType: "AppVersionConfig",
        targetId: config.id,
        meta: {
          latestVersion: config.latestVersion,
          minimumSupportedVersion: config.minimumSupportedVersion,
          forceUpdate: config.forceUpdate,
        },
      });

      return config;
    },
  );
}
