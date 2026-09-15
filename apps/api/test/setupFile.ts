import { afterEach, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { resetTestDatabase } from "./db";
import { resetSocketBridge } from "../src/services/socketBridge";
import { resetSettingsCache } from "../src/services/settings";

import { prisma as prodPrisma } from '@gaming-hub/db';
import { getTestPrisma } from './db';

// Supabase's Node adapter expects a global WebSocket implementation.
// The test runner uses Node, so provide the dependency already present in the workspace.
if (!globalThis.WebSocket) {
  (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

beforeEach(async () => {
  await resetTestDatabase();
  // Replace the shared prisma instance with test client
  Object.assign(prodPrisma, getTestPrisma());
  resetSocketBridge();
  resetSettingsCache();
});

afterEach(() => {
  resetSocketBridge();
});
