import type { FastifyInstance } from "fastify";
import { KycLevel, KycDocumentType, AppError, kycSubmitLevel1Schema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema } from "../lib/http";
import KycService from "../services/kyc";
import { FileUploadService } from "../services/fileUpload";

export async function kycRoutes(app: FastifyInstance) {
  app.get("/api/kyc/status", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
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

  app.post("/api/kyc/initiate", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(kycSubmitLevel1Schema, request.body);

    const kycRequest = await KycService.create({
      userId: user.id,
      level: KycLevel.LEVEL_1,
      fullName: data.fullName,
      dateOfBirth: new Date(data.dateOfBirth),
      country: data.country,
      mobileNumber: data.mobileNumber,
    });

    return {
      ok: true,
      requestId: kycRequest.id,
      status: kycRequest.status,
    };
  });

  app.post("/api/kyc/request-level", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
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

  app.post("/api/kyc/upload", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = await request.file();

    if (!data) {
      throw new AppError("VALIDATION_ERROR", "No file uploaded", 400);
    }

    const fields = data.fields;
    const requestId = fields.requestId?.value as string;
    const documentType = fields.documentType?.value as KycDocumentType;
    const side = (fields.side?.value as "front" | "back") ?? undefined;
    const isSelfie = fields.isSelfie?.value === "true";

    if (!requestId || !documentType) {
      throw new AppError("VALIDATION_ERROR", "Missing required fields", 400);
    }

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype;
    const filename = data.filename;

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
  });

  app.delete("/api/kyc/document/:documentId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const params = request.params as { documentId: string };
    const body = request.body as { requestId: string };

    await KycService.deleteDocument(body.requestId, params.documentId, user.id);

    return { ok: true };
  });

  app.post("/api/kyc/submit", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const body = request.body as { requestId: string };

    const kycRequest = await KycService.submit(body.requestId, user.id);

    return {
      ok: true,
      status: kycRequest.status,
      message: "KYC request submitted for review",
    };
  });

  app.get("/api/kyc/limits", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);

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
