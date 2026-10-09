# Snake vs Worms multiplayer smoothing — 2026-10-09

The user confirmed lag occurs in Snake vs Worms multiplayer. The production log confirms successful startup and one retained match but has zero active physics intervals at the sampled instant; it does not establish ongoing physics frequency or network latency.

The multiplayer presentation timeline previously stopped at the newest server position when delivery ran beyond its 60 ms buffer. It now bridges up to 100 ms of missing updates using observed server movement, capped by authoritative speed. Body segments advance along the known polyline rather than translating corners. Prediction stops at arena bounds and does not cross authoritative discontinuities, including turns, death, respawn, growth, pause, finish, and reconnect. It affects presentation only; collision and scoring remain server-owned.

Server catch-up ticks previously deep-copied all snakes and food for every 60 Hz substep. Catch-up now owns one detached working state and reuses it across substeps. The public standalone simulator remains detached from its input. Existing collision, boost, timer, RNG, and checkpoint behavior is retained.

Validation: 24 Snake frontend tests, 38 Snake engine tests, and 121 gameplay/physics/exit tests passed (183 total). New tests verify gap continuation and bounds, trail bends, source-state immutability, single-copy catch-up, and standalone simulation immutability. Workspace type checks and production builds passed. This task did not change database schemas or financial logic. Active production gameplay still needs measurement after deployment to confirm the remaining device/network experience.
