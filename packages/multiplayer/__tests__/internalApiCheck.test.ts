import { afterEach, describe, expect, it, vi } from "vitest";
import { checkInternalApiAuth } from "../../../apps/socket-server/src/internalApiCheck";

afterEach(() => vi.unstubAllGlobals());

describe("startup internal API authentication check", () => {
  const key = "test-only-internal-key";
  const logger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() });

  it("uses a read-only request and reports an accepted running key", async () => {
    const log = logger();
    const cancel = vi.fn();
    const request = vi.fn().mockResolvedValue({ status: 200, body: { cancel } });
    vi.stubGlobal("fetch", request);
    await checkInternalApiAuth("https://api.example/", key, log);
    expect(request).toHaveBeenCalledWith("https://api.example/metrics", expect.objectContaining({
      headers: { "x-internal-key": key }, redirect: "error", signal: expect.any(AbortSignal),
    }));
    expect(request.mock.calls[0][1].method).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith({ status: 200 }, expect.stringContaining("INTERNAL_API_AUTH_OK"));
  });

  it.each([401, 403])("reports rejection for %s without logging secrets", async status => {
    const log = logger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status }));
    await checkInternalApiAuth("https://api.example", key, log);
    expect(log.error).toHaveBeenCalledWith({ status }, expect.stringContaining("INTERNAL_API_AUTH_REJECTED"));
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(key);
  });

  it.each([404, 503])("does not label status %s as a mismatched key", async status => {
    const log = logger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status }));
    await checkInternalApiAuth("https://api.example", key, log);
    expect(log.warn).toHaveBeenCalledWith({ status }, expect.stringContaining("INTERNAL_API_AUTH_UNCONFIRMED"));
    expect(log.error).not.toHaveBeenCalled();
  });

  it("reports network failure as unconfirmed without leaking error details", async () => {
    const log = logger();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`failed: ${key}`)));
    await expect(checkInternalApiAuth("https://api.example", key, log)).resolves.toBe(false);
    expect(log.warn).toHaveBeenCalledWith({}, expect.stringContaining("INTERNAL_API_AUTH_UNREACHABLE"));
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(key);
  });

  it("retries on initial network failure and reports OK when API becomes available", async () => {
    const log = logger();
    const cancel = vi.fn();
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ status: 200, body: { cancel } });
    vi.stubGlobal("fetch", request);
    const result = await checkInternalApiAuth("https://api.example", key, log, 2, 10);
    expect(result).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith({ status: 200 }, expect.stringContaining("INTERNAL_API_AUTH_OK"));
  });
});
