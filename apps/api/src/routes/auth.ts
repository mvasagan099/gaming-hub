import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { authSessionSchema } from "@gaming-hub/shared";
import { verifyAccessToken } from "../auth/supabase";
import { ensureUser, getAuthenticatedUserData } from "../services/users";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    return getAuthenticatedUserData(requireUser(request));
  });

  app.post("/api/auth/session", async (request) => {
    const { token } = authSessionSchema.parse(request.body);
    let verified;
    try {
      verified = await verifyAccessToken(token);
    } catch {
      throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401);
    }
    await ensureUser(verified.sub, verified.email, verified.userMetadata);
    return { status: "ok" };
  });
}
