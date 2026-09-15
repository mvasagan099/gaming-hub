import { test, expect, beforeAll, afterAll } from 'vitest';
import { createTestUser } from './helpers';
import fastify from 'fastify';
import { walletRoutes } from '../src/routes/wallet';
import { prisma } from '@gaming-hub/db';

let app: ReturnType<typeof fastify>;
let userA: { id: string; token: string };
let userB: { id: string; token: string };
let requestId: string;

beforeAll(async () => {
  app = fastify();
  await walletRoutes(app);
  const uA = await createTestUser();
  const uB = await createTestUser();
  userA = { id: uA.id, token: uA.token };
  userB = { id: uB.id, token: uB.token };

  // create a wallet request for userA via service
  const { createDepositRequest } = await import('../src/services/walletRequests');
  const deposit = await createDepositRequest(userA.id, 100, undefined);
  requestId = deposit.id;
});

afterAll(async () => {
  await prisma.walletRequest.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await app.close();
});

test('reconcile endpoint should reject cross‑user request', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/wallet/reconcile/${requestId}`,
    headers: { authorization: `Bearer ${userB.token}` },
  });
  expect(res.statusCode).toBe(404);
});
