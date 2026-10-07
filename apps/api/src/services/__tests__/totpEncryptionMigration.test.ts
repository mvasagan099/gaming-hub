import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { randomBytes, createCipheriv } from "node:crypto";
import {
  encryptTotpSecret,
  decryptTotpSecret,
  loadTotpSecret,
  currentTotpKeyVersion,
} from "../../../src/lib/crypto";
import { env } from "../../../src/env";

describe("Requirement 8: Real PostgreSQL TOTP Encryption Migration Verification", () => {
  const user1 = "test-totp-legacy-plain";
  const user2 = "test-totp-already-encrypted";
  const user3 = "test-totp-no-mfa";

  const legacySecret = "JBSWY3DPEHPK3PXP"; // valid base32 TOTP secret

  beforeEach(async () => {
    (env as any).TOTP_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
    (env as any).TOTP_ENCRYPTION_KEY_VERSION = 1;
    // 1. Setup User 1: legacy plaintext TOTP secret
    await prisma.user.upsert({
      where: { id: user1 },
      update: {},
      create: {
        id: user1,
        username: "totp_plain",
        displayName: "TOTP Plain",
        email: "totp_plain@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: user1 },
      update: {
        twoFactorEnabled: true,
        twoFactorSecret: legacySecret,
        twoFactorSecretEncrypted: null,
        twoFactorSecretKeyVersion: null,
        totpEncryptedAt: null,
      },
      create: {
        userId: user1,
        twoFactorEnabled: true,
        twoFactorSecret: legacySecret,
      },
    });

    // 2. Setup User 2: already encrypted
    const preEncrypted = encryptTotpSecret("KRSXG5CTMVRXEZLU");
    await prisma.user.upsert({
      where: { id: user2 },
      update: {},
      create: {
        id: user2,
        username: "totp_encrypted",
        displayName: "TOTP Encrypted",
        email: "totp_encrypted@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: user2 },
      update: {
        twoFactorEnabled: true,
        twoFactorSecret: null,
        twoFactorSecretEncrypted: preEncrypted,
        twoFactorSecretKeyVersion: currentTotpKeyVersion(),
        totpEncryptedAt: new Date(),
      },
      create: {
        userId: user2,
        twoFactorEnabled: true,
        twoFactorSecret: null,
        twoFactorSecretEncrypted: preEncrypted,
        twoFactorSecretKeyVersion: currentTotpKeyVersion(),
        totpEncryptedAt: new Date(),
      },
    });

    // 3. Setup User 3: 2FA disabled / no secret
    await prisma.user.upsert({
      where: { id: user3 },
      update: {},
      create: {
        id: user3,
        username: "totp_none",
        displayName: "TOTP None",
        email: "totp_none@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: user3 },
      update: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorSecretEncrypted: null,
      },
      create: {
        userId: user3,
        twoFactorEnabled: false,
      },
    });
  });

  it("executes migration script against test DB and verifies encryption and tamper-proofing", async () => {
    // Query all profiles in the DB to classify
    const allProfiles = await prisma.profile.findMany({
      where: {
        userId: { in: [user1, user2, user3] },
      },
      select: {
        userId: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorSecretEncrypted: true,
      },
    });

    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const profile of allProfiles) {
      if (!profile.twoFactorEnabled) {
        skippedCount++;
        continue;
      }

      if (profile.twoFactorSecretEncrypted) {
        alreadyEncryptedCount++;
        continue;
      }

      if (profile.twoFactorSecret) {
        try {
          // Encrypt secret with verification
          const encrypted = encryptTotpSecret(profile.twoFactorSecret);
          const decrypted = decryptTotpSecret(encrypted);
          if (decrypted !== profile.twoFactorSecret) {
            throw new Error("Round-trip decrypt mismatch");
          }

          // Commit to DB and null out plaintext
          await prisma.profile.update({
            where: { userId: profile.userId },
            data: {
              twoFactorSecretEncrypted: encrypted,
              twoFactorSecretKeyVersion: currentTotpKeyVersion(),
              totpEncryptedAt: new Date(),
              twoFactorSecret: null, // CLEAR PLAINTEXT
            },
          });
          encryptedCount++;
        } catch {
          failedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    // Report results
    console.log("TOTP MIGRATION AUDIT REPORT:", {
      encrypted: encryptedCount,
      alreadyEncrypted: alreadyEncryptedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    expect(encryptedCount).toBe(1);
    expect(alreadyEncryptedCount).toBe(1);
    expect(skippedCount).toBe(1);
    expect(failedCount).toBe(0);

    // Verify User 1 state in DB after migration
    const updatedUser1 = await prisma.profile.findUniqueOrThrow({
      where: { userId: user1 },
    });

    // 1. twoFactorSecret is NULL
    expect(updatedUser1.twoFactorSecret).toBeNull();

    // 2. twoFactorSecretEncrypted is NOT NULL
    expect(updatedUser1.twoFactorSecretEncrypted).not.toBeNull();
    expect(updatedUser1.twoFactorSecretEncrypted).toMatch(/^v\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);

    // 3. key version present
    expect(updatedUser1.twoFactorSecretKeyVersion).toBe(currentTotpKeyVersion());

    // 4. decrypt works
    const recovered = decryptTotpSecret(updatedUser1.twoFactorSecretEncrypted!);
    expect(recovered).toBe(legacySecret);

    // Also loadTotpSecret works seamlessly
    const loaded = loadTotpSecret(
      updatedUser1.twoFactorSecretEncrypted,
      updatedUser1.twoFactorSecretKeyVersion,
      updatedUser1.twoFactorSecret,
    );
    expect(loaded).toBe(legacySecret);

    // 5. wrong key version fails
    expect(() => decryptTotpSecret(`v999${updatedUser1.twoFactorSecretEncrypted!.slice(2)}`)).toThrow();

    // 6. tampered ciphertext fails
    const parts = updatedUser1.twoFactorSecretEncrypted!.split(":");
    // Flip an actual decoded byte. Replacing base64 suffix characters can
    // occasionally reproduce the same bytes (or change unused padding bits).
    const changedCiphertext = Buffer.from(parts[3], "base64url");
    changedCiphertext[0] = changedCiphertext[0]! ^ 1;
    const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${changedCiphertext.toString("base64url")}`;
    expect(() => decryptTotpSecret(tamperedCiphertext)).toThrow();

    // 7. tampered auth tag fails
    const changedTag = Buffer.from(parts[2], "base64url");
    changedTag[0] = changedTag[0]! ^ 1;
    const tamperedTag = `${parts[0]}:${parts[1]}:${changedTag.toString("base64url")}:${parts[3]}`;
    expect(() => decryptTotpSecret(tamperedTag)).toThrow();
  });
});
