import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../services/api/client';
import type { SettingsCategoryName, SettingsShape, SettingsFieldMeta } from '@gaming-hub/shared';
import { SETTINGS_CATEGORY_META, SETTINGS_FIELD_META, SECRET_SETTING_KEYS } from '@gaming-hub/shared';

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

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-ring';

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
  const categorySettings = (settings?.[activeCategory] ?? {}) as Record<string, unknown>;
  const mergedValues: Record<string, unknown> = { ...categorySettings, ...editedValues };
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

  const categorySettings = (settings?.[activeCategory] ?? {}) as Record<string, unknown>;
  const mergedValues: Record<string, unknown> = { ...categorySettings, ...editedValues };
  const fields = SETTINGS_FIELD_META[activeCategory];

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
              <div className="mb-4 flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Settings saved successfully
              </div>
            )}

            <div className="space-y-4">
              {fields.map((field) => (
                <SettingsField
                  key={`${activeCategory}.${field.key}`}
                  field={field}
                  value={mergedValues[field.key]}
                  isDirty={field.key in editedValues}
                  isSecret={SECRET_SETTING_KEYS.has(`${activeCategory}.${field.key}`)}
                  onChange={(value) => handleFieldChange(field.key, value)}
                />
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

function SettingsField({
  field,
  value,
  isDirty,
  isSecret,
  onChange,
}: {
  field: SettingsFieldMeta;
  value: unknown;
  isDirty: boolean;
  isSecret: boolean;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex items-start gap-2 pt-2">
        <label className="text-sm font-medium text-foreground">
          {field.label}
          {isDirty && <span className="ml-1.5 h-1.5 w-1.5 inline-block rounded-full bg-primary align-middle" />}
        </label>
      </div>
      <div className="col-span-2">
        {field.kind === 'boolean' && (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-2 h-4 w-4 rounded border-border"
          />
        )}
        {field.kind === 'number' && (
          <input
            type="number"
            value={typeof value === 'number' ? value : 0}
            onChange={(e) => onChange(e.target.valueAsNumber || 0)}
            className={inputClass}
          />
        )}
        {field.kind === 'enum' && (
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            {field.enumValues?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
        {field.kind === 'string' && (
          <SecretTextInput
            value={typeof value === 'string' ? value : ''}
            isSecret={isSecret}
            onChange={onChange}
          />
        )}
        {field.kind === 'stringArray' && (
          <StringArrayEditor
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
        )}
        {(field.kind === 'objectArray' || field.kind === 'record') && (
          <JsonEditor value={value} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function SecretTextInput({
  value,
  isSecret,
  onChange,
}: {
  value: string;
  isSecret: boolean;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const showReveal = isSecret && value.length > 0;
  return (
    <div className="relative">
      <input
        type={isSecret && !revealed ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${showReveal ? 'pr-9' : ''}`}
      />
      {showReveal && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={revealed ? 'Hide value' : 'Show value'}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function StringArrayEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const item = draft.trim();
    if (!item) return;
    if (!value.includes(item)) onChange([...value, item]);
    setDraft('');
  };
  const remove = (item: string) => onChange(value.filter((v) => v !== item));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add item and press Enter"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Add item"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused && value !== undefined) setDraft(JSON.stringify(value, null, 2));
  }, [value, focused]);

  const handleChange = (text: string) => {
    setDraft(text);
    if (text.trim() === '') {
      setInvalid(false);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setInvalid(false);
      onChange(parsed);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={5}
        spellCheck={false}
        className={`w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring ${
          invalid ? 'border-red-500 focus:ring-red-500' : 'border-border focus:border-ring'
        }`}
      />
      {invalid && (
        <p className="mt-1 text-xs text-red-600">Invalid JSON — not saved until fixed.</p>
      )}
    </div>
  );
}
