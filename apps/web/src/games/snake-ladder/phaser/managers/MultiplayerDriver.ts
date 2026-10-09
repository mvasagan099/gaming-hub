import Phaser from "phaser";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";
import { GameEvents } from "../events/GameEvents";
import type BoardManager from "./BoardManager";
import type PlayerManager from "./PlayerManager";
import type DiceManager from "./DiceManager";
import type { HUDManager } from "./HUDManager";
import type { SnakeManager } from "./SnakeManager";
import type { LadderManager } from "./LadderManager";
import type FeedbackText from "../ui/FeedbackText";
import type WinnerPopup from "../ui/WinnerPopup";
import type { WinnerInfo } from "../../../../store/multiplayerStore";
import { ANIM, animDuration, prefersReducedMotion } from "../constants";

interface RemotePlayerState {
  seat: number;
  position: number;
  finished: boolean;
}

interface RemoteState {
  phase?: string;
  currentSeat?: number;
  dice?: number | null;
  players?: RemotePlayerState[];
  logs?: string[];
  winnerSeats?: number[];
  finished?: boolean;
}

interface RemoteEvent {
  type: string;
  seat?: number;
  from?: number;
  to?: number;
  bumpedSeat?: number;
  dice?: number;
}

/**
 * Renders a server-authoritative Snake & Ladder match.
 * All game state comes from the multiplayer store; this class only
 * animates the result and forwards dice clicks as `{ type: "roll" }` actions.
 */
export default class MultiplayerDriver {
  private scene: Phaser.Scene;
  private board: BoardManager;
  private players: PlayerManager;
  private dice: DiceManager;
  private hud: HUDManager;
  private snakeManager: SnakeManager;
  private ladderManager: LadderManager;
  private feedback: FeedbackText;
  private winnerPopup: WinnerPopup;
  private readonly mySeat: number | null;

