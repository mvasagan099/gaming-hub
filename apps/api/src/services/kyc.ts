import { prisma } from "@gaming-hub/db";
import {
  KycLevel,
  KycStatus,
  KycDocumentType,
  type KycRequestWithDocuments,
  DOCUMENTS_REQUIRING_BACK_SIDE,
  COUNTRY_DOCUMENTS,
  AppError,
} from "@gaming-hub/shared";
import { FileUploadService, validateFile } from "./fileUpload";
import { SupabaseStorageService } from "./supabaseStorage";

function calculateExpiryDate(): Date | null {
  return null;
}

export const KycComplianceService = {
  async getRequiredDocuments(level: KycLevel, country?: string): Promise<KycDocumentType[]> {
    if (level === KycLevel.LEVEL_0) {
      return [];
    }

    if (level === KycLevel.LEVEL_1) {
      return [];
    }

    const countryDocs = country && COUNTRY_DOCUMENTS[country]
      ? COUNTRY_DOCUMENTS[country]
      : COUNTRY_DOCUMENTS.DEFAULT;

    if (level === KycLevel.LEVEL_2) {
      return countryDocs.slice(0, 2);
    }

    if (level === KycLevel.LEVEL_3) {
      const docs = [...countryDocs];
      if (!docs.includes(KycDocumentType.UTILITY_BILL)) {
        docs.push(KycDocumentType.UTILITY_BILL);
      }
      return docs;
    }

    return countryDocs;
  },

  async getDocumentConfig(country: string, documentType: KycDocumentType) {
    return prisma.kycDocumentConfig.findUnique({
      where: {
        country_documentType: {
          country,
          documentType,
        },
      },
    });
  },
};

