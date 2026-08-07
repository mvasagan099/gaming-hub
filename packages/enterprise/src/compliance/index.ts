import { prisma } from "@gaming-hub/db";
import {
  KycLevel,
  KycStatus,
  KycDocumentType,
  type KycWithdrawalLimits,
} from "@gaming-hub/shared";

export interface KycConfig {
  maxDocumentSizeMb: number;
  allowedMimeTypes: string[];
  expiryDays: number;
  defaultWithdrawalLimits: KycWithdrawalLimits[];
}

const DEFAULT_CONFIG: KycConfig = {
  maxDocumentSizeMb: 10,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  expiryDays: 365,
  defaultWithdrawalLimits: [
    { level: KycLevel.LEVEL_0, dailyLimit: 0, monthlyLimit: 0, singleWithdrawLimit: 0 },
    { level: KycLevel.LEVEL_1, dailyLimit: 10000, monthlyLimit: 50000, singleWithdrawLimit: 5000 },
    { level: KycLevel.LEVEL_2, dailyLimit: 100000, monthlyLimit: 500000, singleWithdrawLimit: 50000 },
    { level: KycLevel.LEVEL_3, dailyLimit: 1000000, monthlyLimit: 5000000, singleWithdrawLimit: 500000 },
  ],
};

let config = DEFAULT_CONFIG;

export function configureKycService(newConfig: Partial<KycConfig>): void {
  config = { ...DEFAULT_CONFIG, ...newConfig };
}

export function getKycConfig(): KycConfig {
  return config;
}

export async function initializeKycLimits(): Promise<void> {
  for (const limit of config.defaultWithdrawalLimits) {
    await prisma.kycWithdrawalLimit.upsert({
      where: { level: limit.level },
      create: {
        level: limit.level,
        dailyLimit: limit.dailyLimit,
        monthlyLimit: limit.monthlyLimit,
        singleWithdrawLimit: limit.singleWithdrawLimit,
      },
      update: {
        dailyLimit: limit.dailyLimit,
        monthlyLimit: limit.monthlyLimit,
        singleWithdrawLimit: limit.singleWithdrawLimit,
      },
    });
  }
}

export async function getUserKycLevel(userId: string): Promise<KycLevel> {
  const request = await prisma.kycRequest.findUnique({
    where: { userId },
    select: { level: true, status: true },
  });

  if (!request) return KycLevel.LEVEL_0;

  if (request.status === KycStatus.EXPIRED) {
    return KycLevel.LEVEL_0;
  }

  return request.status === KycStatus.APPROVED ? request.level : KycLevel.LEVEL_0;
}

export async function getUserWithdrawalLimits(userId: string): Promise<KycWithdrawalLimits | null> {
  const level = await getUserKycLevel(userId);

  const limit = await prisma.kycWithdrawalLimit.findUnique({
    where: { level },
  });

  if (!limit) return null;

  return {
    level: limit.level as KycLevel,
    dailyLimit: limit.dailyLimit,
    monthlyLimit: limit.singleWithdrawLimit,
    singleWithdrawLimit: limit.singleWithdrawLimit,
  };
}

export async function canWithdraw(userId: string, amountCents: number): Promise<{
  canWithdraw: boolean;
  reason?: string;
  limit?: KycWithdrawalLimits;
}> {
  const limits = await getUserWithdrawalLimits(userId);

  if (!limits) {
    return { canWithdraw: false, reason: "KYC limits not configured" };
  }

  if (limits.singleWithdrawLimit === 0) {
    return { canWithdraw: false, reason: "Withdrawals disabled for your KYC level", limit: limits };
  }

  if (amountCents > limits.singleWithdrawLimit) {
    return {
      canWithdraw: false,
      reason: `Amount exceeds single withdrawal limit of ${limits.singleWithdrawLimit / 100} cents`,
      limit: limits,
    };
  }

  return { canWithdraw: true, limit: limits };
}

export async function getRequiredDocumentsForLevel(
  level: KycLevel,
  country?: string,
): Promise<KycDocumentType[]> {
  if (level === KycLevel.LEVEL_0) return [];

  const docs: KycDocumentType[] = [];

  if (level >= KycLevel.LEVEL_2) {
    const countryKey = country?.toUpperCase() ?? "DEFAULT";
    const countryConfigs = await prisma.kycDocumentConfig.findMany({
      where: { country: countryKey, isAccepted: true },
    });

    if (countryConfigs.length > 0) {
      docs.push(...countryConfigs.map((c) => c.documentType as KycDocumentType));
    } else {
      docs.push(
        KycDocumentType.PASSPORT,
        KycDocumentType.DRIVING_LICENCE,
        KycDocumentType.NATIONAL_ID,
      );
    }
  }

  if (level >= KycLevel.LEVEL_3) {
    docs.push(KycDocumentType.UTILITY_BILL);
    docs.push(KycDocumentType.BANK_STATEMENT);
  }

  return [...new Set(docs)];
}

export function validateDocumentType(
  documentType: KycDocumentType,
  level: KycLevel,
): boolean {
  const identityDocs = [
    KycDocumentType.AADHAAR_CARD,
    KycDocumentType.PAN_CARD,
    KycDocumentType.VOTER_ID,
    KycDocumentType.PASSPORT,
    KycDocumentType.DRIVING_LICENCE,
    KycDocumentType.NATIONAL_ID,
    KycDocumentType.RESIDENCE_PERMIT,
  ];

  const addressDocs = [
    KycDocumentType.UTILITY_BILL,
    KycDocumentType.BANK_STATEMENT,
    KycDocumentType.GOVERNMENT_ADDRESS_DOC,
  ];

  if (level === KycLevel.LEVEL_2) {
    return identityDocs.includes(documentType);
  }

  if (level === KycLevel.LEVEL_3) {
    return addressDocs.includes(documentType);
  }

  return false;
}

export function calculateExpiryDate(): Date {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
}

export const KycComplianceService = {
  configure: configureKycService,
  getConfig: getKycConfig,
  initializeLimits: initializeKycLimits,
  getUserLevel: getUserKycLevel,
  getWithdrawalLimits: getUserWithdrawalLimits,
  canWithdraw,
  getRequiredDocuments: getRequiredDocumentsForLevel,
  validateDocumentType,
  calculateExpiry: calculateExpiryDate,
};

export default KycComplianceService;
