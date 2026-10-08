# Private room invitations — 2026-10-08

Private waiting rooms with a vacant seat now offer Invite a Friend. Existing room-code joining, readiness, start, leave, and chat controls remain available.

The picker uses accepted friendships and sends invitations to the friend's user ID. Invitations persist in the existing notification table; no database migration is required. The recipient receives a socket notification, with periodic refresh and reconnect recovery when delivery is missed. The popup shows sender, game, room code, and stake, with Accept & Join and Decline.

Acceptance revalidates the invitation and room, then uses the existing authoritative room-join operation. The recipient's current game or other room is never left automatically. Acceptance is recorded after a successful join. Reading a notification does not consume the join request; accepting or declining does. Invitations expire after five minutes. Closed, full, started, expired, tournament, and password-protected durable rooms cannot be invited through this picker. Sender membership, current friendship, and blocks are checked on the server. Duplicate requests are serialized and deduplicated, with per-sender limits.

Inviting and declining do not transfer money or start a match. Existing game-start and funding rules govern the joined room.

Validation after recheck: 28 database-backed API tests, 115 frontend tests, and 26 private-room Socket.IO lifecycle tests passed. These cover all nine games, recipient permissions, blocked friends, room availability, simultaneous duplicate requests, expiry, persisted responses, notification reading, picker IDs, popup acceptance/decline, join failures, connection handling, active-game protection, and listener cleanup. The recheck also covers delayed acknowledgements, account/session disposal, navigation or connection changes during acceptance, queued refreshes, stale picker responses, repeated and conflicting answers, and resend cooldowns after decline. Notification acknowledgement no longer delays opening a successfully joined lobby. Workspace type checks and production builds passed. Database tests used isolated local PostgreSQL.

Deployment: deploy the API and frontend changes. No live invitations were sent during verification, and the feature has not been deployed by this task.
