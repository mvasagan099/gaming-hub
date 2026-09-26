import { PrismaClient } from "./generated/client/index.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient(): PrismaClient {
  const limit = process.env.DB_CONNECTION_LIMIT;
  if (limit && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("connection_limit")) {
    const separator = process.env.DATABASE_URL.includes("?") ? "&" : "?";
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${separator}connection_limit=${limit}`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./generated/client/index.js";
