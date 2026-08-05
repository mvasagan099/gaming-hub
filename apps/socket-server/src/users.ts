import { prisma } from "@gaming-hub/db";

/**
 * Mirrors the API's `ensureUser` so the socket server can upsert a Supabase
 * identity before the user ever talks to the REST API. Keeps identity logic
 * in one place by re-querying the canonical user row.
 */
export async function ensureUser(
  sub: string,
  email: string | null,
  userMetadata?: Record<string, unknown> | null,
) {
  const existing = await prisma.user.findUnique({ where: { id: sub } });
  if (existing) {
    if (existing.email !== email && email !== null) {
      return prisma.user.update({ where: { id: sub }, data: { email } });
    }
    return existing;
  }

  const meta = readMetadata(userMetadata);
  const base = sanitizeUsername(meta.username) ?? sanitizeUsername(email?.split("@")[0] ?? null) ?? "player";

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? base : `${base}_${randomSuffix()}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: sub,
            email,
            username,
            displayName: meta.displayName ?? username,
            avatarUrl: meta.avatarUrl,
          },
        });
        await tx.profile.create({ data: { userId: sub } });
        await tx.wallet.create({ data: { userId: sub } });
        return user;
      });
    } catch (error: unknown) {
      const isUniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002";
      if (!isUniqueViolation) throw error;
    }
  }

  throw new Error("Could not allocate a unique username");
}

function readMetadata(metadata: Record<string, unknown> | null | undefined): {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
} {
  if (!metadata) return { username: null, displayName: null, avatarUrl: null };
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return null;
  };
  return {
    username: sanitizeUsername(pick(["username", "user_name", "nickname"])),
    displayName: pick(["display_name", "full_name", "name"]),
    avatarUrl: pick(["avatar_url", "picture"]),
  };
}

function sanitizeUsername(candidate: string | null): string | null {
  if (!candidate) return null;
  const cleaned = candidate.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  return cleaned.length >= 3 ? cleaned : null;
}

function randomSuffix(length = 5): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
