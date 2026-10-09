import { prisma, type Prisma, type KycDocument } from "@gaming-hub/db";
import { createHash, randomUUID } from "node:crypto";
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

async function lockRequest(tx: Prisma.TransactionClient, requestId: string) {
  await tx.$queryRaw`SELECT "id" FROM "KycRequest" WHERE "id" = ${requestId} FOR UPDATE`;
  const request = await tx.kycRequest.findUnique({ where: { id: requestId }, select: { userId: true } });
  if (request) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${request.userId} FOR UPDATE`;
    if ((await tx.user.findUniqueOrThrow({ where: { id: request.userId } })).deletedAt) throw new AppError('NOT_FOUND', 'Account is deleted', 404);
  }
}
function assertEditable(status: string) {
  if (!(['NOT_STARTED', 'REQUIRES_RESUBMISSION', 'REJECTED', 'EXPIRED'] as string[]).includes(status)) {
    throw new AppError('INVALID_ACTION', 'Submitted KYC records are locked; request resubmission before editing', 409);
  }
}
function documentDigest(request: { fullName: string | null; country: string | null; mobileNumber: string | null; dateOfBirth: Date | null; streetAddress: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; level: string; documents: KycDocument[] }) {
  return createHash('sha256').update(JSON.stringify({
    fullName: request.fullName, country: request.country, mobileNumber: request.mobileNumber, dateOfBirth: request.dateOfBirth,
    streetAddress: request.streetAddress, addressLine2: request.addressLine2, city: request.city, state: request.state, postalCode: request.postalCode, level: request.level,
    documents: request.documents.map(d => ({ id: d.id, type: d.documentType, side: d.side, isSelfie: d.isSelfie,
      path: d.fileUrl, hash: d.fileHash, size: d.fileSize, mime: d.mimeType, documentNumber: d.documentNumber,
      issueDate: d.issueDate, expiryDate: d.expiryDate, issuingCountry: d.issuingCountry })).sort((a,b) => a.id.localeCompare(b.id)),
  })).digest('hex');
}
async function validateDocumentSet(tx: Prisma.TransactionClient, request: { country: string | null; documents: KycDocument[] }) {
  const configs = await tx.kycDocumentConfig.findMany({ where: { country: request.country ?? '' } });
  const identityTypes = COUNTRY_DOCUMENTS[request.country ?? ''] ?? COUNTRY_DOCUMENTS.DEFAULT;
  if (!request.documents.some(d => identityTypes.includes(d.documentType as KycDocumentType) && !d.isSelfie)) throw new AppError('VALIDATION_ERROR', 'An accepted identity document is required', 400);
  if (!request.documents.some(d => d.documentType === 'SELFIE' && d.isSelfie && d.mimeType.startsWith('image/'))) throw new AppError('VALIDATION_ERROR', 'An image selfie is required', 400);
  for (const config of configs) {
    if (config.isRequired && !request.documents.some(d => d.documentType === config.documentType)) throw new AppError('VALIDATION_ERROR', `Required document missing: ${config.documentType}`, 400);
  }
  for (const d of request.documents) {
    const config = configs.find(c => c.documentType === d.documentType);
    if (config?.isAccepted === false || d.isSelfie !== (d.documentType === 'SELFIE') || !d.fileHash || d.fileSize <= 0 || d.status === 'REJECTED' || d.status === 'EXPIRED') throw new AppError('VALIDATION_ERROR', 'Document metadata is invalid or rejected', 400);
    if ((config?.requiresBack || DOCUMENTS_REQUIRING_BACK_SIDE.includes(d.documentType as KycDocumentType)) &&
      (!request.documents.some(other => other.documentType === d.documentType && other.side === 'front') ||
       !request.documents.some(other => other.documentType === d.documentType && other.side === 'back'))) throw new AppError('VALIDATION_ERROR', `Front and back required: ${d.documentType}`, 400);
  }
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
    const existingRequestId = request.id;
    request = await prisma.$transaction(async tx => {
      await lockRequest(tx, existingRequestId);
      const current = await tx.kycRequest.findUniqueOrThrow({ where: { id: existingRequestId } });
      assertEditable(current.status);
      return tx.kycRequest.update({
      where: { id: existingRequestId },
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
  await prisma.profile.updateMany({
    where: { userId: data.userId, user: { deletedAt: null } },
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

  assertEditable(request.status);
  if (!Object.values(KycDocumentType).includes(data.documentType) || (data.side !== undefined && !['front', 'back'].includes(data.side)) ||
      (data.isSelfie ?? false) !== (data.documentType === KycDocumentType.SELFIE) || (data.isSelfie && !data.mimeType.startsWith('image/'))) throw new AppError('VALIDATION_ERROR', 'Invalid document type, side or selfie metadata', 400);

  let fileName = "";
  let fileUrl = "";
  let fileSize = data.fileBuffer.length;
  let mimeType = data.mimeType;
  let fileHash = createHash('sha256').update(data.fileBuffer).digest('hex');

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

  try { return await prisma.$transaction(async tx => {
  await lockRequest(tx, data.requestId);
  const current = await tx.kycRequest.findUniqueOrThrow({ where: { id: data.requestId } });
  assertEditable(current.status);
  if (current.userId !== data.userId || current.updatedAt.getTime() !== request.updatedAt.getTime()) throw new AppError('INVALID_ACTION', 'KYC revision changed during upload; retry after reviewing current status', 409);
  const replaced = await tx.kycDocument.findMany({ where: { requestId: data.requestId, documentType: data.documentType, side: data.side ?? null, isSelfie: data.isSelfie ?? false } });
  if (replaced.length) await tx.kycAuditLog.create({ data: { requestId: data.requestId, actorId: data.userId, action: 'DOCUMENT_REPLACED', category: 'DOCUMENT_UPLOAD', metadata: { retainedDocuments: replaced.map(d => ({ id: d.id, path: d.fileUrl, hash: d.fileHash })) } } });
  await tx.kycDocument.deleteMany({
    where: {
      requestId: data.requestId,
      documentType: data.documentType,
      side: data.side ?? null,
      isSelfie: data.isSelfie ?? false,
    },
  });

  const page = 0;

  const document = await tx.kycDocument.create({
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

  await tx.kycRequest.update({ where: { id: data.requestId }, data: { updatedAt: new Date() } });
  await tx.kycAuditLog.create({
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
  }); } catch (error) {
    // Preserve the unattached immutable object's identity for controlled retention/cleanup.
    await prisma.kycAuditLog.create({ data: { requestId: data.requestId, actorId: data.userId, action: 'DOCUMENT_UPLOAD_NOT_ATTACHED', category: 'DOCUMENT_UPLOAD', metadata: { retainedPath: fileUrl, hash: fileHash } } });
    throw error;
  }
}

export async function submitKycRequest(requestId: string, userId: string): Promise<KycRequestWithDocuments> {
  return prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const request = await tx.kycRequest.findUnique({
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

  await validateDocumentSet(tx, request);

  const updated = await tx.kycRequest.update({
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

  await tx.kycAuditLog.create({
    data: {
      requestId,
      actorId: userId,
      action: "KYC_SUBMITTED",
      category: "STATUS_CHANGE",
      metadata: { revisionId: randomUUID(), documentDigest: documentDigest(request), documents: request.documents.map(d => ({ id: d.id, path: d.fileUrl, hash: d.fileHash })), level: request.level, documentCount: request.documents.length },
    },
  });

  return updated as KycRequestWithDocuments;
  });
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
  return prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const request = await tx.kycRequest.findUnique({
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

  await validateDocumentSet(tx, request);
  const submitted = await tx.kycAuditLog.findFirst({ where: { requestId, action: 'KYC_SUBMITTED' }, orderBy: { createdAt: 'desc' } });
  if ((submitted?.metadata as { documentDigest?: string } | null)?.documentDigest !== documentDigest(request)) throw new AppError('VALIDATION_ERROR', 'Submitted document revision is missing or changed; request resubmission', 400);
  await tx.kycDocument.updateMany({
    where: { requestId },
    data: { status: "VERIFIED", verifiedBy: adminId, verifiedAt: new Date() },
  });

  const updated = await tx.kycRequest.update({
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

  await tx.profile.update({
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

  await tx.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: "APPROVED",
      notes,
    },
  });

  await tx.kycAuditLog.create({
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
  });
}

export async function rejectKycRequest(
  requestId: string,
  adminId: string,
  rejectionReason: string,
  requireResubmission: boolean = false,
): Promise<KycRequestWithDocuments> {
  return prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const request = await tx.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.status !== KycStatus.PENDING && request.status !== KycStatus.UNDER_REVIEW) {
    throw new Error("Request is not pending review");
  }

  const newStatus = requireResubmission ? KycStatus.REQUIRES_RESUBMISSION : KycStatus.REJECTED;

  const updated = await tx.kycRequest.update({
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

  await tx.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: requireResubmission ? "REQUEST_RESUBMISSION" : "REJECTED",
      notes: rejectionReason,
    },
  });

  await tx.kycAuditLog.create({
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
  });
}

export async function startReview(requestId: string, adminId: string): Promise<KycRequestWithDocuments> {
  return prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const request = await tx.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  if (request.status !== KycStatus.PENDING) {
    throw new Error("Request is not pending");
  }

  return (await tx.kycRequest.update({
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
  });
}

export async function adminOverrideKycLevel(
  requestId: string,
  adminId: string,
  level: KycLevel,
  reason: string,
): Promise<KycRequestWithDocuments> {
  return prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const request = await tx.kycRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("KYC request not found");
  }

  const updated = await tx.kycRequest.update({
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

  await tx.profile.update({
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
  });

  await tx.kycReview.create({
    data: {
      requestId,
      reviewerId: adminId,
      action: "ADMIN_OVERRIDE",
      notes: `Level overridden to ${level}. Reason: ${reason}`,
      metadata: { level, reason },
    },
  });

  await tx.kycAuditLog.create({
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
  });
}

export async function deleteKycDocument(requestId: string, documentId: string, userId: string): Promise<void> {
  await prisma.$transaction(async tx => {
  await lockRequest(tx, requestId);
  const document = await tx.kycDocument.findUnique({
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

  assertEditable(document.request.status);
  // Retain the path in the compliance audit instead of irreversibly losing it.
  await tx.kycAuditLog.create({ data: { requestId, actorId: userId, action: 'DOCUMENT_RETIRED', category: 'DOCUMENT_UPLOAD', metadata: { retainedPath: document.fileUrl, hash: document.fileHash } } });
  await tx.kycDocument.delete({
    where: { id: documentId },
  });

  await tx.kycRequest.update({ where: { id: requestId }, data: { updatedAt: new Date() } });
  await tx.kycAuditLog.create({
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
