import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type { FeatureFlagGroup, FeatureFlagEntry } from '@gaming-hub/shared';

export function AdminFeaturesPage() {
  const [groups, setGroups] = useState<FeatureFlagGroup[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const loadFlags = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.featureFlags();
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  const handleToggle = async (flag: FeatureFlagEntry) => {
    setPending(flag.key);
    setError(null);
    try {
      await adminApi.toggleFeatureFlag(flag.key, !flag.enabled);
      setGroups((prev) =>
        prev
          ? prev.map((group) => ({
              ...group,
              flags: group.flags.map((f) =>
                f.key === flag.key ? { ...f, enabled: !flag.enabled } : f,
              ),
            }))
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag');
    } finally {
      setPending(null);
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
      <h1 className="mb-2 text-3xl font-bold">Feature Flags</h1>
      <p className="mb-6 text-muted-foreground">
        Toggle platform features in real time. Changes apply immediately without redeploys.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {groups?.map((group) => (
          <div key={group.key} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold">{group.label}</h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <div className="divide-y divide-border">
              {group.flags.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between px-4 py-3">
                  <div className="mr-4">
                    <div className="font-medium">{flag.label}</div>
                    <div className="text-sm text-muted-foreground">{flag.description}</div>
                    <code className="text-xs text-muted-foreground">{flag.key}</code>
                  </div>
                  <button
                    onClick={() => handleToggle(flag)}
                    disabled={pending === flag.key}
                    aria-pressed={flag.enabled}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                      flag.enabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                        flag.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
