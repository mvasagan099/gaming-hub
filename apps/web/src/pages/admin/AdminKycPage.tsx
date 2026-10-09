import { useEffect, useState } from 'react';
import {
  FileCheck,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  ShieldAlert,
  UserCheck,
  FileText,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { adminApi, type AdminKycRequest } from '../../services/api/enterprise';
import { getApiUrl } from '../../services/api/client';
import { useAuthStore } from '../../store/authStore';
import { openMfaModal } from '../../components/auth/MfaVerificationModal';

export function AdminKycPage() {
  const [items, setItems] = useState<AdminKycRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<AdminKycRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // H-03 fix: blob URL map so tokens never appear in document URLs
  const [docBlobUrls, setDocBlobUrls] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let res;
      if (statusFilter === 'PENDING') {
        res = await adminApi.kycPending(page, pageSize);
      } else {
        res = await adminApi.kycListByStatus(statusFilter, page, pageSize);
      }
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KYC verification requests');
    } finally {
      setIsLoading(false);
    }
  };

  // H-03 fix: when a KYC request is selected, fetch all non-Supabase documents
  // using the Authorization header and create object URLs from the blobs.
  useEffect(() => {
    // Revoke previous blob URLs to avoid memory leaks
    Object.values(docBlobUrls).forEach((url) => URL.revokeObjectURL(url));
    setDocBlobUrls({});

    if (!selectedRequest?.documents?.length) return;
    const token = useAuthStore.getState().session?.access_token;
    if (!token) return;

    const apiBase = getApiUrl().replace(/\/+$/, "");

    selectedRequest.documents.forEach(async (doc) => {
      const rawUrl = doc.fileUrl;
      const isFullUrl = rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'));
      // Supabase public/signed URLs don't need our token — use them directly
      if (isFullUrl) {
        setDocBlobUrls((prev) => ({ ...prev, [doc.id]: rawUrl }));
        return;
      }
      // For API-proxied documents, fetch with Authorization header
      const fetchUrl = rawUrl?.startsWith('/')
        ? `${apiBase.replace(/\/api$/, '')}${rawUrl}`
        : `${apiBase}/admin/kyc/document/${doc.id}/view`;
      try {
        const res = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        setDocBlobUrls((prev) => ({ ...prev, [doc.id]: objectUrl }));
      } catch {
        // silently skip — the image will just be absent
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.id]);

  useEffect(() => {
    void loadRequests();
  }, [statusFilter, page]);

  useEffect(() => {
    const handleMfaVerified = () => {
      setError(null);
      void loadRequests();
    };
    window.addEventListener('gaming-hub:mfa-verified', handleMfaVerified);
    return () => window.removeEventListener('gaming-hub:mfa-verified', handleMfaVerified);
  }, [statusFilter, page]);

  const handleReview = async (approved: boolean) => {
    if (!selectedRequest) return;
    if (!approved && !rejectionReason) {
      setError('Please enter a rejection reason.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await adminApi.kycReview(selectedRequest.id, approved, reviewNotes, rejectionReason);
      setSelectedRequest(null);
      setReviewNotes('');
      setRejectionReason('');
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <FileCheck className="w-3.5 h-3.5 text-indigo-400" /> Identity Verification
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">KYC Verification Queue</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Audit government ID submissions, approve identity documents, set withdrawal tiers, or issue compliance rejections.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-center shrink-0">
              <div className="text-2xl font-black">{statusFilter === 'PENDING' ? total : '—'}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">Pending Audit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold">
          {['PENDING', 'APPROVED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl transition-all ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>
              {error.includes('/api/auth/2fa/verify')
                ? 'This action requires two-factor authentication (2FA) verification.'
                : error}
            </span>
          </div>
          {(error.includes('2FA') || error.includes('/api/auth/2fa/verify') || error.includes('MFA')) && (
            <button
              type="button"
              onClick={() => openMfaModal('Complete 2FA verification to review and manage KYC requests.')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md shadow-indigo-600/30 transition-all shrink-0 flex items-center gap-2"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Verify 2FA Now
            </button>
          )}
        </div>
      )}

      {/* Table Card */}
      <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-bold text-slate-400">Loading KYC requests...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="px-6 py-3.5">USER</th>
                  <th className="px-6 py-3.5">REQUESTED TIER</th>
                  <th className="px-6 py-3.5">STATUS</th>
                  <th className="px-6 py-3.5">SUBMITTED AT</th>
                  <th className="px-6 py-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {items.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {(req.user?.displayName || req.userId).slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            {req.user?.displayName || 'User'}
                          </div>
                          <div className="text-xs text-slate-400">
                            @{req.user?.username || req.userId.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 uppercase">
                        {req.level || 'TIER_1'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : req.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                      {new Date(req.submittedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs transition-colors flex items-center gap-1.5 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Audit Documents</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-xs font-semibold text-slate-400">
                      No KYC requests found under "{statusFilter}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages} ({total} Total Requests)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black">Review KYC Audit</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  User: <span className="font-bold text-white">{selectedRequest.user?.displayName || selectedRequest.userId}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400"
              >
                ✕
              </button>
            </div>

            {/* Applicant Details */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <h3 className="font-extrabold uppercase text-slate-500 tracking-wider text-[10px]">Applicant & Address Details</h3>
              <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                <div><span className="text-slate-400">Full Name:</span> <span className="font-bold">{selectedRequest.fullName || 'N/A'}</span></div>
                <div><span className="text-slate-400">Mobile:</span> <span className="font-bold">{selectedRequest.mobileNumber || 'N/A'}</span></div>
                <div><span className="text-slate-400">Country:</span> <span className="font-bold">{selectedRequest.country || 'N/A'}</span></div>
                <div><span className="text-slate-400">DOB:</span> <span className="font-bold">{selectedRequest.dateOfBirth ? new Date(selectedRequest.dateOfBirth).toLocaleDateString() : 'N/A'}</span></div>
              </div>
              {(selectedRequest.streetAddress || selectedRequest.city) && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <span className="text-slate-400">Residential Address:</span>{' '}
                  <span className="font-bold">
                    {[selectedRequest.streetAddress, selectedRequest.addressLine2, selectedRequest.city, selectedRequest.state, selectedRequest.postalCode].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Document Preview */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Uploaded Identity Documents & Live Selfie</h3>
              {selectedRequest.documents && selectedRequest.documents.length > 0 ? (
                <div className="grid gap-3">
                  {Array.from(
                    selectedRequest.documents.reduce((map, doc) => {
                      const key = `${doc.isSelfie ? 'selfie' : doc.documentType}-${doc.side || 'default'}`;
                      if (!map.has(key)) map.set(key, doc);
                      return map;
                    }, new Map<string, typeof selectedRequest.documents[0]>()).values()
                  ).map((doc) => {
                    // H-03 fix: use blob URL (fetched with Authorization header) or direct Supabase URL
                    const viewUrl = docBlobUrls[doc.id] ?? null;
                    const isImg = !doc.mimeType || doc.mimeType.startsWith('image/') || !!doc.fileName?.match(/\.(jpg|jpeg|png|webp)$/i) || !!doc.isSelfie;
                    return (
                      <div
                        key={doc.id}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-500" />
                            <span className="font-extrabold uppercase text-slate-800 dark:text-slate-200">
                              {doc.isSelfie ? 'Live Selfie' : doc.documentType?.replace(/_/g, ' ')}
                            </span>
                            {doc.side && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                {doc.side}
                              </span>
                            )}
                          </div>
                          <a
                            href={viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] transition-colors inline-flex items-center gap-1 shadow-sm"
                          >
                            <span>Open in Supabase</span> ↗
                          </a>
                        </div>

                        {isImg && viewUrl && (
                          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-black/5 max-h-48 flex items-center justify-center">
                            <img
                              src={viewUrl}
                              alt={doc.fileName || 'KYC Document'}
                              className="max-h-48 w-full object-contain rounded-xl"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No document previews attached.</p>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Internal Audit Notes</label>
                <input
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Verified passport expiration and name match."
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-rose-500">Rejection Reason (If Rejecting)</label>
                <input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="ID document image is blurry or expired."
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => void handleReview(false)}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-xs transition-colors disabled:opacity-50"
              >
                Reject Request
              </button>
              <button
                onClick={() => void handleReview(true)}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                Approve Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
