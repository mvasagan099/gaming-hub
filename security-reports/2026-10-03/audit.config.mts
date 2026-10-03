import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../',import.meta.url)),
  test: { include: ['security-reports/2026-10-03/audit-probes.test.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false },
});
