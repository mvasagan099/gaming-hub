import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

/** Aggregate diagnostics only: no identifiers, payloads, tokens or heap dumps. */
export function startMemoryDiagnostics(
  readCounts: () => Record<string, unknown>,
  log: (sample: Record<string, unknown>) => void,
  intervalMs = 60000,
) {
  const histogram = monitorEventLoopDelay({ resolution: 20 }); histogram.enable();
  let cpu = process.cpuUsage(), at = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), current = process.cpuUsage();
    const elapsed = Math.max(1, now - at);
    log({ ...process.memoryUsage(), ...readCounts(),
      cpuPercent: ((current.user - cpu.user + current.system - cpu.system) / 1000 / elapsed) * 100,
      eventLoopDelayMs: { p50: histogram.percentile(50) / 1e6, p95: histogram.percentile(95) / 1e6, p99: histogram.percentile(99) / 1e6 } });
    cpu = current; at = now; histogram.reset();
  }, intervalMs);
  timer.unref();
  return () => { clearInterval(timer); histogram.disable(); };
}
