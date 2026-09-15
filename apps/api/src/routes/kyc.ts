import type { FastifyInstance } from "fastify";
import type { Multipart } from "@fastify/multipart";
import { KycLevel, KycDocumentType, AppError, kycSubmitLevel1Schema } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import { assertFeatureEnabled } from "../services/featureFlags";
import KycService from "../services/kyc";
import { FileUploadService } from "../services/fileUpload";
import multipart from "@fastify/multipart";

function getFieldStringValue(field: Multipart | Multipart[] | undefined): string | undefined {
  if (!field) return undefined;
  if (Array.isArray(field)) {
    return field[0] && 'value' in field[0] ? field[0].value as string : undefined;
  }
  return 'value' in field ? field.value as string : undefined;
}

export async function kycRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 1024 * 1024,
      fields: 10,
      fileSize: 10 * 1024 * 1024,
      files: 5,
      headerPairs: 2000,
    },
  });

  app.get("/api/kyc/status", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    const kycRequest = await KycService.getByUserId(user.id);

    if (!kycRequest) {
      return {
        status: "NOT_STARTED",
        level: KycLevel.LEVEL_0,
        request: null,
      };
    }

    return {
      status: kycRequest.status,
      level: kycRequest.level,
      request: {
        id: kycRequest.id,
        country: kycRequest.country,
        fullName: kycRequest.fullName,
        dateOfBirth: kycRequest.dateOfBirth?.toISOString(),
        mobileNumber: kycRequest.mobileNumber,
        reviewedAt: kycRequest.reviewedAt?.toISOString(),
        rejectionReason: kycRequest.rejectionReason,
        submittedAt: kycRequest.submittedAt?.toISOString(),
        approvedAt: kycRequest.approvedAt?.toISOString(),
        expiresAt: kycRequest.expiresAt?.toISOString(),
        documents: kycRequest.documents.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          status: d.status,
          fileName: d.fileName,
          side: d.side,
          isSelfie: d.isSelfie,
          rejectionReason: d.rejectionReason,
        })),
      },
    };
  });

  app.post("/api/kyc/initiate", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    const data = parseSchema(kycSubmitLevel1Schema, request.body);

    const kycRequest = await KycService.create({
      userId: user.id,
      level: KycLevel.LEVEL_2,
      fullName: data.fullName,
      dateOfBirth: new Date(data.dateOfBirth),
      country: data.country,
      mobileNumber: data.mobileNumber,
      streetAddress: data.streetAddress,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
    });

    return {
      ok: true,
      requestId: kycRequest.id,
      status: kycRequest.status,
    };
  });

  app.post("/api/kyc/request-level", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    const body = request.body as { level: string };
    const level = body.level as KycLevel;

    if (!Object.values(KycLevel).includes(level)) {
      throw new AppError("VALIDATION_ERROR", "Invalid KYC level", 400);
    }

    const existingRequest = await KycService.getByUserId(user.id);
    if (existingRequest) {
      throw new AppError("VALIDATION_ERROR", "KYC request already exists", 400);
    }

    const kycRequest = await KycService.create({
      userId: user.id,
      level,
      fullName: "",
      dateOfBirth: new Date(),
      country: "",
      mobileNumber: "",
    });

    return {
      ok: true,
      requestId: kycRequest.id,
      level: kycRequest.level,
      status: kycRequest.status,
    };
  });

  app.post("/api/kyc/upload", { preHandler: [authenticate, requireMfa] }, async (request, reply) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    
    const data = await request.file();
    
    if (!data) {
      throw new AppError("VALIDATION_ERROR", "No file uploaded", 400);
    }

    const requestId = getFieldStringValue(data.fields.requestId);
    let documentType = getFieldStringValue(data.fields.documentType) as KycDocumentType;
    const side = getFieldStringValue(data.fields.side) as "front" | "back" | undefined;
    const isSelfieValue = getFieldStringValue(data.fields.isSelfie);
    const isSelfie = isSelfieValue === "true";

    if (isSelfie && !documentType) {
      documentType = KycDocumentType.SELFIE;
    }

    if (!requestId || !documentType) {
      throw new AppError("VALIDATION_ERROR", "Missing required fields", 400);
    }

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype;
    const filename = data.filename;

    try {
      const document = await KycService.uploadDocument({
        requestId,
        userId: user.id,
        documentType: documentType as KycDocumentType,
        fileBuffer: buffer,
        fileName: filename,
        mimeType,
        side,
        isSelfie,
      });

      return {
        ok: true,
        documentId: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        fileSize: document.fileSize,
      };
    } catch (err) {
      console.error("KYC Upload Error:", err);
      throw new AppError(
        "VALIDATION_ERROR",
        err instanceof Error ? err.message : "Failed to upload document",
        400
      );
    }
  });

  app.delete("/api/kyc/document/:documentId", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    const params = request.params as { documentId: string };
    const body = request.body as { requestId: string };

    await KycService.deleteDocument(body.requestId, params.documentId, user.id);

    return { ok: true };
  });

  app.post("/api/kyc/submit", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");
    const body = request.body as { requestId: string };

    try {
      const kycRequest = await KycService.submit(body.requestId, user.id);

      return {
        ok: true,
        status: kycRequest.status,
        message: "KYC request submitted for review",
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        "VALIDATION_ERROR",
        err instanceof Error ? err.message : "Failed to submit KYC request",
        400
      );
    }
  });

  app.get("/api/kyc/limits", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.kyc", "KYC verification");

    const limits = await KycService.getUserWithdrawalLimits(user.id);

    if (!limits) {
      return {
        level: KycLevel.LEVEL_0,
        limits: {
          dailyLimit: 0,
          monthlyLimit: 0,
          singleWithdrawLimit: 0,
        },
      };
    }

    return {
      level: limits.level,
      limits: {
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
        singleWithdrawLimit: limits.singleWithdrawLimit,
      },
    };
  });
}