  private lastState: RemoteState | null = null;
  private pendingWin = false;
  private winShown = false;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    board: BoardManager,
    players: PlayerManager,
    dice: DiceManager,
    hud: HUDManager,
    snakeManager: SnakeManager,
    ladderManager: LadderManager,
    feedback: FeedbackText,
    winnerPopup: WinnerPopup,
    mySeat: number | null,
  ) {
    this.scene = scene;
    this.board = board;
    this.players = players;
    this.dice = dice;
    this.hud = hud;
    this.snakeManager = snakeManager;
    this.ladderManager = ladderManager;
    this.feedback = feedback;
    this.winnerPopup = winnerPopup;
    this.mySeat = mySeat;
  }

  start(): void {
    this.dice.setOnRoll(() => this.onRoll());

    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (
        state.gameState !== prev.gameState ||
        state.winner !== prev.winner ||
        state.matchId !== prev.matchId ||
        state.renderKey !== prev.renderKey
      ) {
        this.applySnapshot(state.gameState, state.lastEvents, state.winner);
      }
    });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());

    // Apply a snapshot that arrived before this driver mounted (reconnect).
    const current = useMultiplayerStore.getState();
    this.applySnapshot(current.gameState, current.lastEvents, current.winner);
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dice.setOnRoll(null);
  }

  private seatName(seat: number): string {
    return this.players.getPlayer(seat + 1)?.name ?? `Player ${seat + 1}`;
  }

  private onRoll(): void {
    this.dice.disable();
    void useMultiplayerStore.getState().sendGameAction({ type: "roll" }).then((res) => {
      if (!res.ok && res.error) this.hud.addLog(res.error);
    });
  }

  private applySnapshot(state: unknown, events: { type: string }[] | undefined, winner: WinnerInfo | null): void {
    if (!state || this.destroyed) return;

    const s = state as RemoteState;
    const evs = (events ?? []) as RemoteEvent[];
    const prev = this.lastState;
    this.lastState = s;

    const freshStart =
      (s.players ?? []).length > 0 &&
      (s.players ?? []).every((p) => p.position === 1) &&
      s.dice == null &&
      !s.finished;
    if (freshStart) {
      this.winShown = false;
      this.winnerPopup.hide();
      // Kill any stale tweens from a previous game
      this.scene.tweens.killAll();
      for (const p of s.players ?? []) {
        this.players.placeAt(p.seat + 1, 1);
      }
    }

    const hasWin =
      evs.some((e) => e.type === "win") || (winner?.winnerSeats?.length ?? 0) > 0;
    this.pendingWin = hasWin;

    if (s.dice != null) {
      if (evs.some((e) => e.type === "roll")) this.dice.rollTo(s.dice);
      else this.dice.setValue(s.dice);
    }

    const moveEvent = evs.find((e) => e.type === "move");
    const actor = moveEvent?.seat ?? -1;
    const actorReady = this.players.getPlayer(actor + 1) !== undefined;

    if (moveEvent && actorReady) {
      const from = moveEvent.from ?? prev?.players?.find((p) => p.seat === actor)?.position ?? 1;
      const to = moveEvent.to ?? from;
      const steps = Math.max(0, to - from);

      this.players.placeAt(actor + 1, from);
      if (steps > 0) {
        this.players.movePlayer(actor + 1, steps, () => this.resolveMove(actor, evs));
      } else {
        this.resolveMove(actor, evs);
      }
      return;
    }

    // No animated move (initial sync, reconnect, rematch): place tokens directly.
    this.finalize(s);
  }

  private resolveMove(seat: number, evs: RemoteEvent[]): void {
    const playerId = seat + 1;
    const reduced = prefersReducedMotion();
    const ladder = evs.find((e) => e.type === "ladder");
    const snake = evs.find((e) => e.type === "snake");
    const rollback = evs.find((e) => e.type === "rollback");

    if (ladder && ladder.to != null) {
      this.hud.addLog(`🪜 ${this.seatName(seat)} climbs a ladder to ${ladder.to}`);
      this.scene.events.emit(GameEvents.LADDER_CLIMB, playerId, ladder.from ?? 0, ladder.to);

      const botPos = this.board.getTilePosition(ladder.from ?? 0);
      this.feedback.ladderClimb(botPos.x, botPos.y);
      this.ladderManager.highlightLadder(ladder.from ?? 0, this.scene);

      if (!reduced) {
        const path = this.ladderManager.getLadderPath(ladder.from ?? 0, this.board);
        this.scene.time.delayedCall(animDuration(ANIM.ladderPause), () => {
          if (path.length > 0) {
            this.players.animateAlongPath(playerId, path, () => {
              this.ladderManager.unhighlightAll(this.scene);
              this.afterMovement(evs);
            });
          } else {
            this.players.snapToTile(playerId, ladder.to!, () => {
              this.ladderManager.unhighlightAll(this.scene);
              this.afterMovement(evs);
            });
          }
        });
        return;
      }

      this.players.snapToTile(playerId, ladder.to, () => {
        this.ladderManager.unhighlightAll(this.scene);
        this.afterMovement(evs);
      });
      return;
    }

    if (snake && snake.to != null) {
      this.hud.addLog(`🐍 ${this.seatName(seat)} slides down a snake to ${snake.to}`);
      this.scene.events.emit(GameEvents.SNAKE_HIT, playerId, snake.from ?? 0, snake.to);

      const headPos = this.board.getTilePosition(snake.from ?? 0);
      this.feedback.snakeHit(headPos.x, headPos.y);
      this.snakeManager.triggerSnakeReaction(snake.from ?? 0, this.scene);

      if (!reduced) {
        const path = this.snakeManager.getSnakePath(snake.from ?? 0, this.board);
        this.scene.time.delayedCall(animDuration(ANIM.snakePause), () => {
          if (path.length > 0) {
            this.players.animateAlongPath(playerId, path, () => {
              this.snakeManager.animateHighlightOut(this.scene);
              this.afterMovement(evs);
            });
          } else {
            this.players.snapToTile(playerId, snake.to!, () => {
              this.snakeManager.animateHighlightOut(this.scene);
              this.afterMovement(evs);
            });
          }
        });
        return;
      }

      this.players.snapToTile(playerId, snake.to, () => {
        this.snakeManager.animateHighlightOut(this.scene);
        this.afterMovement(evs);
      });
      return;
    }

    if (rollback) {
      this.hud.addLog(`${this.seatName(seat)} couldn't move past ${rollback.from ?? 1}`);
    }

    this.afterMovement(evs);
  }

  private afterMovement(evs: RemoteEvent[]): void {
    const bump = evs.find((e) => e.type === "bump");
    const complete = () => this.finalize(this.lastState as RemoteState);

    if (bump && bump.bumpedSeat != null) {
      this.hud.addLog(`⚔️ ${this.seatName(bump.seat ?? 0)} bumped ${this.seatName(bump.bumpedSeat)} back to start!`);
      this.players.snapToTile(bump.bumpedSeat + 1, 1, complete);
      return;
    }

    complete();
  }

  private finalize(s: RemoteState): void {
    if (!s) return;

    // Correct any drift against the authoritative positions.
    for (const p of s.players ?? []) {
      const player = this.players.getPlayer(p.seat + 1);
      if (player && player.tile !== p.position) {
        this.players.snapToTile(p.seat + 1, p.position);
      }
    }

    this.hud.updateTurn((s.currentSeat ?? 0) + 1);
    this.players.setActivePlayer((s.currentSeat ?? 0) + 1);
    if (s.logs) this.hud.setLogs(s.logs);

    this.updateDice(s);
    this.scheduleWin(s);
  }

  private updateDice(s: RemoteState): void {
    const finished = s.finished || (s.winnerSeats?.length ?? 0) > 0;

    if (this.mySeat == null) {
      this.dice.disable();
      this.dice.setPrompt("Spectating...");
      return;
    }

    if (finished) {
      this.dice.disable();
      return;
    }

    if (s.currentSeat === this.mySeat) {
      this.dice.enable();
      this.dice.setPrompt("ROLL DICE");
    } else {
      this.dice.disable();
      this.dice.setPrompt(`${this.seatName(s.currentSeat ?? 0)}'s turn...`);
    }
  }

  private scheduleWin(s: RemoteState): void {
    if (!this.pendingWin || this.winShown) return;
    const storeWinner = useMultiplayerStore.getState().winner;
    const seats = (s.winnerSeats && s.winnerSeats.length > 0)
      ? s.winnerSeats
      : (storeWinner?.winnerSeats && storeWinner.winnerSeats.length > 0)
        ? storeWinner.winnerSeats
        : [];

    if (seats.length === 0 && !s.finished && !storeWinner) return;

    this.winShown = true;
    const winnerSeat = seats[0] ?? 0;
    const won = this.mySeat != null && winnerSeat === this.mySeat;
    const name = this.seatName(winnerSeat);

    this.scene.time.delayedCall(animDuration(700), () => {
      this.winnerPopup.show(name, [], { mode: "multiplayer", won });
      this.winnerPopup.setActions(
        () => this.rematch(),
        () => this.close(),
      );
    });
  }

  private rematch(): void {
    this.lastState = null;
    this.winShown = false;
    void useMultiplayerStore.getState().rematch();
  }

  private close(): void {
    const requestExit = this.scene.registry.get("onExit");
    if (typeof requestExit === "function") requestExit();
  }
}

export { MultiplayerDriver };
