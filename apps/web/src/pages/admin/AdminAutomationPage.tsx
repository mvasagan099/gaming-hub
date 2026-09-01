import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type { CronJobRun } from '@gaming-hub/shared';

interface JobEntry {
  name: string;
  label: string;
}

const STATUS_STYLES: Record<CronJobRun['status'], string> = {
  SUCCESS: 'bg-green-500/10 text-green-600',
  FAILED: 'bg-red-500/10 text-red-600',
  RUNNING: 'bg-yellow-500/10 text-yellow-600',
};

export function AdminAutomationPage() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [runs, setRuns] = useState<CronJobRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [j, r] = await Promise.all([adminApi.automationJobs(), adminApi.automationRuns(1, 50)]);
      setJobs(j as JobEntry[]);
      setRuns(r.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automation data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRun = async (name: string) => {
    setRunningJob(name);
    setError(null);
    try {
      const result = await adminApi.runAutomationJob(name);
      setSuccessMessage(`${name}: processed ${result.processed}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run job');
    } finally {
      setRunningJob(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Automation</h1>
      <p className="mb-6 text-muted-foreground">
        Scheduled maintenance jobs. The scheduler runs every 15 minutes; you can also trigger jobs manually.
      </p>

      {successMessage && (
        <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div key={job.name} className="rounded-lg border border-border bg-card p-4">
            <div className="font-medium">{job.label}</div>
            <code className="text-xs text-muted-foreground">{job.name}</code>
            <div className="mt-3">
              <button
                onClick={() => handleRun(job.name)}
                disabled={runningJob === job.name}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {runningJob === job.name ? 'Running...' : 'Run Now'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-4 text-xl font-semibold">Recent Runs</h2>
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-4 py-3">
                  <code className="text-sm">{r.jobName}</code>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">
                  {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(2)}s` : '-'}
                </td>
                <td className="max-w-[240px] truncate px-4 py-3 text-xs text-red-600">
                  {r.error ?? '-'}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No runs recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
