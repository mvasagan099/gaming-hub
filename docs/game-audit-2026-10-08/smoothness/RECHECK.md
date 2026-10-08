# Game smoothness recheck — 2026-10-08

Baseline commit: `d2cac199a97eb034e074bdfd5418baa3d5dbb163`, branch `codex/staging-preparation`. Verification includes the existing uncommitted fixes; no push or deployment performed.

## Additional fix

Table Tennis reliable action requests lacked the eight-second acknowledgement timeout already used for other realtime games. Eight unresolved acknowledgements could fill all movement slots indefinitely. Table Tennis now uses that same timeout. Tests verify the store applies it and timed-out driver requests release slots so the latest queued paddle position sends.

## Current complete game suites

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Game engine | 28 | 431 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 42 | 375 | 0 | 0 |
| Total | 97 | 1201 | 0 | 0 |

Workspace typecheck: PASS. Production build: PASS, with existing large frontend chunk warnings. Diff whitespace check: PASS.

## Intermittent test evidence

The initial full multiplayer run had 394 passed and one failed: Snake vs Worms private-room lifecycle rejected its pause action. The existing assertion did not include the rejection reason, so the exact original server reason is not proven. The isolated rerun passed, including a run with a pre-existing score of 50.

Inspection found a defective scoring barrier: it checked total score >= 50, which could already be true from random food before the controlled scoring fixture. It now requires a new 50-point increase and consumption of that specific fixture before proceeding. Pause assertions include the full response for future failures. Production rate limits and game rules remain unchanged. The corrected complete multiplayer suite passes; the full repeat also passes: 395/395, zero failed or skipped.

## Scope and remaining live checks

These are local regression results, not an API/security/database audit or live Render verification. The existing paced measurements and limitations remain in FIXES.md. No claim of production lag elimination, stable capacity or OOM resolution is made.

Carrom's compact shot format requires the updated frontend decoder and socket server to be rolled out together in staging; old clients must refresh. Real two-client WAN/mobile rendering and deployed resource checks remain outstanding.
