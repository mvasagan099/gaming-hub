import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import {
  encryptTotpSecret,
  decryptTotpSecret,
  loadTotpSecret,
  isTotpEncryptionConfigured,
  currentTotpKeyVersion,
} from "../../lib/crypto";
import { getPrivacySettings, updatePrivacySettings, canViewProfile } from "../privacyService";
import { parseAndValidateDeepLink } from "@gaming-hub/shared";
import { env } from "../../env";

describe("Security Remediation Full Suite", () => {
  beforeEach(() => {
    // 32-byte base64-encoded test key
    (env as any).TOTP_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
    (env as any).TOTP_ENCRYPTION_KEY_VERSION = 1;
  });
  // =========================================================================
  // 1. M-05: TOTP Encryption (AES-256-GCM)
  // =========================================================================
  describe("M-05: TOTP Encryption (AES-256-GCM)", () => {
    const testSecret = "JBSWY3DPEHPK3PXP";

    it("detects when TOTP encryption is configured via env", () => {
      expect(isTotpEncryptionConfigured()).toBe(true);
      expect(currentTotpKeyVersion()).toBeGreaterThanOrEqual(1);
    });

    it("encrypts and decrypts a TOTP secret with authentication tag", () => {
      const encrypted = encryptTotpSecret(testSecret);
      expect(encrypted).not.toBe(testSecret);
      expect(encrypted.startsWith("v1:")).toBe(true);

      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(testSecret);
    });

    it("rejects tampered encrypted payloads (integrity failure)", () => {
      const encrypted = encryptTotpSecret(testSecret);
      const parts = encrypted.split(":");
      // Corrupt ciphertext part
      parts[3] = parts[3].slice(0, -2) + "==";
      const tampered = parts.join(":");

      expect(() => decryptTotpSecret(tampered)).toThrow();
    });

    it("loadTotpSecret prefers encrypted secret and falls back to plaintext seamlessly", () => {
      const encrypted = encryptTotpSecret(testSecret);

      // Encrypted preferred
      const fromEncrypted = loadTotpSecret(encrypted, 1, "old-plaintext");
      expect(fromEncrypted).toBe(testSecret);

      // Plaintext fallback for unmigrated rows
      const fromPlaintext = loadTotpSecret(null, null, "legacy-secret-plain");
      expect(fromPlaintext).toBe("legacy-secret-plain");
    });
  });

  // =========================================================================
  // 2. M-01: Privacy Settings Persistence & Visibility
  // =========================================================================
  describe("M-01: Privacy Settings Persistence & Access Control", () => {
    it("returns default privacy settings when no record exists", async () => {
      vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValueOnce(null);

      const settings = await getPrivacySettings("user-new");
      expect(settings.profileVisibility).toBe("EVERYONE");
      expect(settings.showEmail).toBe(false);
      expect(settings.showPhone).toBe(false);
      expect(settings.showStats).toBe(true);
    });

    it("persists partial updates via upsert", async () => {
      const mockRow = {
        userId: "user-1",
        profileVisibility: "FRIENDS",
        showEmail: true,
        showPhone: false,
        showStats: true,
        allowFriendRequests: false,
        allowGameInvites: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.spyOn(prisma.userPrivacy, "upsert").mockResolvedValueOnce(mockRow as any);

      const updated = await updatePrivacySettings("user-1", {
        profileVisibility: "FRIENDS",
        showEmail: true,
        allowFriendRequests: false,
      });

      expect(updated.profileVisibility).toBe("FRIENDS");
      expect(updated.showEmail).toBe(true);
      expect(updated.allowFriendRequests).toBe(false);
    });

    it("rejects invalid visibility enum values", async () => {
      await expect(
        updatePrivacySettings("user-1", { profileVisibility: "PUBLIC_WORLD" as any }),
      ).rejects.toThrow(/profileVisibility must be one of/);
    });

    it("canViewProfile respects NOBODY and EVERYONE settings", async () => {
      // User can always view their own profile
      expect(await canViewProfile("user-self", "user-self")).toBe(true);

      // EVERYONE allows view
      vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValueOnce({
        userId: "target",
        profileVisibility: "EVERYONE",
      } as any);
      expect(await canViewProfile("viewer-1", "target")).toBe(true);

      // NOBODY blocks view
      vi.spyOn(prisma.userPrivacy, "findUnique").mockResolvedValueOnce({
        userId: "target-private",
        profileVisibility: "NOBODY",
      } as any);
      expect(await canViewProfile("viewer-1", "target-private")).toBe(false);
    });
  });

  // =========================================================================
  // 3. M-06: Deep-link Security Validation
  // =========================================================================
  describe("M-06: Deep-Link Security", () => {
    it("blocks javascript:, intent:, file: scheme injection", () => {
      expect(parseAndValidateDeepLink("javascript:alert(1)").valid).toBe(false);
      expect(parseAndValidateDeepLink("file:///etc/hosts").valid).toBe(false);
      expect(parseAndValidateDeepLink("intent://steal").valid).toBe(false);
    });

    it("strips open-redirect vectors and preserves safe query parameters", () => {
      const res = parseAndValidateDeepLink(
        "com.gaminghub.app://auth/callback?code=AUTH_CODE_123&redirectTo=https://attacker.com"
      );
      expect(res.valid).toBe(true);
      expect(res.target).toBe("/auth/callback?code=AUTH_CODE_123");
      expect(res.target).not.toContain("attacker.com");
    });
  });
});
