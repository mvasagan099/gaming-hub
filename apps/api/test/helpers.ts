import { prisma, type Prisma } from "@gaming-hub/db";
import type { DbUserRole } from "@gaming-hub/shared";

export function testToken(userId: string): string {
  return `test.${userId}`;
}

export async function createTestUser(
  overrides: { id?: string; role?: DbUserRole; email?: string | null } = {},
): Promise<{
  id: string;
  token: string;
  role: DbUserRole;
}> {
  const id = overrides.id ?? crypto.randomUUID();
  const role = overrides.role ?? "USER";
  const email = overrides.email ?? `${id}@test.local`;

  const user = await prisma.user.upsert({
    where: { id },
    create: {
      id,
      email,
      username: `user_${id.replace(/-/g, "").slice(0, 20)}`,
      displayName: `User ${id.slice(0, 6)}`,
      role,
      profile: { create: {} },
      wallet: { create: {} },
    },
    update: { role },
  });

  return { id: user.id, token: testToken(id), role: user.role as DbUserRole };
}

export async function createTestCoupon(input: Partial<Prisma.CouponCreateInput> = {}) {
  const code = (input.code ?? `TEST${Math.floor(Math.random() * 1_000_000)}`).toUpperCase();
  return prisma.coupon.create({
    data: {
      code,
      title: "Test coupon",
      discountType: "FIXED",
      discountValue: 100,
      maxUses: 100,
      minWager: 0,
      validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() + 86_400_000),
      status: "ACTIVE",
      ...input,
    },
  });
}
