// packages/anti-cheat/src/logger.ts

/** Simple logger for the anti‑cheat package */
const logger = {
  info: (msg: string, meta?: any) => {
    console.info('[ANTI‑CHEAT][INFO]', msg, meta ?? '');
  },
  warn: (msg: string, meta?: any) => {
    console.warn('[ANTI‑CHEAT][WARN]', msg, meta ?? '');
  },
  error: (msg: string, meta?: any) => {
    console.error('[ANTI‑CHEAT][ERROR]', msg, meta ?? '');
  },
};

export { logger };
