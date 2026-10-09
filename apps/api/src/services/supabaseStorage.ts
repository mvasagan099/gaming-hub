import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
// MEDIUM-3 fix: no silent placeholder fallback — missing key in production is caught
// at startup by the Zod env schema in env.ts. In development the anon key is acceptable.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  // Emit a clear warning in development so engineers notice immediately.
  console.warn(
    "⚠️  [supabaseStorage] No Supabase key found. KYC document storage will fail. " +
    "Set SUPABASE_SERVICE_ROLE_KEY in your environment."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey ?? "", {
  auth: { persistSession: false },
});

export const KYC_BUCKET = "kyc_upload";

let bucketEnsured = false;

export async function ensureKycBucketExists(): Promise<void> {
  if (bucketEnsured) return;
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw new Error('KYC private bucket inspection failed');
    const exists = buckets?.some((b) => b.name === KYC_BUCKET);
    if (buckets?.some(b => b.name === KYC_BUCKET && b.public)) throw new Error('KYC bucket must be private');
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(KYC_BUCKET, {
        public: false,
        fileSizeLimit: 2 * 1024 * 1024,
      });
      if (error) throw new Error('KYC private bucket creation failed');
    }
    bucketEnsured = true;
}

export interface SupabaseUploadResult {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function uploadKycToSupabase(
  userId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  side?: "front" | "back",
  isSelfie?: boolean,
  documentType?: string,
): Promise<SupabaseUploadResult> {
  const MAX_BYTES = 2 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) {
    throw new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds 2MB limit`);
  }

  await ensureKycBucketExists();

  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const kind = (isSelfie ? 'SELFIE' : documentType ?? 'IDENTITY').replace(/[^A-Z_]/gi, '');
  const objectName = `${kind}-${side ?? 'front'}-${randomUUID()}.${ext}`;

  const fullPath = `${userId}/${objectName}`;

  const { error } = await supabaseAdmin.storage
    .from(KYC_BUCKET)
    .upload(fullPath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.warn(`Supabase storage upload notice for ${fullPath}:`, error.message);
    throw new Error(`KYC document upload failed: ${error.message}`);
  }

  return {
    fileName: objectName,
    filePath: fullPath,
    fileSize: buffer.length,
    mimeType,
  };
}

export async function getKycSignedUrl(filePath: string, expiresInSeconds: number = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(KYC_BUCKET)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }
    return data.signedUrl;
  } catch {
    return null;
  }
}

export const SupabaseStorageService = {
  upload: uploadKycToSupabase,
  getSignedUrl: getKycSignedUrl,
  ensureBucket: ensureKycBucketExists,
};

export default SupabaseStorageService;
