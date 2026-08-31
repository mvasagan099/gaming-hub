import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";

/**
 * Public (unauthenticated) endpoint that returns the current Android app version config.
 *
 * This endpoint MUST be callable before the user logs in so the app can apply
 * the hard-lock gate even on the login/signup screens.
 *
 * No secrets or user data are included in the response.
 */
export async function appVersionRoutes(app: FastifyInstance) {
  app.get("/api/app/version-config", async () => {
    const config = await prisma.appVersionConfig.findFirst({
      orderBy: { updatedAt: "asc" },
    });

    if (!config) {
      // Return maximally permissive defaults if the table is empty.
      return {
        latestVersion: "1.0",
        minimumSupportedVersion: "1.0",
        downloadUrl:
          "https://play.google.com/store/apps/details?id=com.gaminghub.app",
        updateMessage:
          "A new version of Gaming Hub is required. Please update to continue playing.",
        forceUpdate: false,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      latestVersion: config.latestVersion,
      minimumSupportedVersion: config.minimumSupportedVersion,
      downloadUrl: config.downloadUrl,
      updateMessage: config.updateMessage,
      forceUpdate: config.forceUpdate,
      updatedAt: config.updatedAt.toISOString(),
    };
  });
}
