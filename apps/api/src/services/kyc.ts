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
import { FileUploadService } from "./fileUpload";

function calculateExpiryDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
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
  let request = await prisma.kycRequest.findUnique({
    where: { userId: data.userId },
  });

  if (request && request.status === KycStatus.APPROVED) {
    throw new Error("User already has an approved KYC request");
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
        status: KycStatus.NOT_STARTED,
      },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

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

  const uploaded = await FileUploadService.save(
    data.userId,
    data.fileBuffer,
    data.fileName,
    data.mimeType,
  );

  const docNumber = await prisma.kycDocument.count({
    where: { requestId: data.requestId, documentType: data.documentType },
  });

  const page = docNumber;

  const document = await prisma.kycDocument.create({
    data: {
      requestId: data.requestId,
      documentType: data.documentType,
      fileName: uploaded.fileName,
      fileUrl: uploaded.filePath,
      fileSize: uploaded.fileSize,
      mimeType: uploaded.mimeType,
      fileHash: uploaded.fileHash,
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
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
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

  const requiredDocs = await KycComplianceService.getRequiredDocuments(request.level as KycLevel, request.country ?? undefined);
  
  const uploadedTypes = new Set(request.documents.map((d) => d.documentType));
  const missing = requiredDocs.filter((t: KycDocumentType) => !uploadedTypes.has(t));

  const hasSelfie = request.documents.some((d) => d.isSelfie);
  if (!hasSelfie) {
    missing.push(KycDocumentType.PASSPORT);
  }

  if (missing.length > 0) {
    throw new Error(`Missing documents: ${missing.join(", ")}`);
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
      country: request.country ?? undefined,
      phone: request.mobileNumber ?? request.user.profile?.phone,
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
