import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("crypto polyfill", () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("polyfills crypto.randomUUID when it does not exist in non-secure context", async () => {
    // Simulate non-secure context without randomUUID
    const fakeCrypto = {
      getRandomValues: (buf: Uint8Array) => {
        for (let i = 0; i < buf.length; i++) buf[i] = (i * 31) % 256;
        return buf;
      },
    };
    vi.stubGlobal("crypto", fakeCrypto);
    vi.stubGlobal("window", { crypto: fakeCrypto });

    // Import the polyfill
    await import("../crypto");

    expect(typeof window.crypto.randomUUID).toBe("function");
    const uuid = window.crypto.randomUUID();
    expect(uuid).toMatch(UUID_V4_REGEX);
  });
});
