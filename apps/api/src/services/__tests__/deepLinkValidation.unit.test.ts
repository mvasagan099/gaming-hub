import { describe, it, expect } from "vitest";
import { parseAndValidateDeepLink, AUTH_CALLBACK_PATH, PASSWORD_RESET_PATH } from "@gaming-hub/shared";

describe("M-06: Capacitor Deep-Link Validation", () => {
  it.each([
    'com.gaminghub.app://auth/verify-email', 'com.gaminghub.app://verify-email',
    'com.gaminghub.app://verify-email/', 'https://gaminghub.com/verify-email',
    'https://app.gaminghub.com/auth/verify-email',
  ])('routes verification alias %s to the mounted callback preserving auth parameters', (url) => {
    expect(parseAndValidateDeepLink(`${url}?code=verification#access_token=token`)).toMatchObject({ valid: true, isPasswordRecovery: false, target: `${AUTH_CALLBACK_PATH}?code=verification#access_token=token` });
  });
  it.each([
    'com.gaminghub.app://auth/reset-password', 'com.gaminghub.app://reset-password/',
    'https://gaminghub.com/auth/reset-password',
  ])('identifies recovery alias %s without a type parameter', (url) => {
    expect(parseAndValidateDeepLink(`${url}?code=recovery`)).toMatchObject({ valid: true, isPasswordRecovery: true, target: `${PASSWORD_RESET_PATH}?code=recovery` });
  });
  it('does not misclassify an unrelated value containing type=recovery', () => {
    expect(parseAndValidateDeepLink('com.gaminghub.app://auth/callback?state=type=recovery').isPasswordRecovery).toBe(false);
  });
  it.each(['redirect', 'redirectTo', 'next', 'returnUrl', 'url', 'target'])('strips %s from alias query and hash', (key) => {
    const result = parseAndValidateDeepLink(`com.gaminghub.app://auth/verify-email?code=ok&${key}=https://evil.invalid#access_token=token&${key}=https://evil.invalid`);
    expect(result.target).toBe(`${AUTH_CALLBACK_PATH}?code=ok#access_token=token`);
  });
  it("allows valid custom scheme auth callback with safe params", () => {
    const result = parseAndValidateDeepLink(
      "com.gaminghub.app://auth/callback?code=valid-auth-code&state=xyz123"
    );
    expect(result.valid).toBe(true);
    expect(result.target).toBe("/auth/callback?code=valid-auth-code&state=xyz123");
    expect(result.isPasswordRecovery).toBe(false);
  });

  it("identifies and sets password recovery flow from path", () => {
    const result = parseAndValidateDeepLink(
      "com.gaminghub.app://reset-password?code=recovery-code-123"
    );
    expect(result.valid).toBe(true);
    expect(result.isPasswordRecovery).toBe(true);
    expect(result.target).toContain("/reset-password");
  });

  it("identifies password recovery flow from query type=recovery", () => {
    const result = parseAndValidateDeepLink(
      "com.gaminghub.app://auth/callback?type=recovery&code=abc"
    );
    expect(result.valid).toBe(true);
    expect(result.isPasswordRecovery).toBe(true);
    expect(result.target).toBe("/reset-password?type=recovery&code=abc");
  });

  it("identifies password recovery flow from hash type=recovery", () => {
    const result = parseAndValidateDeepLink(
      "com.gaminghub.app://auth/callback#type=recovery&access_token=secret-token"
    );
    expect(result.valid).toBe(true);
    expect(result.isPasswordRecovery).toBe(true);
    expect(result.target).toContain("/reset-password");
    expect(result.target).toContain("type=recovery");
  });

  it("strips open-redirect parameters (redirect, redirectTo, next)", () => {
    const result = parseAndValidateDeepLink(
      "com.gaminghub.app://auth/callback?code=safe123&redirectTo=https://evil.com/steal&next=//phishing.com"
    );
    expect(result.valid).toBe(true);
    expect(result.target).not.toContain("evil.com");
    expect(result.target).not.toContain("phishing.com");
    expect(result.target).not.toContain("redirectTo");
    expect(result.target).not.toContain("next");
    expect(result.target).toBe("/auth/callback?code=safe123");
  });

  it("rejects malicious URL schemes (javascript:, file:, intent:, data:)", () => {
    expect(parseAndValidateDeepLink("javascript:alert(1)").valid).toBe(false);
    expect(parseAndValidateDeepLink("file:///etc/passwd").valid).toBe(false);
    expect(parseAndValidateDeepLink("data:text/html,<script>alert(1)</script>").valid).toBe(false);
    expect(parseAndValidateDeepLink("intent://evil.com").valid).toBe(false);
  });

  it("rejects path traversal attempts (../, //)", () => {
    expect(parseAndValidateDeepLink("com.gaminghub.app://auth/../../../etc/passwd").valid).toBe(false);
    expect(parseAndValidateDeepLink("com.gaminghub.app:////evil.com").valid).toBe(false);
  });

  it("rejects disallowed external hosts for http/https", () => {
    expect(parseAndValidateDeepLink("https://evil-attacker-site.com/auth/callback").valid).toBe(false);
  });

  it("allows official domain for https universal links", () => {
    const result = parseAndValidateDeepLink(
      "https://app.gaminghub.com/reset-password?type=recovery&code=xyz"
    );
    expect(result.valid).toBe(true);
    expect(result.isPasswordRecovery).toBe(true);
    expect(result.target).toBe("/reset-password?type=recovery&code=xyz");
  });

  it("rejects control characters and garbage input", () => {
    expect(parseAndValidateDeepLink("").valid).toBe(false);
    expect(parseAndValidateDeepLink(null as any).valid).toBe(false);
    expect(parseAndValidateDeepLink("com.gaminghub.app://auth\u0000/callback").valid).toBe(false);
  });
});