export interface CreateKycRequestInput {
  userId: string;
  level: KycLevel;
  fullName: string;
  dateOfBirth: Date;
  country: string;
  mobileNumber: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface UploadDocumentInput {
  requestId: string;
  userId: string;
  documentType: KycDocumentType;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  side?: "front" | "back";
  isSelfie?: boolean;
}

export async function createKycRequest(data: CreateKycRequestInput): Promise<KycRequestWithDocuments> {
  const profile = await prisma.profile.findUnique({ where: { userId: data.userId }, select: { country: true } });
  if (profile?.country && data.country !== profile.country) {
    throw new AppError("VALIDATION_ERROR", "KYC country must match the country selected at registration", 400);
  }
  let request = await prisma.kycRequest.findUnique({
    where: { userId: data.userId },
  });

  if (request && request.status === KycStatus.APPROVED) {
    throw new AppError("VALIDATION_ERROR", "KYC verification is already completed for this account", 400);
  }

  if (request) {
    request = await prisma.kycRequest.update({
      where: { id: request.id },
      data: {
        level: data.level,
        country: data.country,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        mobileNumber: data.mobileNumber,
        streetAddress: data.streetAddress,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        status: KycStatus.NOT_STARTED,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
      },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  } else {
    request = await prisma.kycRequest.create({
      data: {
        userId: data.userId,
        level: data.level,
        country: data.country,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        mobileNumber: data.mobileNumber,
        streetAddress: data.streetAddress,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        status: KycStatus.NOT_STARTED,
      },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  // Pre-sync entered personal & address information to Profile
  await prisma.profile.update({
    where: { userId: data.userId },
    data: {
      phone: data.mobileNumber || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      streetAddress: data.streetAddress || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      postcode: data.postalCode || undefined,
    },
  }).catch(() => undefined);

  return request as KycRequestWithDocuments;
}

export async function uploadKycDocument(data: UploadDocumentInput) {
  const request = await prisma.kycRequest.findUnique({
    where: { id: data.requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.userId !== data.userId) {
    throw new Error("Unauthorized to upload documents for this request");
  }

  if (request.status === KycStatus.APPROVED) {
    throw new Error("Cannot upload documents to an approved KYC request");
  }

  let fileName = "";
  let fileUrl = "";
  let fileSize = data.fileBuffer.length;
  let mimeType = data.mimeType;
  let fileHash = "";

  // H-05 fix: run magic-byte + MIME + extension validation BEFORE uploading to
  // any storage backend. A failed validation throws and no upload occurs.
  const validation = await validateFile(data.fileBuffer, data.mimeType, data.fileName);
  if (!validation.valid) {
    throw new AppError("VALIDATION_ERROR", validation.error ?? "File validation failed", 400);
  }

  try {
    const supabaseRes = await SupabaseStorageService.upload(
      data.userId,
      data.fileBuffer,
      data.fileName,
      data.mimeType,
      data.side,
      data.isSelfie,
      data.documentType
    );
    fileName = supabaseRes.fileName;
    fileUrl = supabaseRes.filePath;
    fileSize = supabaseRes.fileSize;
  } catch (err) {
    // H-05 fix: Supabase upload failure is a real error; fall back to local
    // disk storage only as a last resort, and log the Supabase error clearly.
    console.error("[KYC] Supabase upload failed, falling back to local storage:", err);
    const uploaded = await FileUploadService.save(
      data.userId,
      data.fileBuffer,
      data.fileName,
      data.mimeType,
    );
    fileName = uploaded.fileName;
    fileUrl = uploaded.filePath;
    fileSize = uploaded.fileSize;
    fileHash = uploaded.fileHash;
  }

  await prisma.kycDocument.deleteMany({
    where: {
      requestId: data.requestId,
      documentType: data.documentType,
      side: data.side ?? null,
      isSelfie: data.isSelfie ?? false,
    },
  });

  const page = 0;

  const document = await prisma.kycDocument.create({
    data: {
      requestId: data.requestId,
      documentType: data.documentType,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      fileHash: fileHash || "",
      page,
      side: data.side,
      isSelfie: data.isSelfie ?? false,
    },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId: data.requestId,
      actorId: data.userId,
      action: "DOCUMENT_UPLOAD",
      category: "DOCUMENT_UPLOAD",
      targetType: "document",
      targetId: document.id,
      metadata: {
        documentType: data.documentType,
        fileName,
        fileSize,
      },
    },
  });

  return document;
}

export async function submitKycRequest(requestId: string, userId: string): Promise<KycRequestWithDocuments> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
    include: {
      documents: true,
    },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.userId !== userId) {
    throw new Error("Unauthorized");
  }

  if (request.status !== KycStatus.NOT_STARTED && request.status !== KycStatus.REQUIRES_RESUBMISSION) {
    throw new Error("Cannot submit request in current status");
  }

  const hasIdentityDoc = request.documents.some(
    (d) => d.documentType !== KycDocumentType.SELFIE && !d.isSelfie
  );
  if (!hasIdentityDoc) {
    throw new AppError("VALIDATION_ERROR", "Please upload at least one valid identity document", 400);
  }

  const hasSelfie = request.documents.some((d) => d.isSelfie || d.documentType === KycDocumentType.SELFIE);
  if (!hasSelfie) {
    throw new AppError("VALIDATION_ERROR", "Live camera selfie is required before submitting verification", 400);
  }

  const updated = await prisma.kycRequest.update({
    where: { id: requestId },
    data: {
      status: KycStatus.PENDING,
      submittedAt: new Date(),
    },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId,
      actorId: userId,
      action: "KYC_SUBMITTED",
      category: "STATUS_CHANGE",
      metadata: { level: request.level, documentCount: request.documents.length },
    },
  });

  return updated as KycRequestWithDocuments;
}

export async function getKycRequestByUserId(userId: string): Promise<KycRequestWithDocuments | null> {
  const request = await prisma.kycRequest.findUnique({
    where: { userId },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!request) return null;

  return request as KycRequestWithDocuments;
}

export async function getKycRequestById(requestId: string): Promise<KycRequestWithDocuments | null> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!request) return null;

  return request as KycRequestWithDocuments;
}

export async function getUserWithdrawalLimits(userId: string): Promise<{
  level: KycLevel;
  dailyLimit: number;
  monthlyLimit: number;
  singleWithdrawLimit: number;
} | null> {
  const kycRequest = await prisma.kycRequest.findUnique({
    where: { userId },
    select: { level: true, status: true },
  });

  const level = kycRequest?.status === KycStatus.APPROVED 
    ? (kycRequest.level as KycLevel)
    : KycLevel.LEVEL_0;

  const limit = await prisma.kycWithdrawalLimit.findUnique({
    where: { level: level as any },
  });

  if (!limit) {
    return {
      level,
      dailyLimit: 0,
      monthlyLimit: 0,
      singleWithdrawLimit: 0,
    };
  }

  return {
    level: limit.level as KycLevel,
    dailyLimit: limit.dailyLimit,
    monthlyLimit: limit.monthlyLimit,
    singleWithdrawLimit: limit.singleWithdrawLimit,
  };
}

export async function listPendingKycRequests(page: number = 1, pageSize: number = 20) {
  const where = {
    status: { in: [KycStatus.PENDING, KycStatus.UNDER_REVIEW] },
  };

  const [items, total] = await Promise.all([
    prisma.kycRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }),
    prisma.kycRequest.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function listKycRequestsByStatus(
  status: KycStatus,
  page: number = 1,
  pageSize: number = 20,
) {
  const where = { status };

  const [items, total] = await Promise.all([
    prisma.kycRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.kycRequest.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function approveKycRequest(
  requestId: string,
  adminId: string,
  notes?: string,
): Promise<KycRequestWithDocuments> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
    include: { 
      documents: true,
      user: {
        include: { profile: true },
      },
    },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.status !== KycStatus.PENDING && request.status !== KycStatus.UNDER_REVIEW) {
    throw new Error("Request is not pending review");
  }

  await prisma.kycDocument.updateMany({
    where: { requestId },
    data: { status: "VERIFIED" },
  });

  const updated = await prisma.kycRequest.update({
    where: { id: requestId },
    data: {
      level: KycLevel.LEVEL_2,
      status: KycStatus.APPROVED,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      approvedAt: new Date(),
      expiresAt: calculateExpiryDate(),
    },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  await prisma.profile.update({
    where: { userId: request.userId },
    data: {
      kycStatus: "approved",
      phone: request.mobileNumber ?? request.user.profile?.phone,
      streetAddress: request.streetAddress ?? request.user.profile?.streetAddress,
      city: request.city ?? request.user.profile?.city,
      state: request.state ?? request.user.profile?.state,
      postcode: request.postalCode ?? request.user.profile?.postcode,
      dateOfBirth: request.dateOfBirth ?? request.user.profile?.dateOfBirth,
    },
  });

  await prisma.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: "APPROVED",
      notes,
    },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId,
      actorId: adminId,
      action: "KYC_APPROVED",
      category: "REVIEW",
      targetType: "request",
      targetId: requestId,
      metadata: { notes },
    },
  });

  return updated as KycRequestWithDocuments;
}

export async function rejectKycRequest(
  requestId: string,
  adminId: string,
  rejectionReason: string,
  requireResubmission: boolean = false,
): Promise<KycRequestWithDocuments> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.status !== KycStatus.PENDING && request.status !== KycStatus.UNDER_REVIEW) {
    throw new Error("Request is not pending review");
  }

  const newStatus = requireResubmission ? KycStatus.REQUIRES_RESUBMISSION : KycStatus.REJECTED;

  const updated = await prisma.kycRequest.update({
    where: { id: requestId },
    data: {
      status: newStatus,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      rejectionReason,
    },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  await prisma.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: requireResubmission ? "REQUEST_RESUBMISSION" : "REJECTED",
      notes: rejectionReason,
    },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId,
      actorId: adminId,
      action: requireResubmission ? "KYC_RESUBMISSION_REQUESTED" : "KYC_REJECTED",
      category: "REVIEW",
      targetType: "request",
      targetId: requestId,
      metadata: { rejectionReason },
    },
  });

  return updated as KycRequestWithDocuments;
}

