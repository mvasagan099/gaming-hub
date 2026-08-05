import type { FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import { AppError } from "@gaming-hub/shared";

export function parseSchema<TSchema extends ZodType>(
  schema: TSchema,
  data: unknown,
): TSchema["_output"] {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request payload", 422, result.error.flatten());
  }
  return result.data;
}

export function requireUser(request: FastifyRequest): NonNullable<FastifyRequest["user"]> {
  if (!request.user) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
  return request.user;
}

export function routeParams(request: FastifyRequest): Record<string, string> {
  return request.params as Record<string, string>;
}

export function queryParams(
  request: FastifyRequest,
): Record<string, string | string[] | undefined> {
  return (request.query ?? {}) as Record<string, string | string[] | undefined>;
}

export function queryString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}
