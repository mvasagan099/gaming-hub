# Socket server startup recovery

The reported `pino-pretty` error was reproduced in the release image by
overriding `NODE_ENV` to `development`. The logger's development transport is
intentionally absent after production dependency pruning. The stack location
matches the current compiled logger. With `NODE_ENV=production`, it uses JSON
logs and does not require that transport.

Release Docker startup now explicitly sets production mode and uses `exec`
so Node remains PID 1 and receives shutdown signals. This is also applied to
the API and generic release images. Local development commands are unchanged.
The missing development dependency is not added to the release image.

## Render settings for the affected service

1. Set `NODE_ENV` to `production`. Check any attached environment group too.
2. Use `Dockerfile.socket` for the socket service.
3. Leave the Docker Command override empty to use the verified image command.
   If an override is necessary, use:

   ```sh
   NODE_ENV=production exec node apps/socket-server/dist/index.js
   ```

4. Use the staging-only configuration and deploy the reviewed commit to
   staging. Verify `/health/live` and `/health/ready` respond successfully and
   startup logs are JSON.

Do not set the API service to the socket command. Production mode may reveal
an invalid CORS origin or a weak/missing configured key; correct the settings
instead of switching back to development mode. No hosting configuration or
production database was changed by this repository fix.

## Current verification

- Original image: exact reported stack reproduced with `NODE_ENV=development`.
- Corrected socket image: local Docker build PASS.
- Same development override: actual Node process runs as production, framework
  initializes, JSON startup logs appear and `/health/ready` returns HTTP 200.
- `pino-pretty` remains absent from the runtime dependency tree.
- Wildcard CORS with the override: startup rejected by production validation.
- Socket workspace typecheck: PASS.
- Multiplayer regressions: 89/89 PASS, 9 files, 0 failures.

The regression uses dummy credentials and the disposable localhost audit
database only. Evidence is in
[verification.json](security-reports/2026-10-03-socket-startup-fix/verification.json).
No live hosting setting was changed and no deployment was performed.
