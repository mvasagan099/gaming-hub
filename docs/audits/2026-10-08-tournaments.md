# Tournament audit — 2026-10-08

## Repairs

- Exceptional tournament creation used a default capacity of 500 while the API rejected capacities above 128. API limits now match the existing creation interface (up to 10,000).
- An omitted registration deadline was submitted as an invalid empty datetime. The form now submits null, trims titles, prevents duplicate submissions, and displays failures inside the modal.
- Minimum players, registration dates, auto-start, and prize settings now persist in the same create/update operation. Responses include the actual saved values, and inconsistent player limits or dates are rejected before mutation.
- New exceptional tournaments save the 50/25/15/10 prize percentages shown in the form preview.
- Enter Match previously opened a game URL without multiplayer route state, launching practice instead of the assigned match. Both tournament entry points now open the assigned lobby; legacy match links redirect there. The lobby waits for the connection, joins the canonical room once, and offers a retry after an error.
- Hourly scheduling initializes default tiers only when the entire configuration is empty. Existing disabled tiers and administrator settings remain intact. Default initialization also tolerates simultaneous scheduler replicas. Per-slot scheduling remains idempotent.
- Distributed tournament rooms have two participant seats. Prepared tournament rooms reject unassigned participants while retaining reconnect and spectator support across all nine games.

## Validation

Final results: 447 tournament API tests (23 files), 302 multiplayer tests (22 files), and 65 navigation/lobby tests (2 files) passed — 814 tests total. Workspace type checks and all four production builds passed; the API build and type check also passed after the concurrency repair.

- New database-backed regression cases cover the real 500-player form defaults, creation/update response consistency, validation without partial writes, empty configuration scheduling, repeated scheduling, and preserved disabled tiers.
- Navigation and lobby checks cover tournament entry for all nine games, connection waiting, and duplicate effect execution.
- Multiplayer checks cover assigned seats, reconnects, spectators, and initial provisioning.
- The broader tournament suite covers registration, brackets, automatic starts, recovery, refunds, settlement, and administrator operations.

Tests use an isolated local PostgreSQL database. These changes have not been deployed, and this audit does not establish the current production database configuration or validate live payouts.
