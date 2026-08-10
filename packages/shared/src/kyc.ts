import { z } from "zod";

export const KycLevel = {
  LEVEL_0: "LEVEL_0",
  LEVEL_1: "LEVEL_1",
  LEVEL_2: "LEVEL_2",
  LEVEL_3: "LEVEL_3",
} as const;
export type KycLevel = (typeof KycLevel)[keyof typeof KycLevel];

export const KycStatus = {
  NOT_STARTED: "NOT_STARTED",
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  REQUIRES_RESUBMISSION: "REQUIRES_RESUBMISSION",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const KycDocumentType = {
  AADHAAR_CARD: "AADHAAR_CARD",
  PAN_CARD: "PAN_CARD",
  VOTER_ID: "VOTER_ID",
  PASSPORT: "PASSPORT",
  DRIVING_LICENCE: "DRIVING_LICENCE",
  NATIONAL_ID: "NATIONAL_ID",
  RESIDENCE_PERMIT: "RESIDENCE_PERMIT",
  UTILITY_BILL: "UTILITY_BILL",
  BANK_STATEMENT: "BANK_STATEMENT",
  GOVERNMENT_ADDRESS_DOC: "GOVERNMENT_ADDRESS_DOC",
  SELFIE: "SELFIE",
} as const;
export type KycDocumentType = (typeof KycDocumentType)[keyof typeof KycDocumentType];

export const KYC_LEVEL_NAMES: Record<KycLevel, string> = {
  [KycLevel.LEVEL_0]: "Unverified",
  [KycLevel.LEVEL_1]: "Basic Verification",
  [KycLevel.LEVEL_2]: "Identity Verification",
  [KycLevel.LEVEL_3]: "Address Verification",
};

export const KYC_LEVEL_PERMISSIONS: Record<KycLevel, string[]> = {
  [KycLevel.LEVEL_0]: ["Play Games", "Deposit", "Limited Wallet Access"],
  [KycLevel.LEVEL_1]: ["Deposit", "Small Withdrawals"],
  [KycLevel.LEVEL_2]: ["Unlimited Deposits", "Standard Withdrawals"],
  [KycLevel.LEVEL_3]: ["High Withdrawal Limits", "VIP Features", "Priority Support"],
};

export const COUNTRY_DOCUMENTS: Record<string, KycDocumentType[]> = {
  IN: [
    KycDocumentType.AADHAAR_CARD,
    KycDocumentType.PAN_CARD,
    KycDocumentType.PASSPORT,
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.VOTER_ID,
  ],
  US: [
    KycDocumentType.PASSPORT,
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.NATIONAL_ID,
  ],
  UK: [
    KycDocumentType.PASSPORT,
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.RESIDENCE_PERMIT,
  ],
  DEFAULT: [
    KycDocumentType.PASSPORT,
    KycDocumentType.NATIONAL_ID,
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.RESIDENCE_PERMIT,
  ],
};

export const DOCUMENTS_REQUIRING_BACK_SIDE: KycDocumentType[] = [
  KycDocumentType.DRIVING_LICENCE,
  KycDocumentType.NATIONAL_ID,
  KycDocumentType.RESIDENCE_PERMIT,
];

export const kycSubmitLevel1Schema = z.object({
  fullName: z.string().trim().min(2).max(100),
  dateOfBirth: z.string().datetime(),
  country: z.string().trim().length(2).toUpperCase(),
  mobileNumber: z.string().trim().min(10).max(15),
  streetAddress: z.string().trim().min(2).max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  postalCode: z.string().trim().min(2).max(20).optional(),
});

export const kycUploadDocumentSchema = z.object({
  requestId: z.string().cuid(),
  documentType: z.nativeEnum(KycDocumentType),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB max
  side: z.enum(["front", "back"]).optional(),
  isSelfie: z.boolean().optional(),
});

export const kycReviewSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT", "REQUEST_RESUBMISSION"]),
  notes: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().min(1).max(500).optional(),
});

export const kycDocumentReviewSchema = z.object({
  documentId: z.string().cuid(),
  action: z.enum(["VERIFY", "REJECT"]),
  notes: z.string().trim().max(500).optional(),
  rejectionReason: z.string().trim().min(1).max(300).optional(),
});

export const kycAdminOverrideSchema = z.object({
  requestId: z.string().cuid(),
  level: z.nativeEnum(KycLevel),
  reason: z.string().trim().min(10).max(500),
});

export const kycSetWithdrawalLimitsSchema = z.object({
  level: z.nativeEnum(KycLevel),
  dailyLimit: z.number().int().min(0),
  monthlyLimit: z.number().int().min(0),
  singleWithdrawLimit: z.number().int().min(0),
});

export const kycDocumentConfigSchema = z.object({
  country: z.string().trim().length(2).toUpperCase(),
  documentType: z.nativeEnum(KycDocumentType),
  isAccepted: z.boolean(),
  isRequired: z.boolean().optional(),
  requiresBack: z.boolean().optional(),
  hasExpiry: z.boolean().optional(),
  notes: z.string().trim().max(200).optional(),
});

export type KycRequestWithDocuments = {
  id: string;
  userId: string;
  level: KycLevel;
  status: KycStatus;
  country: string | null;
  fullName: string | null;
  dateOfBirth: Date | null;
  mobileNumber: string | null;
  streetAddress?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  adminOverride: boolean;
  adminOverrideBy: string | null;
  adminOverrideAt: Date | null;
  adminOverrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  documents: Array<{
    id: string;
    documentType: KycDocumentType;
    status: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    side: string | null;
    isSelfie: boolean;
    rejectionReason: string | null;
    createdAt: Date;
  }>;
};

export type KycWithdrawalLimits = {
  level: KycLevel;
  dailyLimit: number;
  monthlyLimit: number;
  singleWithdrawLimit: number;
};

export function getKycLevelFromDb(level: string): KycLevel {
  return Object.values(KycLevel).includes(level as KycLevel) 
    ? (level as KycLevel) 
    : KycLevel.LEVEL_0;
}
