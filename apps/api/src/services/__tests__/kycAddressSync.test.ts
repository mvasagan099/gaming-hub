import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { createKycRequest, approveKycRequest } from "../kyc";
import { getAuthenticatedUserData } from "../users";
import { KycLevel, KycStatus } from "@gaming-hub/shared";

describe("KYC Address Sync to Profile", () => {
  const testUserId = "test-kyc-address-user";

  beforeEach(async () => {
    await prisma.kycDocument.deleteMany({});
    await prisma.kycReview.deleteMany({});
    await prisma.kycAuditLog.deleteMany({});
    await prisma.kycRequest.deleteMany({ where: { userId: testUserId } });
    await prisma.profile.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });

    await prisma.user.create({
      data: {
        id: testUserId,
        username: "address_sync_tester",
        displayName: "Address Sync Tester",
        email: "address_tester@test.com",
        role: "USER",
        profile: {
          create: {
            country: "IN",
          },
        },
      },
    });
  });

  it("syncs address fields to Profile on createKycRequest", async () => {
    await createKycRequest({
      userId: testUserId,
      level: KycLevel.LEVEL_1,
      fullName: "Test Gamer",
      dateOfBirth: new Date("1998-05-15"),
      country: "IN",
      mobileNumber: "9876543210",
      streetAddress: "42 MG Road, Flat 3B",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    });

    const profile = await prisma.profile.findUnique({
      where: { userId: testUserId },
    });

    expect(profile?.streetAddress).toBe("42 MG Road, Flat 3B");
    expect(profile?.city).toBe("Bengaluru");
    expect(profile?.state).toBe("Karnataka");
    expect(profile?.postcode).toBe("560001");
    expect(profile?.phone).toBe("9876543210");
  });

  it("syncs address fields to Profile on approveKycRequest", async () => {
    const kyc = await prisma.kycRequest.create({
      data: {
        userId: testUserId,
        level: KycLevel.LEVEL_1,
        status: KycStatus.PENDING,
        fullName: "Approved Gamer",
        dateOfBirth: new Date("1995-10-20"),
        country: "IN",
        mobileNumber: "9988776655",
        streetAddress: "100 Anna Salai",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600002",
      },
    });

    await approveKycRequest(kyc.id, testUserId, "Auto test approve");

    const profile = await prisma.profile.findUnique({
      where: { userId: testUserId },
    });

    expect(profile?.kycStatus).toBe("approved");
    expect(profile?.streetAddress).toBe("100 Anna Salai");
    expect(profile?.city).toBe("Chennai");
    expect(profile?.state).toBe("Tamil Nadu");
    expect(profile?.postcode).toBe("600002");
    expect(profile?.phone).toBe("9988776655");
  });

  it("falls back to KYC address and auto-syncs profile in getAuthenticatedUserData", async () => {
    // Simulate pre-existing approved KYC where profile address was left blank
    await prisma.kycRequest.create({
      data: {
        userId: testUserId,
        level: KycLevel.LEVEL_2,
        status: KycStatus.APPROVED,
        fullName: "Existing Approved User",
        dateOfBirth: new Date("1992-01-01"),
        country: "IN",
        mobileNumber: "9123456780",
        streetAddress: "77 Brigade Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560025",
      },
    });

    // Ensure profile address is empty
    await prisma.profile.update({
      where: { userId: testUserId },
      data: {
        streetAddress: null,
        city: null,
        state: null,
        postcode: null,
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUserId } });
    const meData = await getAuthenticatedUserData(user);

    expect(meData.profile?.streetAddress).toBe("77 Brigade Road");
    expect(meData.profile?.city).toBe("Bengaluru");
    expect(meData.profile?.state).toBe("Karnataka");
    expect(meData.profile?.postcode).toBe("560025");

    // Verify auto-backfilled in DB
    const dbProfile = await prisma.profile.findUnique({ where: { userId: testUserId } });
    expect(dbProfile?.streetAddress).toBe("77 Brigade Road");
    expect(dbProfile?.city).toBe("Bengaluru");
  });
});
