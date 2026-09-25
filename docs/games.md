# Multiplayer Game Engines

This platform supports multiple games, each powered by a server-authoritative engine that validates player actions with strict type safety and deterministic outcomes.

## Games

| Game | ID | Category | Multiplayer | Available |
|------|----|----------|-------------|----------|
| Snake & Ladder | `snake-ladder` | Board | ✓ | ✓ |
| Ludo | `ludo` | Board | ✓ | ✓ |
| Chess | `chess` | Board | ✓ | ✓ |
| Carrom | `carrom` | Board | ✓ | ✓ |
| Table Tennis | `table-tennis` | Sports | ✓ | ✓ |
| Snake vs Worms | `snake-vs-worms` | Arcade | ✓ | ✓ |
| Fruit Ninja | `fruit-ninja` | Arcade | | ✓ |
| Bubble Shooter | `bubble-shooter` | Arcade | | ✓ |

### Features (all engines)

- **Timers**: Turn-based timer (default 30s) + optional match timer.
- **Player Actions**: resign, draw offer/accept/decline, pause/resume.
- **Replay**: Persistence of moves.
- **Spectator Mode**: View ongoing matches.
- **Tournament Ready**: Rejoin, rematch, swap seats, leaderboards.
