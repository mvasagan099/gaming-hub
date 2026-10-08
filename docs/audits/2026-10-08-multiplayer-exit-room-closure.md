# Multiplayer exit room closure — 2026-10-08

An explicit player exit during active gameplay now finalizes the existing forfeit result and immediately closes the session room. Closing releases all players and spectators, cancels room timers and physics, and marks distributed checkpoints closed. Both accounts can create a new room immediately. Initialization exits retain the existing cancellation/refund behavior; spectators and temporary reconnectable disconnects retain their existing behavior.

The client remembers server-closed rooms and matches so delayed room updates or results cannot restore stale membership. Retrying an exit to a missing or closed distributed room acknowledges successful cleanup without permitting further game actions.

Validation: 150 framework/recovery/game-load checks, 44 real local Socket.IO lifecycle checks, and 81 frontend exit/navigation checks passed. Coverage includes both host and guest exits across all nine games, simultaneous exits, paused matches, initialization refunds, spectator exits, delayed messages, and new room creation on both clients. Workspace production builds and type checks passed (the API check was rerun after correcting an invitation test fixture type). No production games or financial records were changed during testing.