export async function startReview(requestId: string, adminId: string): Promise<KycRequestWithDocuments> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.status !== KycStatus.PENDING) {
    throw new Error("Request is not pending");
  }

  return (await prisma.kycRequest.update({
    where: { id: requestId },
    data: {
      status: KycStatus.UNDER_REVIEW,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
    },
  })) as KycRequestWithDocuments;
}

export async function adminOverrideKycLevel(
  requestId: string,
  adminId: string,
  level: KycLevel,
  reason: string,
): Promise<KycRequestWithDocuments> {
  const request = await prisma.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  const updated = await prisma.kycRequest.update({
    where: { id: requestId },
    data: {
      level,
      status: KycStatus.APPROVED,
      adminOverride: true,
      adminOverrideBy: adminId,
      adminOverrideAt: new Date(),
      adminOverrideReason: reason,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      approvedAt: new Date(),
    },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  await prisma.profile.update({
    where: { userId: request.userId },
    data: {
      kycStatus: "approved",
      phone: request.mobileNumber ?? undefined,
      streetAddress: request.streetAddress ?? undefined,
      city: request.city ?? undefined,
      state: request.state ?? undefined,
      postcode: request.postalCode ?? undefined,
      dateOfBirth: request.dateOfBirth ?? undefined,
    },
  }).catch(() => undefined);

  await prisma.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: "ADMIN_OVERRIDE",
      notes: `Level overridden to ${level}. Reason: ${reason}`,
      metadata: { level, reason },
    },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId,
      actorId: adminId,
      action: "ADMIN_OVERRIDE",
      category: "ADMIN_OVERRIDE",
      targetType: "request",
      targetId: requestId,
      metadata: { level, reason },
    },
  });

  return updated as KycRequestWithDocuments;
}

export async function deleteKycDocument(requestId: string, documentId: string, userId: string): Promise<void> {
  const document = await prisma.kycDocument.findUnique({
    where: { id: documentId },
    include: { request: true },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  if (document.request.userId !== userId) {
    throw new Error("Unauthorized");
  }

  if (document.request.id !== requestId) {
    throw new Error("Document does not belong to this request");
  }

  if (document.request.status === KycStatus.APPROVED) {
    throw new Error("Cannot delete documents from an approved KYC request");
  }

  await FileUploadService.delete(document.fileUrl);

  await prisma.kycDocument.delete({
    where: { id: documentId },
  });

  await prisma.kycAuditLog.create({
    data: {
      requestId,
      actorId: userId,
      action: "DOCUMENT_DELETED",
      category: "DOCUMENT_UPLOAD",
      targetType: "document",
      targetId: documentId,
      metadata: { documentType: document.documentType },
    },
  });
}

export const KycService = {
  create: createKycRequest,
  uploadDocument: uploadKycDocument,
  submit: submitKycRequest,
  getByUserId: getKycRequestByUserId,
  getById: getKycRequestById,
  listPending: listPendingKycRequests,
  listByStatus: listKycRequestsByStatus,
  approve: approveKycRequest,
  reject: rejectKycRequest,
  startReview,
  adminOverride: adminOverrideKycLevel,
  deleteDocument: deleteKycDocument,
  getUserWithdrawalLimits,
};

export default KycService;
