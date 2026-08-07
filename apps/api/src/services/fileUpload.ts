import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";

export interface FileUploadConfig {
  uploadDir: string;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

const DEFAULT_UPLOAD_CONFIG: FileUploadConfig = {
  uploadDir: process.env.KYC_UPLOAD_DIR || "./uploads/kyc",
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

let uploadConfig = DEFAULT_UPLOAD_CONFIG;

export function configureFileUpload(newConfig: Partial<FileUploadConfig>): void {
  uploadConfig = { ...DEFAULT_UPLOAD_CONFIG, ...newConfig };
  ensureUploadDir();
}

function ensureUploadDir(): void {
  if (!existsSync(uploadConfig.uploadDir)) {
    mkdirSync(uploadConfig.uploadDir, { recursive: true });
  }
}

export interface UploadedFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): FileValidationResult {
  if (!uploadConfig.allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${uploadConfig.allowedMimeTypes.join(", ")}`,
    };
  }

  if (buffer.length > uploadConfig.maxFileSizeBytes) {
    const maxMB = uploadConfig.maxFileSizeBytes / (1024 * 1024);
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxMB}MB`,
    };
  }

  const ext = fileName.split(".").pop()?.toLowerCase();
  const allowedExts = ["jpg", "jpeg", "png", "webp", "pdf"];
  if (!ext || !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed: ${allowedExts.join(", ")}`,
    };
  }

  return { valid: true };
}

export function calculateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function generateSecureFileName(originalName: string): string {
  const uniqueId = randomBytes(16).toString("hex");
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
  return `${uniqueId}.${ext}`;
}

export function getEncryptedFilePath(userId: string, fileName: string): string {
  const userDir = join(uploadConfig.uploadDir, userId.slice(0, 2), userId.slice(2, 4), userId);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }
  return join(userDir, fileName);
}

export async function saveUploadedFile(
  userId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<UploadedFile> {
  ensureUploadDir();

  const validation = validateFile(buffer, mimeType, originalName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const fileName = generateSecureFileName(originalName);
  const filePath = getEncryptedFilePath(userId, fileName);
  const fileHash = calculateFileHash(buffer);

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath);
    stream.write(buffer);
    stream.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return {
    fileName,
    filePath,
    fileSize: buffer.length,
    mimeType,
    fileHash,
  };
}

export async function deleteUploadedFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function getFileStats(filePath: string): { size: number; exists: boolean } {
  try {
    const stats = statSync(filePath);
    return { size: stats.size, exists: true };
  } catch {
    return { size: 0, exists: false };
  }
}

export function generateSignedUrl(
  userId: string,
  fileName: string,
  secret: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiry
  const signature = createHash("sha256")
    .update(`${userId}:${fileName}:${timestamp}:${secret}`)
    .digest("hex")
    .slice(0, 32);
  return `?sig=${signature}&exp=${timestamp}`;
}

export const FileUploadService = {
  configure: configureFileUpload,
  validate: validateFile,
  save: saveUploadedFile,
  delete: deleteUploadedFile,
  getStats: getFileStats,
  hash: calculateFileHash,
  generateUrl: generateSignedUrl,
};

export default FileUploadService;
