import React, { useState } from 'react';
import { AlertCircle, FileText, Send, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../ui/Button';
import { tournamentsApi } from '../../services/api/enterprise';
import type { TournamentDisputeReason } from '@gaming-hub/shared';

interface DisputeReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  tournamentId: string;
  tournamentTitle?: string;
  roundNumber?: number;
  gameName?: string;
  onDisputeSubmitted?: () => void;
}

const DISPUTE_REASONS: { value: TournamentDisputeReason; label: string; description: string }[] = [
  {
    value: 'WRONG_RESULT',
    label: 'Wrong Winner / Result Declared',
    description: 'The server recorded the wrong player as the match winner.',
  },
  {
    value: 'INCORRECT_SCORE',
    label: 'Incorrect Final Score',
    description: 'The points or frame score does not match the actual gameplay.',
  },
  {
    value: 'CONNECTION_ISSUE',
    label: 'Disconnection / Sync Failure',
    description: 'Server or socket dropped during active turn without reconnect opportunity.',
  },
  {
    value: 'GAME_STATE_ISSUE',
    label: 'Game Rule / State Anomaly',
    description: 'Game state desynced or rules were evaluated abnormally.',
  },
  {
    value: 'SUSPECTED_CHEATING',
    label: 'Suspected Cheating / Exploits',
    description: 'Suspicious bot activity, timer manipulation, or game glitch abuse.',
  },
  {
    value: 'OTHER',
    label: 'Other Match Issue',
    description: 'Any other issue not covered above.',
  },
];

export const DisputeReportModal: React.FC<DisputeReportModalProps> = ({
  isOpen,
  onClose,
  matchId,
  tournamentId,
  tournamentTitle,
  roundNumber,
  gameName,
  onDisputeSubmitted,
}) => {
  const [reason, setReason] = useState<TournamentDisputeReason>('WRONG_RESULT');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleAddEvidence = () => {
    if (!evidenceUrl.trim()) return;
    try {
      const parsed = new URL(evidenceUrl.trim());
      const path = parsed.pathname.toLowerCase();
      const forbidden = ['.exe', '.bat', '.cmd', '.sh', '.js', '.py', '.bin', '.vbs', '.msi', '.scr'];
      if (forbidden.some((ext) => path.endsWith(ext))) {
        toast.error('Executable and script file links are not allowed as evidence.');
        return;
      }
      if (!evidenceUrls.includes(evidenceUrl.trim())) {
        setEvidenceUrls([...evidenceUrls, evidenceUrl.trim()]);
      }
      setEvidenceUrl('');
    } catch {
      toast.error('Please enter a valid HTTP/HTTPS URL for evidence');
    }
  };

  const handleRemoveEvidence = (idx: number) => {
    setEvidenceUrls(evidenceUrls.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 5) {
      toast.error('Please provide a detailed description (at least 5 characters).');
      return;
    }

    setLoading(true);
    try {
      await tournamentsApi.submitDispute({
        matchId,
        reason,
        description: description.trim(),
        evidenceUrls,
      });

      toast.success('Match dispute report submitted successfully!');
      setSubmitted(true);
      if (onDisputeSubmitted) {
        onDisputeSubmitted();
      }
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setDescription('');
        setEvidenceUrls([]);
      }, 1500);
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit match report';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Report Match Result</h2>
              <p className="text-xs text-slate-400">
                {tournamentTitle ? `${tournamentTitle} · ` : ''}Round {roundNumber || 1}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="size-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-black text-slate-100">Dispute Report Received</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Our tournament integrity operations team has received your report. Authoritative server replay & event logs are being audited.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Match Information Info box */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs text-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Match ID:</span>
                <span className="font-mono text-slate-200">{matchId}</span>
              </div>
              {gameName && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Game:</span>
                  <span className="font-bold text-slate-200">{gameName}</span>
                </div>
              )}
            </div>

            {/* Reason selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Reason for Report
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DISPUTE_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`flex flex-col text-left rounded-2xl border p-3 transition-all ${
                      reason === r.value
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300 shadow-sm'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-200">{r.label}</span>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-2">{r.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Detailed Explanation
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened during the match..."
                rows={3}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-100 outline-none focus:border-amber-500 transition-colors resize-none"
              />
            </div>

            {/* Optional Evidence URLs */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Supporting Evidence URL (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://imgur.com/... or cloud link"
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddEvidence}>
                  Add
                </Button>
              </div>

              {evidenceUrls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {evidenceUrls.map((url, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300"
                    >
                      <span className="max-w-[150px] truncate">{url}</span>
                      <button type="button" onClick={() => handleRemoveEvidence(idx)} className="text-slate-400 hover:text-rose-400">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notice */}
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-[11px] text-amber-400/90">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                Reports must be submitted within 10 minutes of match completion. Server-authoritative replay event logs are recorded for all matches.
              </span>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold gap-1.5">
                <Send className="size-3.5" />
                {loading ? 'Submitting...' : 'Submit Report'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
