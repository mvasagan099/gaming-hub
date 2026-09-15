/**
 * TOTP Secret Encryption Migration Script (M-05)
 *
 * Encrypts all existing plaintext twoFactorSecret values in the Profile table
 * using AES-256-GCM with the TOTP_ENCRYPTION_KEY environment variable.
 *
 * Safety:
 *   - Dry-run mode is default; pass --apply to commit.
 *   - Verifies encryption round-trip BEFORE committing to DB.
 *   - Only processes profiles where twoFactorEnabled = true and
 *     twoFactorSecret is not null and twoFactorSecretEncrypted is null.
 *   - After encryption, clears twoFactorSecret (plaintext) from the DB.
 *   - Sets totpEncryptedAt and twoFactorSecretKeyVersion.
 *   - Idempotent: profiles with twoFactorSecretEncrypted set are skipped.
 *
 * Prerequisites:
 *   - TOTP_ENCRYPTION_KEY must be set (32-byte base64 string).
 *   - Run AFTER the 20260915_security_schema_v1 migration has been applied.
 *
 * Usage:
 *   # Dry run:
 *   TOTP_ENCRYPTION_KEY=<base64_key> npx ts-node scripts/encrypt_totp_secrets.ts
 *
 *   # Apply:
 *   TOTP_ENCRYPTION_KEY=<base64_key> npx ts-node scripts/encrypt_totp_secrets.ts --apply
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "../packages/db/src/generated/client/index.js";

const DRY_RUN = !process.argv.includes("--apply");
const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = parseInt(process.env.TOTP_ENCRYPTION_KEY_VERSION ?? "1", 10);

function getKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY environment variable is required.\n" +
        "Generate: node -e \"require('crypto').randomBytes(32).toString('base64')\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`TOTP_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}.`);
  }
  return key;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${KEY_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decrypt(encoded: string, key: Buffer): string {
  const parts = encoded.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function main() {
  console.log("=".repeat(60));
  console.log("TOTP Secret Encryption Migration (M-05)");
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — no DB changes will be made. Pass --apply to commit.");
  } else {
    console.log("⚡ APPLY MODE — encrypting TOTP secrets in the database.");
  }

  const key = getKey();
  console.log(`Key version: ${KEY_VERSION}, key length: ${key.length} bytes ✓`);

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  const profiles = await prisma.profile.findMany({
    where: {
      twoFactorEnabled: true,
      twoFactorSecret: { not: null },
      twoFactorSecretEncrypted: null,
    },
    select: { userId: true, twoFactorSecret: true },
  });

  console.log(`\nFound ${profiles.length} profile(s) with plaintext TOTP secrets to encrypt.\n`);

  let migrated = 0;
  let errors = 0;

  for (const profile of profiles) {
    const { userId, twoFactorSecret } = profile;
    if (!twoFactorSecret) continue;

    try {
      // Verify round-trip BEFORE touching DB
      const encrypted = encrypt(twoFactorSecret, key);
      const decrypted = decrypt(encrypted, key);
      if (decrypted !== twoFactorSecret) {
        throw new Error("Round-trip verification FAILED — plaintext mismatch after decrypt");
      }

      console.log(`  ✅ User ${userId}: verified round-trip ← will${DRY_RUN ? " (dry-run, skipping)" : ""} encrypt`);

      if (!DRY_RUN) {
        await prisma.profile.update({
          where: { userId },
          data: {
            twoFactorSecretEncrypted: encrypted,
            twoFactorSecretKeyVersion: KEY_VERSION,
            totpEncryptedAt: new Date(),
            twoFactorSecret: null, // Clear plaintext after successful encryption
          },
        });
      }

      migrated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ User ${userId}: FAILED — ${msg}`);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total:    ${profiles.length}`);
  console.log(`${DRY_RUN ? "Would encrypt" : "Encrypted"}: ${migrated}`);
  console.log(`Errors:   ${errors}`);

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN COMPLETE — run with --apply to commit.");
  } else if (errors === 0) {
    console.log("\n✅ All TOTP secrets encrypted successfully.");
  } else {
    console.log(`\n⚠️  ${errors} error(s) occurred — review output above.`);
  }

  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
