import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../services/api/client';
import type { SettingsCategoryName, SettingsShape } from '@gaming-hub/shared';
import { SETTINGS_CATEGORY_META } from '@gaming-hub/shared';

async function fetchAllSettings(): Promise<SettingsShape> {
  return apiClient.get<SettingsShape>('/admin/settings');
}

async function updateCategory(category: SettingsCategoryName, values: Record<string, unknown>) {
  return apiClient.put<{ ok: true; category: SettingsCategoryName; values: SettingsShape[typeof category] }>(
    `/admin/settings/category`,
    { category, values },
  );
}

async function resetCategory(category: SettingsCategoryName) {
  return apiClient.delete<{ ok: true; category: SettingsCategoryName }>(`/admin/settings/category/${category}`);
}

const CATEGORIES = Object.keys(SETTINGS_CATEGORY_META) as SettingsCategoryName[];

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryName>('general');
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllSettings();
      setSettings(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const categorySettings = settings?.[activeCategory] ?? {};
      const mergedValues = { ...categorySettings, ...editedValues };
      await updateCategory(activeCategory, mergedValues);
      await loadSettings();
      setEditedValues({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset this category to defaults? This cannot be undone.')) return;
    try {
      await resetCategory(activeCategory);
      await loadSettings();
      setEditedValues({});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset settings';
      setError(message);
    }
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setEditedValues((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);
  };

  const handleCategoryChange = (cat: SettingsCategoryName) => {
    setActiveCategory(cat);
    setEditedValues({});
    setSaveError(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
        <p className="font-medium">Failed to load settings</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const categorySettings = settings?.[activeCategory] ?? {};
  const mergedValues = { ...categorySettings, ...editedValues };

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Site Settings</h1>

      <div className="flex gap-6">
        <aside className="w-64 shrink-0">
          <nav className="space-y-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`w-full rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {SETTINGS_CATEGORY_META[cat].label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{SETTINGS_CATEGORY_META[activeCategory].label}</h2>
                <p className="text-sm text-muted-foreground">
                  {SETTINGS_CATEGORY_META[activeCategory].description}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Reset to Defaults
              </button>
            </div>

            {saveError && (
              <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
                Settings saved successfully
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(mergedValues).map(([field, value]) => (
                <div key={field} className="grid grid-cols-3 gap-4">
                  <label className="flex items-center text-sm font-medium text-foreground">
                    {field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  </label>
                  <div className="col-span-2">
                    {typeof value === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={value as boolean}
                        onChange={(e) => handleFieldChange(field, e.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                    ) : typeof value === 'number' ? (
                      <input
                        type="number"
                        value={value as number}
                        onChange={(e) => handleFieldChange(field, e.target.valueAsNumber || 0)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    ) : typeof value === 'string' ? (
                      <input
                        type="text"
                        value={value as string}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    ) : (
                      <input
                        type="text"
                        value={JSON.stringify(value)}
                        onChange={(e) => {
                          try {
                            handleFieldChange(field, JSON.parse(e.target.value));
                          } catch {}
                        }}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-xs"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => {
                  setEditedValues({});
                  setSaveError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || Object.keys(editedValues).length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
