import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Shield, AlertCircle, Check, Clock, FileImage, Upload, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../services/api/client';
import { KycLevel, KycStatus, KYC_LEVEL_NAMES, KYC_LEVEL_PERMISSIONS } from '@gaming-hub/shared';

interface KycRequest {
  id: string;
  status: string;
  level: string;
  country: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  mobileNumber: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  documents: Array<{
    id: string;
    documentType: string;
    status: string;
    fileName: string;
    side: string | null;
    isSelfie: boolean;
    rejectionReason: string | null;
  }>;
}

export function KycPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('NOT_STARTED');
  const [level, setLevel] = useState<string>(KycLevel.LEVEL_0);
  const [request, setRequest] = useState<KycRequest | null>(null);

  useEffect(() => {
    loadKycStatus();
  }, []);

  const loadKycStatus = async () => {
    try {
      const result = await apiClient.get<{ status: string; level: string; request: KycRequest | null }>('/kyc/status');
      setStatus(result.status);
      setLevel(result.level);
      setRequest(result.request);
    } catch (err) {
      toast.error('Failed to load KYC status');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  const isApproved = status === 'APPROVED';
  const isPending = status === 'PENDING' || status === 'UNDER_REVIEW';
  const isRejected = status === 'REJECTED';
  const needsResubmission = status === 'REQUIRES_RESUBMISSION';

  if (isApproved) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              KYC Verified
            </CardTitle>
            <CardDescription>
              Your identity has been verified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-green-500/10 border border-green-500/30">
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">
                  {KYC_LEVEL_NAMES[level as KycLevel] || 'Verified'}
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">
                  Verified on {request?.approvedAt ? new Date(request.approvedAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>

            {request?.expiresAt && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Expires: {new Date(request.expiresAt).toLocaleDateString()}
              </p>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Permissions</p>
              <ul className="space-y-1">
                {KYC_LEVEL_PERMISSIONS[level as KycLevel]?.map((permission, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Check className="w-3 h-3 text-green-500" />
                    {permission}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent-500" />
            KYC Verification
          </CardTitle>
          <CardDescription>
            Verify your identity to unlock withdrawals and premium features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isPending && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Clock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">Under Review</p>
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  Your documents are being reviewed. This usually takes 1-3 business days.
                </p>
              </div>
            </div>
          )}

          {(isRejected || needsResubmission) && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-rose-700 dark:text-rose-400">
                  {needsResubmission ? 'Resubmission Required' : 'Verification Rejected'}
                </p>
                <p className="text-sm text-rose-600 dark:text-rose-500">
                  {request?.rejectionReason || 'Please submit your documents again'}
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Verification Levels</p>
            <div className="space-y-2">
              {Object.entries(KYC_LEVEL_NAMES).map(([lvl, name]) => (
                <div
                  key={lvl}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    level === lvl
                      ? 'border-accent-500 bg-accent-500/5'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-medium">{name}</span>
                  {level === lvl && (
                    <span className="text-xs font-bold text-accent-600 dark:text-accent-400">
                      {isPending ? 'Pending' : isApproved ? 'Verified' : 'Current'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(status === 'NOT_STARTED' || needsResubmission) && (
            <Button onClick={() => navigate('/kyc/verify')} className="w-full">
              Start Verification
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
