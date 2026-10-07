interface StartupLogger {
  error(fields: { err: unknown; startupStage: string }, message: string): void;
}

/** Keep the original error under Pino's serialized `err` field. */
export async function runStartupStep<T>(
  startupStage: string,
  action: () => Promise<T>,
  logger: StartupLogger,
): Promise<T> {
  try {
    return await action();
  } catch (err) {
    logger.error({ err, startupStage }, "Socket startup prerequisite failed");
    throw err;
  }
}
