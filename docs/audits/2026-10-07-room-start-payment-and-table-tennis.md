# Room-start payment safety and Table Tennis follow-up — 2026-10-07

## Findings and changes

Funding reserves each participant's entry fee, but the previous database ACTIVE/PLAYING labels appeared before countdown and board initialization completed. Settlement accepted ACTIVE or CREATED and could choose remaining participants from API abandonment/timeout paths without checking the committed room outcome. This is a reproduced code-level gap; no production match IDs or ledger evidence were supplied to attribute particular historical owner credits.

Distributed paid rooms now carry a server-controlled start-validation requirement. The central settlement transaction checks the durable room checkpoint and immutable result outbox, rejects incomplete initialization and mismatched winners, and shares a per-match lock with cancellation/funding. An unstarted paid CREATED match cannot award a prize. A committed engine result cannot be replaced by a competing cancellation. Socket processes still declare game facts; only the API changes balances. CouponVault transfer behavior is unchanged.

Carrom and Snake vs Worms additionally wait for authenticated board-loaded acknowledgements from every seated participant. The frontend sends this after the first successful canvas render with its own authoritative participant. Initial-state delivery allows the boards to load; gameplay actions, physics, clocks and AFK adjudication remain blocked until both boards confirm. Duplicate acknowledgements cannot start another game. The stored 30-second loading deadline survives recovery. Timeout, early leave, or a premature finish/forfeit takes the cancellation/refund path, with no winner. Loading and cancellation notices explain the state to the player. Disconnection while loading invalidates that participant's receipt.

Table Tennis previously advanced one physics frame per callback. Slow persistence therefore reduced rally speed. It now advances elapsed time in collision-safe 60Hz steps, with fractional time included in its checkpoint and a bounded catch-up window. Active network/checkpoint cadence is about 30Hz; idle/paused physics does not enqueue checkpoint writes. Routing selects only room identity and closed status instead of reading growing history on every input. The client keeps one paddle request in flight, replacing obsolete pending positions with the latest input. Collision and out-of-bounds rules remain unchanged.

## Verification

Complete final regressions: engine 421/421 (27 files), multiplayer 205/205 (19 files), web 244/244 (33 files), API 1,314/1,314 (95 files). Total: **2,184 passing tests across 174 files, 0 failed, 0 skipped**, including 19 additional tests above the preceding 2,165-test recovery run. The final API suite completed in 591.89 seconds with exit 0. Production build, workspace type checking and Android/iOS sync all passed with exit 0. Native compilation and physical-device measurements were not repeated in this follow-up.

Already completed targeted real integration: 52/52 tests across three files, including all-nine owner-death recovery and the two paid private-room initialization cases. For each affected game: incomplete lobby readiness caused no debit; a single/duplicate owner board receipt did not start gameplay; API prize/forfeit attempts were rejected; pre-start leave plus repeated cancellation refunded both wallets to their original balances; zero MATCH_PAYOUT records were created; one cancellation outbox delivered.

Engine elapsed-time tests compare delayed callbacks with normal 60Hz simulation, including paddle collision, fractional checkpoint recovery and bounded long stalls. Multiplayer tests verify both-board admission, duplicate/foreign/stale acknowledgements, loading deadline recovery, premature finish cancellation and zero idle physics queue work. The paddle-delivery test proves a slow acknowledgement permits only one in-flight request and the newest pending position follows it.

No physical-device FPS, WAN latency or deployed production behavior was measured. No production deployment, live ledger mutation, migration, commit or push was performed. The earlier production preflight/deployed-auth/device certification gates remain outstanding. Historical erroneous transfers require match/room IDs and read-only ledger review before any authorized reconciliation; this follow-up does not reverse live transactions automatically.

## Focused staging/device checks

For each affected game, enter a private paid room with two staging users. Block one user's game bundle or prevent its first canvas render. Confirm the room remains in initialization, neither user earns a prize, and both reserved entries refund after the 30-second deadline. Repeat with a pre-start Exit, network disconnect, owner-process restart, duplicate board receipts and lost acknowledgement. Then allow both boards to render, play a real game and verify one canonical payout. Review wallet ledger entries rather than interpreting an on-screen prize label as a transfer.

For Table Tennis, compare normal play with delayed server callbacks and slow paddle acknowledgements. Check stable rally speed, paddle contacts, no off-table bounce-back, accurate three-minute timer, new serve handling and background/reconnect recovery. Record device model, network and frame pacing; this software run supplies no hardware certification.

The initial complete API run found four failures: three played-match fixtures lacked a recorded start time, and one pre-existing TOTP tampering assertion could produce unchanged decoded bytes. These were corrected without weakening the payment guard, then the focused 23-test run and final full 1,314-test API run passed.

Regression fixture maintenance: three existing financial-economy cases now explicitly record the start time of their played matches. A pre-existing TOTP tampering assertion could replace a base64 suffix with identical decoded bytes; it now flips a decoded byte deterministically. The product encryption/authentication implementation was not relaxed. Both changes passed their focused 23-test rerun.
