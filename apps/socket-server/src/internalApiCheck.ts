interface CheckLogger {
  info: (details: object, message: string) => void;
  error: (details: object, message: string) => void;
  warn: (details: object, message: string) => void;
}

/** Read-only probe of the same service key used to create and fund matches. */
export async function checkInternalApiAuth(
  apiUrl: string,
  internalKey: string,
  logger: CheckLogger,
  retries: number = 0,
  retryDelayMs: number = 1000,
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/metrics`, {
        headers: { "x-internal-key": internalKey },
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      // Do not read or log metrics, credentials, or response bodies.
      await response.body?.cancel();
      const details = { status: response.status };
      if (response.status === 200) {
        logger.info(details, "INTERNAL_API_AUTH_OK: API accepted the socket server service key");
        return true;
      } else if (response.status === 401 || response.status === 403) {
        logger.error(details, "INTERNAL_API_AUTH_REJECTED: API rejected the running socket server service key; verify both services' deployed INTERNAL_API_KEY values");
        return false;
      } else {
        logger.warn(details, "INTERNAL_API_AUTH_UNCONFIRMED: API probe returned an unexpected status; check API_URL and API availability");
        return false;
      }
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      // Network errors can include URLs; keep diagnostics free of secret values.
      logger.warn({}, "INTERNAL_API_AUTH_UNREACHABLE: could not complete the API authentication check; check API_URL and API availability");
      return false;
    }
  }
  return false;
}
