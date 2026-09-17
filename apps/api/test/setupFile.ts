import { afterEach, beforeAll } from "vitest";
import { WebSocket } from "ws";
import { resetTestDatabase } from "./db";
import { resetSocketBridge } from "../src/services/socketBridge";
import { resetSettingsCache } from "../src/services/settings";


// Supabase's Node adapter expects a global WebSocket implementation.
// The test runner uses Node, so provide the dependency already present in the workspace.
if (!globalThis.WebSocket) {
  (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

// Each test file runs in its own isolated worker. Reset once before that file's
// suite hooks create fixtures; resetting before every test would delete data
// intentionally created by a suite-level beforeAll hook.
beforeAll(async () => {
  await resetTestDatabase();
  resetSocketBridge();
  resetSettingsCache();
});

afterEach(() => {
  resetSocketBridge();
});
