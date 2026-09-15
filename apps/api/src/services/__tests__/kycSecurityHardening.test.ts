import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { validateFile, FileUploadService } from "../fileUpload";
import { uploadKycDocument } from "../kyc";
import { requirePermission } from "../../lib/permissions";
import { KycLevel, KycDocumentType, KycStatus } from "@gaming-hub/shared";
import type { FastifyRequest } from "fastify";

describe("Requirement 10: KYC Security Tests", () => {
  const userA = "test-kyc-user-a";
  const userB = "test-kyc-user-b";

  // Minimal valid 1x1 PNG
  const validPngBuffer = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
    "hex",
  );

  // Minimal valid 1x1 JPEG
  const validJpgBuffer = Buffer.from(
    "ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9",
    "hex",
  );

  let kycReqAId: string;
  let kycReqBId: string;

  beforeEach(async () => {
    // Setup users
    await prisma.user.upsert({
      where: { id: userA },
      update: { role: "USER" },
      create: {
        id: userA,
        username: "kyc_user_a",
        displayName: "KYC User A",
        email: "kyc_a@test.com",
        role: "USER",
      },
    });

    await prisma.user.upsert({
      where: { id: userB },
      update: { role: "USER" },
      create: {
        id: userB,
        username: "kyc_user_b",
        displayName: "KYC User B",
        email: "kyc_b@test.com",
        role: "USER",
      },
    });

    // Create KYC requests for A and B
    await prisma.kycDocument.deleteMany({});
    await prisma.kycRequest.deleteMany({ where: { userId: { in: [userA, userB] } } });

    const reqA = await prisma.kycRequest.create({
      data: {
        userId: userA,
        status: KycStatus.PENDING,
        level: KycLevel.LEVEL_2,
        fullName: "User A",
        country: "IN",
        mobileNumber: "+919999999991",
      },
    });
    kycReqAId = reqA.id;

    const reqB = await prisma.kycRequest.create({
      data: {
        userId: userB,
        status: KycStatus.PENDING,
        level: KycLevel.LEVEL_2,
        fullName: "User B",
        country: "IN",
        mobileNumber: "+919999999992",
      },
    });
    kycReqBId = reqB.id;
  });

  // 1. .exe renamed .jpg
  it("rejects Windows PE executable renamed to .jpg", async () => {
    // PE binary header 'MZ\x90\x00...'
    const exeBuffer = Buffer.from("4d5a90000300000004000000ffff0000b80000000000000040000000", "hex");
    const result = await validateFile(exeBuffer, "image/jpeg", "malware.jpg");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/File content could not be identified|does not match declared type/i);
  });

  // 2. HTML renamed .png
  it("rejects HTML markup renamed to .png", async () => {
    const htmlBuffer = Buffer.from("<!DOCTYPE html><html><head></head><body><h1>Phishing</h1></body></html>");
    const result = await validateFile(htmlBuffer, "image/png", "page.png");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/File content could not be identified|does not match declared type/i);
  });

  // 3. SVG script payload
  it("rejects SVG with embedded XSS script payload", async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>');
    // Declared as image/jpeg or image/png
    const result = await validateFile(svgBuffer, "image/png", "vector.png");
    expect(result.valid).toBe(false);
  });

  // 4. Wrong magic bytes
  it("rejects random bytes claiming to be an image", async () => {
    const randomBytes = Buffer.from("deadbeefcafebabef00dcafe", "hex");
    const result = await validateFile(randomBytes, "image/jpeg", "random.jpg");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/File content could not be identified/i);
  });

  // 5. Oversized file (> 2MB)
  it("rejects oversized file exceeding 2MB limit", async () => {
    // 2.5 MB buffer starting with PNG magic bytes
    const oversized = Buffer.alloc(2.5 * 1024 * 1024);
    validPngBuffer.copy(oversized, 0);
    const result = await validateFile(oversized, "image/png", "large.png");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/File too large/i);
  });

  // 6. Valid file
  it("accepts authentic JPEG and PNG files with matching magic bytes", async () => {
    const pngResult = await validateFile(validPngBuffer, "image/png", "identity.png");
    expect(pngResult.valid).toBe(true);

    const jpgResult = await validateFile(validJpgBuffer, "image/jpeg", "passport.jpg");
    expect(jpgResult.valid).toBe(true);
  });

  // 7. User A requesting / uploading for User B's KYC request
  it("rejects User A attempting to upload documents to User B's KYC request (IDOR)", async () => {
    await expect(
      uploadKycDocument({
        requestId: kycReqBId, // User B's request
        userId: userA,        // User A's identity
        documentType: KycDocumentType.PASSPORT,
        fileBuffer: validJpgBuffer,
        fileName: "passport.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("Unauthorized to upload documents for this request");
  });

  // 8. Normal user calling admin KYC endpoint
  it("rejects normal user (role: USER) calling admin KYC endpoints with 403 Forbidden", async () => {
    const normalUserReq = {
      user: { id: userA, role: "USER" },
    } as unknown as FastifyRequest;

    await expect(
      requirePermission(normalUserReq, "admin:kyc:view", prisma),
    ).rejects.toThrow(/You do not have permission|FORBIDDEN/i);
  });
});
