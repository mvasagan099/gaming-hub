import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileImage, X, Loader2, Check, Camera, Calendar, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../services/api/client';
import { useMe } from '../../services/api/useMe';
import { KycDocumentType, COUNTRY_DOCUMENTS, COUNTRIES } from '@gaming-hub/shared';

async function compressImageIfNeeded(file: File, maxSizeBytes = 2 * 1024 * 1024): Promise<File> {
  if (!file.type.startsWith('image/')) {
    if (file.size > maxSizeBytes) {
      throw new Error(`File size must be less than 2MB (current: ${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    }
    return file;
  }

  if (file.size <= maxSizeBytes) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);

      ctx.drawImage(img, 0, 0, width, height);

      const compressLoop = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            if (blob.size <= maxSizeBytes || q <= 0.3) {
              const compressedName = file.name.replace(/\.[^/.]+$/, '.jpg');
              resolve(new File([blob], compressedName, { type: 'image/jpeg' }));
            } else {
              compressLoop(q - 0.15);
            }
          },
          'image/jpeg',
          q
        );
      };

      compressLoop(0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to process image for compression'));
    };
    img.src = url;
  });
}

const CURRENT_YEAR = new Date().getFullYear();
const MAX_BIRTH_YEAR = CURRENT_YEAR - 18;
const YEARS = Array.from({ length: MAX_BIRTH_YEAR - 1920 + 1 }, (_, i) => MAX_BIRTH_YEAR - i);

const MONTHS = [
  { value: '01', label: '01 - Jan' },
  { value: '02', label: '02 - Feb' },
  { value: '03', label: '03 - Mar' },
  { value: '04', label: '04 - Apr' },
  { value: '05', label: '05 - May' },
  { value: '06', label: '06 - Jun' },
  { value: '07', label: '07 - Jul' },
  { value: '08', label: '08 - Aug' },
  { value: '09', label: '09 - Sep' },
  { value: '10', label: '10 - Oct' },
  { value: '11', label: '11 - Nov' },
  { value: '12', label: '12 - Dec' },
];

function calculateAge(dobString: string): number | null {
  if (!dobString || dobString.length < 10) return null;
  const birth = new Date(dobString);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function KycVerifyPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const [step, setStep] = useState(1);

  useEffect(() => {
    async function checkExistingStatus() {
      try {
        const res = await apiClient.get<{ status: string }>('/kyc/status');
        if (res?.status === 'APPROVED' || res?.status === 'PENDING' || res?.status === 'UNDER_REVIEW') {
          navigate('/kyc');
        }
      } catch {
        // ignore
      }
    }
    void checkExistingStatus();
  }, [navigate]);

  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState('IN');
  const [selectedDocType, setSelectedDocType] = useState<KycDocumentType | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    mobileNumber: '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
  });

  // Pre-fill user details from profile if available
  useEffect(() => {
    if (me) {
      const fullName = me.user?.displayName || me.user?.username || '';
      let dobStr = '';
      if (me.profile?.dateOfBirth) {
        dobStr = typeof me.profile.dateOfBirth === 'string'
          ? me.profile.dateOfBirth.slice(0, 10)
          : new Date(me.profile.dateOfBirth).toISOString().slice(0, 10);
      }
      setFormData((prev) => ({
        fullName: prev.fullName || fullName,
        dateOfBirth: prev.dateOfBirth || dobStr,
        mobileNumber: prev.mobileNumber || me.profile?.phone || '',
        streetAddress: prev.streetAddress || me.profile?.streetAddress || '',
        addressLine2: prev.addressLine2 || '',
        city: prev.city || me.profile?.city || '',
        state: prev.state || me.profile?.state || '',
        postalCode: prev.postalCode || me.profile?.postcode || '',
      }));
      if (me.profile?.country) {
        setCountry(me.profile.country);
      }
    }
  }, [me]);

  const dobParts = formData.dateOfBirth ? formData.dateOfBirth.split('-') : ['', '', ''];
  const dobYear = dobParts[0] || '';
  const dobMonth = dobParts[1] || '';
  const dobDay = dobParts[2] || '';

  const daysInSelectedMonth = dobYear && dobMonth
    ? new Date(Number(dobYear), Number(dobMonth), 0).getDate()
    : 31;
  const DAYS = Array.from({ length: daysInSelectedMonth }, (_, i) => String(i + 1).padStart(2, '0'));

  const updateDobPart = (year: string, month: string, day: string) => {
    if (!year && !month && !day) {
      setFormData((prev) => ({ ...prev, dateOfBirth: '' }));
      return;
    }
    const y = year || '2000';
    const m = month || '01';
    const d = day || '01';
    setFormData((prev) => ({ ...prev, dateOfBirth: `${y}-${m}-${d}` }));
  };

  const currentAge = calculateAge(formData.dateOfBirth);
  const isUnderage = currentAge !== null && currentAge < 18;

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
    if (
      !formData.fullName ||
      !formData.dateOfBirth ||
      !formData.mobileNumber ||
      !formData.streetAddress ||
      !formData.city ||
      !formData.state ||
      !formData.postalCode
    ) {
      toast.error('Please fill all personal and address details');
      return;
    }

    if (isUnderage) {
      toast.error('You must be at least 18 years old to complete KYC verification');
      return;
    }

    const parsedDob = new Date(formData.dateOfBirth);
    if (isNaN(parsedDob.getTime())) {
      toast.error('Please enter a valid Date of Birth');
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ ok: boolean; requestId: string }>('/kyc/initiate', {
        fullName: formData.fullName,
        dateOfBirth: parsedDob.toISOString(),
        country,
        mobileNumber: formData.mobileNumber,
        streetAddress: formData.streetAddress,
        addressLine2: formData.addressLine2 || undefined,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
      });

      setRequestId(result.requestId);
      setStep(2);
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

    try {
      const uploadFile = await compressImageIfNeeded(file);
      const formData = new FormData();
      formData.append('requestId', requestId);
      formData.append('documentType', documentType);
      formData.append('file', uploadFile);
      if (side) {
        formData.append('side', side);
      }

      await apiClient.post<{ ok: boolean; documentId: string }>('/kyc/upload', formData);
      setDocuments((prev) => [...prev, { documentType, file: uploadFile, side }]);
      toast.success('Document compressed & uploaded (< 2 MB)');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document');
    }
  };

  const handleSelfieUpload = async (file: File) => {
    if (!requestId) return;

    try {
      const uploadFile = await compressImageIfNeeded(file);
      const formData = new FormData();
      formData.append('requestId', requestId);
      formData.append('documentType', 'SELFIE');
      formData.append('isSelfie', 'true');
      formData.append('file', uploadFile);

      await apiClient.post<{ ok: boolean; documentId: string }>('/kyc/upload', formData);
      setSelfie(uploadFile);
      toast.success('Live selfie compressed & saved (< 2 MB)');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save selfie');
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

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal Information & Address</CardTitle>
            <CardDescription>
              Enter your personal details and residential address before document submission
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Full Name (as on ID)</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Country of Residence</label>
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
                  placeholder="+1 234 567 8900"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold">Date of Birth</label>
                  {currentAge !== null && (
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        isUnderage
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      }`}
                    >
                      {isUnderage ? `Under 18 (Age: ${currentAge})` : `${currentAge} years old`}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {/* Day */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Day</label>
                    <select
                      value={dobDay}
                      onChange={(e) => updateDobPart(dobYear || '2000', dobMonth || '01', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium focus:border-indigo-500 outline-none"
                    >
                      <option value="">Day</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Month */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Month</label>
                    <select
                      value={dobMonth}
                      onChange={(e) => updateDobPart(dobYear || '2000', e.target.value, dobDay || '01')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium focus:border-indigo-500 outline-none"
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Year */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Year</label>
                    <select
                      value={dobYear}
                      onChange={(e) => updateDobPart(e.target.value, dobMonth || '01', dobDay || '01')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-medium focus:border-indigo-500 outline-none"
                    >
                      <option value="">Year</option>
                      {YEARS.map((y) => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {isUnderage && (
                  <p className="mt-2 text-xs text-rose-500 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    You must be at least 18 years of age to submit identity verification.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Residential Address</h4>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Street Address</label>
                <input
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                  placeholder="123 Main Street"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Apartment, suite, unit (optional)</label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                  placeholder="Apt 4B"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">State / Province</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="State"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">Postal Code / ZIP</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="10001"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleInitiateKyc} disabled={loading} className="w-full mt-4">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Continue to Document & Selfie Upload →
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>
              Select a document type and upload your identity document
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Select Document Type</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {getDocumentsForCountry(country).map((doc) => {
                  const isUploaded = documents.some(d => d.documentType === doc);
                  const isSelected = selectedDocType === doc;
                  return (
                    <button
                      key={doc}
                      type="button"
                      onClick={() => setSelectedDocType(doc)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[72px] cursor-pointer ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{doc.replace(/_/g, ' ')}</span>
                      {isUploaded ? (
                        <span className="text-[10px] font-extrabold w-max px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mt-2">
                          ✓ Uploaded
                        </span>
                      ) : isSelected ? (
                        <span className="text-[10px] font-extrabold w-max px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 mt-2">
                          Selected
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400 mt-2">
                          Click to select
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDocType ? (
              <div className="space-y-4 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Upload {selectedDocType.replace(/_/g, ' ')}
                </h3>
                <DocumentUploadForm
                  type={selectedDocType}
                  onUpload={(file, side) => handleFileUpload(selectedDocType, file, side)}
                  uploaded={documents.some(d => d.documentType === selectedDocType)}
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                Please select a document type above to reveal upload controls.
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span>Selfie Verification</span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Live Camera Only
                </span>
              </h3>
              <LiveSelfieCapture
                selfie={selfie}
                onCapture={(file) => handleSelfieUpload(file)}
              />
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

function LiveSelfieCapture({
  selfie,
  onCapture,
}: {
  selfie: File | null;
  onCapture: (file: File) => void;
}) {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (err) {
      setError('Unable to access camera. Please ensure camera permissions are allowed in your browser.');
    }
  };

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally for natural selfie orientation
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'live-selfie.jpg', { type: 'image/jpeg' });
        onCapture(file);
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 space-y-4 text-center">
      {isCameraOpen ? (
        <div className="flex flex-col items-center space-y-3 w-full">
          <div className="relative overflow-hidden rounded-xl border-2 border-indigo-500 bg-black w-full max-w-sm aspect-video flex items-center justify-center shadow-lg">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={capturePhoto} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Camera className="w-4 h-4 mr-1.5" />
              Capture Selfie
            </Button>
            <Button size="sm" variant="outline" onClick={stopCamera}>
              Cancel
            </Button>
          </div>
        </div>
      ) : selfie ? (
        <div className="flex flex-col items-center space-y-3">
          <img
            src={URL.createObjectURL(selfie)}
            alt="Live Selfie"
            className="w-28 h-28 rounded-full object-cover border-4 border-indigo-500 shadow-md"
          />
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" />
            Live Selfie Captured
          </div>
          <Button size="sm" variant="outline" onClick={startCamera}>
            <Camera className="w-4 h-4 mr-1.5" />
            Retake Live Selfie
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-3">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-full border border-indigo-100 dark:border-indigo-900/50">
            <Camera className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Live Camera Selfie Required</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">
              File uploads are disabled for selfie verification. Please use your camera to take a real-time photo.
            </p>
          </div>
          {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          <Button size="sm" onClick={startCamera} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Camera className="w-4 h-4 mr-1.5" />
            Open Camera & Take Live Selfie
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentUploadForm({
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

  useEffect(() => {
    setFront(null);
    setBack(null);
  }, [type]);

  const needsBack = ([
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.NATIONAL_ID,
    KycDocumentType.RESIDENCE_PERMIT,
  ] as KycDocumentType[]).includes(type);

  const handleUpload = () => {
    if (!front) return;
    onUpload(front, 'front');
    if (needsBack && back) {
      onUpload(back, 'back');
    }
  };

  if (uploaded) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
        <Check className="w-4 h-4" />
        Document uploaded successfully.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">Front Side</span>
          <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs hover:border-indigo-500 transition-colors">
            <FileImage className="w-4 h-4 text-slate-500" />
            <span className="truncate">{front ? front.name : 'Choose Front File'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFront(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {needsBack && (
          <div>
            <span className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-400">Back Side</span>
            <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs hover:border-indigo-500 transition-colors">
              <FileImage className="w-4 h-4 text-slate-500" />
              <span className="truncate">{back ? back.name : 'Choose Back File'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setBack(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}
      </div>

      {front && (!needsBack || back) && (
        <Button size="sm" onClick={handleUpload} className="w-full mt-2">
          Upload Document
        </Button>
      )}
    </div>
  );
}
