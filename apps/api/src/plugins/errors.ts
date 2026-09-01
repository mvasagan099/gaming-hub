import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, toApiError } from "@gaming-hub/shared";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          details: error.flatten().fieldErrors,
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(toApiError(error));
    }

    // Respect 4xx status codes raised by Fastify itself (e.g. 413 body too large).
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Request failed validation";
      return reply.status(status).send({
        error: {
          code: "VALIDATION_ERROR",
          message,
        },
      });
    }

    request.log.error({ error }, "Unhandled error");

    // Capture unhandled errors to the error center for operator triage
    // (fire-and-forget; gated by the infra.errorCapture feature flag).
    void import("../services/errors").then(async ({ captureError }) => {
      const { isFeatureEnabled } = await import("../services/featureFlags");
      const enabled = await isFeatureEnabled("infra.errorCapture").catch(() => true);
      if (!enabled) return;
      await captureError({
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : null,
        severity: "HIGH",
        source: "api",
        path: request.url,
        method: request.method,
        userId: request.user?.id ?? null,
        ip: request.ip,
        userAgent:
          typeof request.headers["user-agent"] === "string"
            ? request.headers["user-agent"]
            : null,
      }).catch(() => undefined);
    });

    return reply.status(500).send(toApiError(error));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
