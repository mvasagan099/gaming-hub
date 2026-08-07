import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, FileImage, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../services/api/client';
import { KycLevel, KycDocumentType, COUNTRY_DOCUMENTS } from '@gaming-hub/shared';
import type { MultipartFile } from 'fastify-multipart';

export function KycVerifyPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<KycLevel>(KycLevel.LEVEL_1);
  const [country, setCountry] = useState('IN');
  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    mobileNumber: '',
  });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Array<{
    documentType: KycDocumentType;
    file: File;
    side?: 'front' | 'back';
  }>>([]);
  const [selfie, setSelfie] = useState<File | null>(null);

  const supportedCountries = [
    { code: 'IN', name: 'India' },
    { code: 'US', name: 'United States' },
    { code: 'UK', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
  ];

  const getDocumentsForCountry = (countryCode: string): KycDocumentType[] => {
    return COUNTRY_DOCUMENTS[countryCode] || COUNTRY_DOCUMENTS['DEFAULT'];
  };

  const handleInitiateKyc = async () => {
    if (!formData.fullName || !formData.dateOfBirth || !formData.mobileNumber) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ ok: boolean; requestId: string }>('/kyc/initiate', {
        fullName: formData.fullName,
        dateOfBirth: new Date(formData.dateOfBirth).toISOString(),
        country,
        mobileNumber: formData.mobileNumber,
      });

      setRequestId(result.requestId);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to initiate KYC');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    documentType: KycDocumentType,
    file: File,
    side?: 'front' | 'back'
  ) => {
    if (!requestId) return;

    const formData = new FormData();
    formData.append('requestId', requestId);
    formData.append('documentType', documentType);
    formData.append('file', file);
    if (side) {
      formData.append('side', side);
    }

    try {
      await apiClient.post<{ ok: boolean; documentId: string }>('/kyc/upload', formData);
      setDocuments([...documents, { documentType, file, side }]);
      toast.success('Document uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document');
    }
  };

  const handleSelfieUpload = async (file: File) => {
    if (!requestId) return;

    const formData = new FormData();
    formData.append('requestId', requestId);
    formData.append('documentType', 'SELFIE');
    formData.append('isSelfie', 'true');
    formData.append('file', file);

    try {
      await apiClient.post<{ ok: boolean; documentId: string }>('/kyc/upload', formData);
      setSelfie(file);
      toast.success('Selfie uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload selfie');
    }
  };

  const handleSubmit = async () => {
    if (!requestId) return;

    setLoading(true);
    try {
      await apiClient.post('/kyc/submit', { requestId });
      toast.success('KYC submitted for review');
      navigate('/kyc');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit KYC');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/kyc')}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Enter your details as they appear on your ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="John Doe"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Date of Birth</label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {supportedCountries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Mobile Number</label>
              <input
                type="tel"
                value={formData.mobileNumber}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                placeholder="+91 9876543210"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <Button onClick={handleInitiateKyc} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>
              Upload your identity documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Select Document Type</h3>
              <div className="grid grid-cols-2 gap-2">
                {getDocumentsForCountry(country).map((doc) => (
                  <DocumentUploadCard
                    key={doc}
                    type={doc}
                    onUpload={(file, side) => handleFileUpload(doc, file, side)}
                    uploaded={documents.some(d => d.documentType === doc)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Selfie Verification</h3>
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-accent-500 transition-colors">
                {selfie ? (
                  <>
                    <img
                      src={URL.createObjectURL(selfie)}
                      alt="Selfie"
                      className="w-24 h-24 rounded-full object-cover"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{selfie.name}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Upload a selfie
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSelfieUpload(file);
                  }}
                />
              </label>
            </div>

            <Button onClick={handleSubmit} disabled={loading || documents.length === 0 || !selfie} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit for Review
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocumentUploadCard({
  type,
  onUpload,
  uploaded,
}: {
  type: KycDocumentType;
  onUpload: (file: File, side?: 'front' | 'back') => void;
  uploaded: boolean;
}) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const needsBack = [
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.NATIONAL_ID,
    KycDocumentType.RESIDENCE_PERMIT,
  ].includes(type);

  const handleUpload = () => {
    onUpload(front!, 'front');
    if (needsBack && back) {
      onUpload(back, 'back');
    }
  };

  return (
    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{type.replace(/_/g, ' ')}</span>
        {uploaded && (
          <span className="text-xs text-green-600 dark:text-green-400">Uploaded</span>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 cursor-pointer text-xs">
          <FileImage className="w-4 h-4" />
          {front ? front.name.slice(0, 15) : 'Front'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFront(e.target.files?.[0] ?? null)}
          />
        </label>

        {needsBack && (
          <label className="flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 cursor-pointer text-xs">
            <FileImage className="w-4 h-4" />
            {back ? back.name.slice(0, 15) : 'Back'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setBack(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {!uploaded && front && (
        <Button size="sm" onClick={handleUpload} className="w-full">
          Upload
        </Button>
      )}
    </div>
  );
}
