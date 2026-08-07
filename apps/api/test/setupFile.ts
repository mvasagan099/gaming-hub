import { afterEach, beforeEach } from "vitest";
import { resetTestDatabase } from "./db";
import { resetSocketBridge } from "../src/services/socketBridge";
import { resetSettingsCache } from "../src/services/settings";

beforeEach(async () => {
  await resetTestDatabase();
  resetSocketBridge();
  resetSettingsCache();
});

afterEach(() => {
  resetSocketBridge();
});
