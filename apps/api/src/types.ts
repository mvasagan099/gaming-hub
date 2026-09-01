import type { Prisma } from "@gaming-hub/db";

declare module "fastify" {
  interface FastifyRequest {
    /** Authenticated user, populated by the authenticate plugin. */
    user: Prisma.UserGetPayload<object> | null;
  }
}

export {};
