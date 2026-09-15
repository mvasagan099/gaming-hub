/**
 * M-05: AES-256-GCM authenticated encryption helpers for TOTP secret storage.
 *
 * Wire format: v<version>:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *   - version:    key version integer (matches TOTP_ENCRYPTION_KEY_VERSION)
 *   - iv_b64:     base64url-encoded 12-byte GCM nonce (unique per encryption)
 *   - tag_b64:    base64url-encoded 16-byte GCM authentication tag
 *   - ciphertext: base64url-encoded encrypted payload
 *
 * Design decisions:
 *   - Never reuse an IV: crypto.randomBytes(12) on every encrypt call.
 *   - The GCM auth tag is stored separately so tampering is detected on decrypt.
 *   - Key version enables safe key rotation without destroying existing records.
 *   - Functions never log or expose the plaintext secret or raw key material.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce recommended for GCM
const TAG_BYTES = 16; // 128-bit auth tag

function getKeyForVersion(version: number): Buffer {
  if (!env.TOTP_ENCRYPTION_KEY) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY is not configured. " +
        "Set this environment variable before using 2FA encryption.",
    );
  }
  // Currently single-key; version included for future rotation.
  if (version !== env.TOTP_ENCRYPTION_KEY_VERSION) {
    throw new Error(
      `TOTP secret key version mismatch: stored=${version}, configured=${env.TOTP_ENCRYPTION_KEY_VERSION}. ` +
        "Either the key has been rotated without a migration, or the wrong key is configured.",
    );
  }
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

/**
 * Encrypt a TOTP secret.
 * @returns Encoded string: v<version>:<iv_b64>:<tag_b64>:<ciphertext_b64>
 */
export function encryptTotpSecret(plaintext: string): string {
  const version = env.TOTP_ENCRYPTION_KEY_VERSION;
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const ivB64 = iv.toString("base64url");
  const tagB64 = tag.toString("base64url");
  const ciphertextB64 = encrypted.toString("base64url");

  return `v${version}:${ivB64}:${tagB64}:${ciphertextB64}`;
}

/**
 * Decrypt a TOTP secret.
 * Throws if the auth tag verification fails (tampered ciphertext) or
 * if the version does not match the configured key.
 */
export function decryptTotpSecret(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4 || !parts[0].startsWith("v")) {
    throw new Error("Invalid encrypted TOTP secret format.");
  }

  const version = parseInt(parts[0].slice(1), 10);
  if (isNaN(version)) {
    throw new Error("Invalid encrypted TOTP secret version.");
  }

  const key = getKeyForVersion(version);
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");

  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid IV length in encrypted TOTP secret.");
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error("Invalid auth tag length in encrypted TOTP secret.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Convenience: returns the current configured key version for use when storing new secrets.
 */
export function currentTotpKeyVersion(): number {
  return env.TOTP_ENCRYPTION_KEY_VERSION;
}

/**
 * Returns true if TOTP encryption is configured (key present).
 * Allows graceful handling in development where the key may not be set.
 */
export function isTotpEncryptionConfigured(): boolean {
  return Boolean(env.TOTP_ENCRYPTION_KEY);
}

/**
 * Load a TOTP secret from Profile fields, preferring encrypted storage.
 * Falls back to plaintext during the migration window.
 * After migration is confirmed, remove the plaintext fallback branch.
 *
 * @param twoFactorSecretEncrypted - Encrypted secret (preferred)
 * @param twoFactorSecretKeyVersion - Key version stored with the encrypted secret
 * @param twoFactorSecret - Legacy plaintext secret (migration fallback only)
 */
export function loadTotpSecret(
  twoFactorSecretEncrypted: string | null | undefined,
  twoFactorSecretKeyVersion: number | null | undefined,
  twoFactorSecret: string | null | undefined,
): string {
  if (twoFactorSecretEncrypted) {
    return decryptTotpSecret(twoFactorSecretEncrypted);
  }
  // Fallback: plaintext (pre-migration, development without key configured)
  if (twoFactorSecret) {
    return twoFactorSecret;
  }
  throw new Error("No TOTP secret found for this account.");
}
