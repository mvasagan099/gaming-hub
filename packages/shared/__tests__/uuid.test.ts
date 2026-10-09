import { describe, it, expect, vi, afterEach } from "vitest";
import { safeRandomUUID } from "../src/uuid";

describe("safeRandomUUID", () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a valid UUID v4 using crypto.randomUUID when available", () => {
    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it("falls back to crypto.getRandomValues when crypto.randomUUID is not a function (e.g. mobile HTTP non-secure context)", () => {
    // Simulate non-secure context where crypto.randomUUID is undefined
    const mockGetRandomValues = vi.fn((buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i++) buffer[i] = (i * 17) % 256;
      return buffer;
    });

    vi.stubGlobal("crypto", {
      getRandomValues: mockGetRandomValues,
      randomUUID: undefined,
    });

    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4_REGEX);
    expect(mockGetRandomValues).toHaveBeenCalled();
  });

  it("falls back to Math.random when no Web Crypto API is available", () => {
    vi.stubGlobal("crypto", undefined);

    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it("does not recurse when installed as the crypto.randomUUID polyfill", () => {
    let reads = 0;
    const getRandomValues = vi.fn((buffer: Uint8Array) => buffer.fill(17));
    vi.stubGlobal("crypto", {
      get randomUUID() { reads++; return safeRandomUUID; },
      getRandomValues,
    });

    expect(safeRandomUUID()).toMatch(UUID_V4_REGEX);
    expect(reads).toBeLessThanOrEqual(2);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("generates distinct UUIDs across multiple calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      set.add(safeRandomUUID());
    }
    expect(set.size).toBe(100);
  });
});
