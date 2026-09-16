import type { FastifyInstance } from "fastify";

// Dependency-free Prometheus metrics (text exposition format v0.0.4).
// Low-cardinality by design: per-route counts + global duration histogram.

interface RouteStat {
  count: number;
  statuses: Map<number, number>;
}

const startedAt = Date.now();
const routes = new Map<string, RouteStat>();
const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const durationBucketCounts: number[] = new Array(DURATION_BUCKETS_MS.length).fill(0);
let durationCount = 0;
let durationSumMs = 0;

export function instrument(app: FastifyInstance): void {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url ?? "unknown";
    const key = `${request.method} ${route}`;
    let stat = routes.get(key);
    if (!stat) {
      stat = { count: 0, statuses: new Map() };
      routes.set(key, stat);
    }
    stat.count += 1;
    stat.statuses.set(reply.statusCode, (stat.statuses.get(reply.statusCode) ?? 0) + 1);
    const elapsed = reply.elapsedTime;
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      durationCount += 1;
      durationSumMs += elapsed;
      for (let i = 0; i < DURATION_BUCKETS_MS.length; i++) {
        if (elapsed <= DURATION_BUCKETS_MS[i]) {
          durationBucketCounts[i] += 1;
        }
      }
    }
  });
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function renderMetric(
  name: string,
  help: string,
  type: string,
  samples: string[],
): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...samples, ""];
  return lines.join("\n");
}

function render(): string {
  const mem = process.memoryUsage();
  const out: string[] = [];

  out.push(
    renderMetric(
      "process_start_time_seconds",
      "Process start time in seconds since epoch.",
      "gauge",
      [`process_start_time_seconds ${Math.floor(startedAt / 1000)}`],
    ),
  );
  out.push(
    renderMetric(
      "process_uptime_seconds",
      "Process uptime in seconds.",
      "gauge",
      [`process_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(3)}`],
    ),
  );
  out.push(
    renderMetric(
      "process_resident_memory_bytes",
      "Process resident memory in bytes.",
      "gauge",
      [`process_resident_memory_bytes ${mem.rss}`, `process_heap_used_bytes ${mem.heapUsed}`],
    ),
  );

  const totalRequests = [...routes.values()].reduce((sum, stat) => sum + stat.count, 0);
  out.push(
    renderMetric(
      "http_requests_total",
      "Total HTTP requests processed.",
      "counter",
      [
        ...[...routes.entries()].flatMap(([key, stat]) => {
          const [method, ...rest] = key.split(" ");
          const route = rest.join(" ");
          return [...stat.statuses.entries()].map(
            ([status, count]) =>
              `http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${status}"} ${count}`,
          );
        }),
        `http_requests_total_global ${totalRequests}`,
      ],
    ),
  );

  const samples = durationBucketCounts.map(
    (count, i) =>
      `http_request_duration_seconds_bucket{le="${(DURATION_BUCKETS_MS[i] / 1000).toFixed(3)}"} ${count}`,
  );
  samples.push(`http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`);
  samples.push(`http_request_duration_seconds_sum ${(durationSumMs / 1000).toFixed(6)}`);
  samples.push(`http_request_duration_seconds_count ${durationCount}`);
  out.push(renderMetric("http_request_duration_seconds", "HTTP request duration.", "histogram", samples));

  return out.join("\n");
}

export function metricsText(): string {
  return render();
}
