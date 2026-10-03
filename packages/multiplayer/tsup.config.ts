import { defineConfig } from 'tsup';

// The runtime image ships the multiplayer artifact and DB client. Bundle
// shared definitions instead of leaving a link to absent TypeScript sources.
export default defineConfig({
  noExternal: ['@gaming-hub/shared'],
});
