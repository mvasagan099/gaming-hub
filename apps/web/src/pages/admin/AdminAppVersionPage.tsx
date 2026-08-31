import { useEffect, useState } from 'react';
import {
  Smartphone,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  Shield,
  Download,
  ArrowUpCircle,
} from 'lucide-react';
import { adminApi } from '../../services/api/enterprise';
import type { AppVersionConfig } from '@gaming-hub/shared';
import { isValidSemver } from '@gaming-hub/shared';

// ─── Field Input component for consistent styling ─────────────────────────────
interface FieldProps {
  label: string;
  description: string;
  id: string;
  children: React.ReactNode;
  error?: string;
}

function Field({ label, description, id, children, error }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">
        {label}
      </label>
      <p className="text-xs text-slate-400 leading-relaxed -mt-0.5">{description}</p>
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AdminAppVersionPage() {
  const [config, setConfig] = useState<AppVersionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state
  const [latestVersion, setLatestVersion] = useState('');
  const [minimumSupportedVersion, setMinimumSupportedVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);

  // Validation errors
  const [latestVersionError, setLatestVersionError] = useState('');
  const [minimumVersionError, setMinimumVersionError] = useState('');
  const [downloadUrlError, setDownloadUrlError] = useState('');

  const loadConfig = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await adminApi.getAppVersionConfig();
      setConfig(data);
      setLatestVersion(data.latestVersion);
      setMinimumSupportedVersion(data.minimumSupportedVersion);
      setDownloadUrl(data.downloadUrl);
      setUpdateMessage(data.updateMessage);
      setForceUpdate(data.forceUpdate);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load app version config');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const validate = (): boolean => {
    let valid = true;

    if (!isValidSemver(latestVersion)) {
      setLatestVersionError('Must be a valid version like "1.0" or "2.3.1"');
      valid = false;
    } else {
      setLatestVersionError('');
    }

    if (!isValidSemver(minimumSupportedVersion)) {
      setMinimumVersionError('Must be a valid version like "1.0" or "2.3.1"');
      valid = false;
    } else {
      setMinimumVersionError('');
    }

    try {
      new URL(downloadUrl);
      setDownloadUrlError('');
    } catch {
      setDownloadUrlError('Must be a valid URL (e.g. https://play.google.com/...)');
      valid = false;
    }

    return valid;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updated = await adminApi.updateAppVersionConfig({
        latestVersion: latestVersion.trim(),
        minimumSupportedVersion: minimumSupportedVersion.trim(),
        downloadUrl: downloadUrl.trim(),
        updateMessage: updateMessage.trim(),
        forceUpdate,
      });
      setConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-xs font-bold text-slate-400">Loading App Version Config...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-slate-300">{loadError}</p>
          <button
            id="retry-load-btn"
            onClick={() => void loadConfig()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Android App Version Control</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Control which versions of the Android app are allowed to connect.
            </p>
          </div>
        </div>
        <button
          id="refresh-version-config-btn"
          onClick={() => void loadConfig()}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Last updated */}
      {config && (
        <div className="text-xs text-slate-500">
          Last updated:{' '}
          <span className="text-slate-400">
            {new Date(config.updatedAt).toLocaleString()}
          </span>
          {config.updatedBy && (
            <span className="text-slate-500"> · by admin ID: {config.updatedBy}</span>
          )}
        </div>
      )}

      {/* Force update warning */}
      {forceUpdate && (
        <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-300">Force Update is ON</p>
            <p className="text-xs text-orange-400/80 mt-1">
              All Android users — regardless of their installed version — will see the hard-lock
              update screen and cannot use the app until they update.
            </p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300/80 space-y-1">
          <p>
            <strong className="text-blue-200">How it works:</strong> Android users below the minimum
            version see a full-screen update screen and cannot access any app functionality until they
            update. Web browser users are never affected.
          </p>
          <p>
            <strong className="text-blue-200">Version format:</strong> Use{' '}
            <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-200">1.0</code> or{' '}
            <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-200">1.2.3</code> format.
            The comparison is semantic (1.10.0 &gt; 1.9.0).
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-6">
        {/* Version fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            id="latest-version"
            label="Latest Version"
            description="The most recent version of the app. Shown on the update screen."
            error={latestVersionError}
          >
            <div className="relative">
              <ArrowUpCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="latest-version"
                type="text"
                value={latestVersion}
                onChange={(e) => setLatestVersion(e.target.value)}
                placeholder="e.g. 1.2.0"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/60 border border-slate-600 hover:border-slate-500 focus:border-indigo-500 focus:outline-none rounded-lg text-sm text-white font-mono placeholder-slate-500 transition-colors"
              />
            </div>
          </Field>

          <Field
            id="minimum-version"
            label="Minimum Supported Version"
            description="Oldest allowed version. Users below this are hard-locked."
            error={minimumVersionError}
          >
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="minimum-version"
                type="text"
                value={minimumSupportedVersion}
                onChange={(e) => setMinimumSupportedVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/60 border border-slate-600 hover:border-slate-500 focus:border-indigo-500 focus:outline-none rounded-lg text-sm text-white font-mono placeholder-slate-500 transition-colors"
              />
            </div>
          </Field>
        </div>

        {/* Download URL */}
        <Field
          id="download-url"
          label="Download / Update URL"
          description='Link opened when the user taps "UPDATE NOW". Use the Play Store listing or direct APK URL.'
          error={downloadUrlError}
        >
          <div className="relative">
            <Download className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="download-url"
              type="url"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=..."
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900/60 border border-slate-600 hover:border-slate-500 focus:border-indigo-500 focus:outline-none rounded-lg text-sm text-white placeholder-slate-500 transition-colors"
            />
          </div>
        </Field>

        {/* Update message */}
        <Field
          id="update-message"
          label="Update Screen Message"
          description="Text shown to users on the hard-lock update screen below the heading."
        >
          <textarea
            id="update-message"
            rows={3}
            value={updateMessage}
            onChange={(e) => setUpdateMessage(e.target.value)}
            placeholder="A new version of Gaming Hub is required. Please update to continue playing."
            className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-600 hover:border-slate-500 focus:border-indigo-500 focus:outline-none rounded-lg text-sm text-white placeholder-slate-500 resize-none transition-colors"
          />
          <p className="text-xs text-slate-500 text-right">{updateMessage.length}/500</p>
        </Field>

        {/* Force update toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-700/50 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Force Update (All Users)</p>
              <p className="text-xs text-slate-400 mt-0.5">
                When ON, <strong className="text-orange-300">all</strong> Android users see the
                hard-lock screen regardless of their installed version.
              </p>
            </div>
          </div>
          <button
            id="force-update-toggle"
            role="switch"
            aria-checked={forceUpdate}
            onClick={() => setForceUpdate(!forceUpdate)}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
              forceUpdate ? 'bg-orange-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                forceUpdate ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save feedback */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          Configuration saved successfully. Android clients will pick up changes within 60 seconds.
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" />
          {saveError}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          id="save-app-version-btn"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
}
