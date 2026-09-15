import { afterEach, beforeEach } from "vitest";
import { resetTestDatabase } from "./db";
import { resetSocketBridge } from "../src/services/socketBridge";
import { resetSettingsCache } from "../src/services/settings";

import { prisma as prodPrisma } from '@gaming-hub/db';
import { getTestPrisma } from './db';

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
