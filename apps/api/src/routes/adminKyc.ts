import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import {
  KycLevel,
  KycStatus,
  KycDocumentType,
  kycReviewSchema,
  kycAdminOverrideSchema,
  kycSetWithdrawalLimitsSchema,
  kycDocumentConfigSchema,
  AppError,
} from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import KycService from "../services/kyc";
import { FileUploadService } from "../services/fileUpload";
import { SupabaseStorageService } from "../services/supabaseStorage";
import { readFile } from "node:fs/promises";

export async function adminKycRoutes(app: FastifyInstance) {
  app.get("/api/admin/kyc/pending", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:view", prisma);
    const q = queryParams(request);
    const page = Number(queryString(q.page)) || 1;
    const pageSize = Number(queryString(q.pageSize)) || 20;

    const result = await KycService.listPending(page, pageSize);

    const items = await Promise.all(
      result.items.map(async (item) => {
        const documents = await Promise.all(
          item.documents.map(async (doc) => {
            const signedUrl = await SupabaseStorageService.getSignedUrl(doc.fileUrl);
            return {
              ...doc,
              fileUrl: signedUrl || `/api/admin/kyc/document/${doc.id}/view`,
              signedUrl: signedUrl || undefined,
            };
          })
        );
        return { ...item, documents };
      })
    );

    return { ...result, items };
  });

  app.get("/api/admin/kyc/status/:status", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:view", prisma);
    const params = request.params as { status: string };
    const q = queryParams(request);
    const page = Number(queryString(q.page)) || 1;
    const pageSize = Number(queryString(q.pageSize)) || 20;

    const status = params.status as KycStatus;
    if (!Object.values(KycStatus).includes(status)) {
      return { items: [], total: 0, page, pageSize };
    }

    const result = await KycService.listByStatus(status, page, pageSize);

    const items = await Promise.all(
      result.items.map(async (item) => {
        const documents = await Promise.all(
          item.documents.map(async (doc) => {
            const signedUrl = await SupabaseStorageService.getSignedUrl(doc.fileUrl);
            return {
              ...doc,
              fileUrl: signedUrl || `/api/admin/kyc/document/${doc.id}/view`,
              signedUrl: signedUrl || undefined,
            };
          })
        );
        return { ...item, documents };
      })
    );

    return { ...result, items };
  });

  app.get("/api/admin/kyc/request/:requestId", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:view", prisma);
    const params = request.params as { requestId: string };

    const kycRequest = await KycService.getById(params.requestId);

    if (!kycRequest) {
      return null;
    }

    const documentsWithSignedUrls = await Promise.all(
      kycRequest.documents.map(async (doc) => {
        const signedUrl = await SupabaseStorageService.getSignedUrl(doc.fileUrl);
        return {
          ...doc,
          fileUrl: signedUrl || `/api/admin/kyc/document/${doc.id}/view`,
          signedUrl,
        };
      })
    );

    return {
      id: kycRequest.id,
      userId: kycRequest.userId,
      level: kycRequest.level,
      status: kycRequest.status,
      country: kycRequest.country,
      fullName: kycRequest.fullName,
      dateOfBirth: kycRequest.dateOfBirth?.toISOString(),
      mobileNumber: kycRequest.mobileNumber,
      streetAddress: kycRequest.streetAddress,
      addressLine2: kycRequest.addressLine2,
      city: kycRequest.city,
      state: kycRequest.state,
      postalCode: kycRequest.postalCode,
      reviewedBy: kycRequest.reviewedBy,
      reviewedAt: kycRequest.reviewedAt?.toISOString(),
      rejectionReason: kycRequest.rejectionReason,
      submittedAt: kycRequest.submittedAt?.toISOString(),
      approvedAt: kycRequest.approvedAt?.toISOString(),
      expiresAt: kycRequest.expiresAt?.toISOString(),
      adminOverride: kycRequest.adminOverride,
      adminOverrideBy: kycRequest.adminOverrideBy,
      adminOverrideAt: kycRequest.adminOverrideAt?.toISOString(),
      createdAt: kycRequest.createdAt.toISOString(),
      documents: documentsWithSignedUrls,
    };
  });

  app.get("/api/admin/kyc/document/:documentId/view", { preHandler: authenticate }, async (request, reply) => {
    await requirePermission(request, "admin:kyc:view", prisma);
    const params = request.params as { documentId: string };

    const doc = await prisma.kycDocument.findUnique({
      where: { id: params.documentId },
    });

    if (!doc) {
      throw new AppError("NOT_FOUND", "Document not found", 404);
    }

    const signedUrl = await SupabaseStorageService.getSignedUrl(doc.fileUrl);
    if (signedUrl) {
      return reply.redirect(signedUrl);
    }

    const stats = FileUploadService.getStats(doc.fileUrl);
    if (stats.exists) {
      const buffer = await readFile(doc.fileUrl);
      reply.type(doc.mimeType);
      return reply.send(buffer);
    }

    throw new AppError("NOT_FOUND", "File not available", 404);
  });

  app.post("/api/admin/kyc/start-review/:requestId", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:review", prisma);
    const user = requireUser(request);
    const params = request.params as { requestId: string };

    const kycRequest = await KycService.startReview(params.requestId, user.id);

    return {
      ok: true,
      status: kycRequest.status,
      message: "Review started",
    };
  });

  app.post("/api/admin/kyc/review/:requestId", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:kyc:review", prisma);
    const user = requireUser(request);
    const params = request.params as { requestId: string };
    const rawBody = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const data = parseSchema(kycReviewSchema, { requestId: params.requestId, ...rawBody });

    if (data.action === "APPROVE") {
      const result = await KycService.approve(params.requestId, user.id, data.notes);
      return {
        ok: true,
        status: result.status,
        message: "KYC approved",
      };
    }

    if (data.action === "REJECT") {
      if (!data.rejectionReason) {
        return {
          ok: false,
          error: "Rejection reason is required",
        };
      }
      const result = await KycService.reject(params.requestId, user.id, data.rejectionReason, false);
      return {
        ok: true,
        status: result.status,
        message: "KYC rejected",
      };
    }

    if (data.action === "REQUEST_RESUBMISSION") {
      if (!data.rejectionReason) {
        return {
          ok: false,
          error: "Rejection reason is required",
        };
      }
      const result = await KycService.reject(params.requestId, user.id, data.rejectionReason, true);
      return {
        ok: true,
        status: result.status,
        message: "Resubmission requested",
      };
    }

    return { ok: false, error: "Invalid action" };
  });

  app.post("/api/admin/kyc/override/:requestId", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:kyc:override", prisma);
    const user = requireUser(request);
    const params = request.params as { requestId: string };
    const data = parseSchema(kycAdminOverrideSchema, request.body);

    const result = await KycService.adminOverride(
      params.requestId,
      user.id,
      data.level,
      data.reason,
    );

    return {
      ok: true,
      status: result.status,
      level: result.level,
      message: "KYC level overridden",
    };
  });

  app.get("/api/admin/kyc/limits", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:config", prisma);

    const limits = await prisma.kycWithdrawalLimit.findMany({
      orderBy: { level: "asc" },
    });

    return limits;
  });

  app.post("/api/admin/kyc/limits", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:config", prisma);
    const data = parseSchema(kycSetWithdrawalLimitsSchema, request.body);

    const limit = await prisma.kycWithdrawalLimit.upsert({
      where: { level: data.level },
      create: {
        level: data.level,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
        singleWithdrawLimit: data.singleWithdrawLimit,
      },
      update: {
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
        singleWithdrawLimit: data.singleWithdrawLimit,
      },
    });

    return { ok: true, limit };
  });

  app.get("/api/admin/kyc/document-configs", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:config", prisma);

    const configs = await prisma.kycDocumentConfig.findMany({
      orderBy: [{ country: "asc" }, { documentType: "asc" }],
    });

    return configs;
  });

  app.post("/api/admin/kyc/document-config", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:config", prisma);
    const data = parseSchema(kycDocumentConfigSchema, request.body);

    const config = await prisma.kycDocumentConfig.upsert({
      where: {
        country_documentType: {
          country: data.country,
          documentType: data.documentType,
        },
      },
      create: {
        country: data.country,
        documentType: data.documentType,
        isAccepted: data.isAccepted,
        isRequired: data.isRequired ?? false,
        requiresBack: data.requiresBack ?? false,
        hasExpiry: data.hasExpiry ?? true,
        notes: data.notes,
      },
      update: {
        isAccepted: data.isAccepted,
        isRequired: data.isRequired ?? false,
        requiresBack: data.requiresBack ?? false,
        hasExpiry: data.hasExpiry ?? true,
        notes: data.notes,
      },
    });

    return { ok: true, config };
  });

  app.get("/api/admin/kyc/analytics", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:kyc:view", prisma);

    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      requestsByLevel,
      requestsByCountry,
    ] = await Promise.all([
      prisma.kycRequest.count(),
      prisma.kycRequest.count({ where: { status: KycStatus.PENDING } }),
      prisma.kycRequest.count({ where: { status: KycStatus.APPROVED } }),
      prisma.kycRequest.count({ where: { status: KycStatus.REJECTED } }),
      prisma.kycRequest.groupBy({
        by: ["level" ],
        _count: { id: true },
      }),
      prisma.kycRequest.groupBy({
        by: ["country"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      requestsByLevel: requestsByLevel.map((r) => ({
        level: r.level,
        count: r._count.id,
      })),
      requestsByCountry: requestsByCountry.map((r) => ({
        country: r.country,
        count: r._count.id,
      })),
    };
  });
}
