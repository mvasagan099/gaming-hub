import Phaser from "phaser";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";
import type { WinnerInfo } from "../../../../store/multiplayerStore";
import type { CricketState, CricketDelivery, CricketShot, CricketTiming } from "@gaming-hub/game-engine";
import { CricketHUDManager } from "./CricketHUDManager";

export interface CricketRemoteState extends CricketState {}

interface CricketRemoteEvent {
  type: string;
  [key: string]: unknown;
}

export default class CricketMultiplayerDriver {
  private scene: Phaser.Scene;
  private hud: CricketHUDManager;
  private readonly mySeat: number | null;
  private readonly names: string[];
  
  private lastState: CricketRemoteState | null = null;
  private tossHandled = false;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private onTossCallNeeded: ((call: "heads" | "tails") => void) | null = null;
  private onBowlNeeded: ((delivery: CricketDelivery, power: number) => void) | null = null;
  private onBatNeeded: ((shot: CricketShot, timing: CricketTiming) => void) | null = null;
  
  constructor(
    scene: Phaser.Scene,
    hud: CricketHUDManager,
    mySeat: number | null,
    names: string[],
  ) {
    this.scene = scene;
    this.hud = hud;
    this.mySeat = mySeat;
    this.names = names;
  }
  
  start(): void {
    console.log("[CricketMultiplayerDriver] Starting driver, mySeat:", this.mySeat);
    
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());
    
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        console.log("[CricketMultiplayerDriver] State changed, applying new state");
        this.applyState(state.gameState as unknown as CricketRemoteState | null, state.lastEvents, state.winner);
      }
    });
    
    this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const current = useMultiplayerStore.getState();
        const currentInning = (current.gameState as any)?.inning;
        if (currentInning !== undefined && this.lastState?.inning !== currentInning) {
          console.log("[CricketMultiplayerDriver] Poll detected inning change");
          this.applyState(current.gameState as unknown as CricketRemoteState, current.lastEvents, current.winner);
        }
      }
    });
    
    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState as unknown as CricketRemoteState | null, current.lastEvents, current.winner);
  }
  
  stop(): void {
    console.log("[CricketMultiplayerDriver] stop called, destroyed:", this.destroyed);
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    console.log("[CricketMultiplayerDriver] All event listeners cleaned up");
  }
  
  setTossCallHandler(handler: (call: "heads" | "tails") => void): void {
    this.onTossCallNeeded = handler;
  }
  
  setBowlHandler(handler: (delivery: CricketDelivery, power: number) => void): void {
    this.onBowlNeeded = handler;
  }
  
  setBatHandler(handler: (shot: CricketShot, timing: CricketTiming) => void): void {
    this.onBatNeeded = handler;
  }
  
  public getLatestState(): CricketRemoteState | null {
    return this.lastState;
  }
  
  public applyState(
    state: CricketRemoteState | null,
    events: { type: string }[] | undefined = [],
    winner: WinnerInfo | null = null,
  ): void {
    console.log("[CricketMultiplayerDriver] applyState called, state exists:", !!state);
    
    if (!state || this.destroyed) return;
    
    const s = state as CricketRemoteState;
    
    if (s.currentActor === undefined) {
      console.log("[CricketMultiplayerDriver] applyState skipped: missing currentActor");
      return;
    }
    
    console.log("[CricketMultiplayerDriver] Applying state:", {
      currentActor: s.currentActor,
      inning: s.inning,
      finished: s.finished,
      tossWinner: s.tossWinner,
      battingTeam: s.battingTeam,
      bowlingTeam: s.bowlingTeam
    });
    
    this.lastState = s;
    
    if (!this.tossHandled && (s.currentActor === "toss" || s.currentActor === "toss-choice")) {
      console.log("[CricketMultiplayerDriver] Toss phase detected:", s.currentActor);
      this.handleTossPhase(s);
      return;
    }
    
    if (s.tossWinner != null && s.currentActor !== "toss" && s.currentActor !== "toss-choice") {
      this.tossHandled = true;
      console.log("[CricketMultiplayerDriver] Toss completed, tossWinner:", s.tossWinner);
    }
    
    this.scene.events.emit("cricket:state:updated", s, events);
    
    if (events && events.length > 0) {
      for (const ev of events) {
        if (ev.type === "batter-moved") {
          this.scene.events.emit("cricket:batter:moved", (ev as any).x, (ev as any).seat);
        } else if (ev.type === "movement-locked") {
          this.scene.events.emit("cricket:batter:locked");
        } else if (ev.type === "shot-played") {
          this.scene.events.emit("cricket:shot:played", (ev as any).shot, (ev as any).timing);
        }
      }
    }
    
    if (s.finished) {
      console.log("[CricketMultiplayerDriver] Match finished");
      this.scene.events.emit("cricket:match:complete", s);
    }
  }
  
  private handleTossPhase(state: CricketRemoteState): void {
    console.log("[CricketMultiplayerDriver] handleTossPhase, mySeat:", this.mySeat, "currentSeat:", state.currentSeat, "currentActor:", state.currentActor);
    
    if (this.mySeat == null || this.mySeat !== state.currentSeat) {
      if (state.currentActor === "toss-choice") {
        this.hud.updateStatus("Opponent is choosing to bat or bowl...", "#94a3b8");
      } else {
        this.hud.updateStatus("Waiting for opponent to call the toss...", "#94a3b8");
      }
      this.scene.events.emit("cricket:toss:waiting");
      return;
    }
    
    if (state.currentActor === "toss-choice") {
      this.hud.updateStatus("You won the toss! Choose to Bat or Bowl", "#fbbf24");
      this.scene.events.emit("cricket:toss:choice_needed");
    } else {
      this.hud.updateStatus("Call the toss! Choose Heads or Tails", "#fbbf24");
      this.scene.events.emit("cricket:toss:call_needed");
    }
  }
  
  async sendTossCall(call: "heads" | "tails"): Promise<{ ok: boolean; error?: string }> {
    console.log("[CricketMultiplayerDriver] sendTossCall:", call, "mySeat:", this.mySeat);
    
    if (this.mySeat == null) {
      console.error("[CricketMultiplayerDriver] Cannot send toss call: no seat assigned");
      return { ok: false, error: "Cannot send toss call: no seat assigned" };
    }
    
    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "toss-call",
      call,
    });
    console.log("[CricketMultiplayerDriver] toss-call result:", res);
    if (!res.ok && res.error) {
      this.hud.updateStatus(`Error: ${res.error}`, "#f43f5e");
    }
    return res;
  }

  async sendTossChoice(choice: "bat" | "bowl"): Promise<{ ok: boolean; error?: string }> {
    console.log("[CricketMultiplayerDriver] sendTossChoice:", choice, "mySeat:", this.mySeat);
    
    if (this.mySeat == null) {
      console.error("[CricketMultiplayerDriver] Cannot send toss choice: no seat assigned");
      return { ok: false, error: "Cannot send toss choice: no seat assigned" };
    }
    
    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "toss-choice",
      choice,
    });
    console.log("[CricketMultiplayerDriver] toss-choice result:", res);
    if (!res.ok && res.error) {
      this.hud.updateStatus(`Error: ${res.error}`, "#f43f5e");
    }
    return res;
  }
  
  async sendPitchTarget(lateral: number, length: number): Promise<{ ok: boolean; error?: string }> {
    console.log("[CricketMultiplayerDriver] sendPitchTarget:", lateral, length);

    if (this.mySeat == null) {
      console.error("[CricketMultiplayerDriver] Cannot send pitch target: no seat assigned");
      return { ok: false, error: "Cannot send pitch target: no seat assigned" };
    }

    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "set-pitch-target",
      lateral,
      length,
    });
    console.log("[CricketMultiplayerDriver] pitch target action result:", res);
    if (!res.ok && res.error) {
      this.hud.updateStatus(`Error: ${res.error}`, "#f43f5e");
    }
    return res;
  }

  async sendBowlAction(delivery: CricketDelivery, power: number, pitchTargetId?: string): Promise<{ ok: boolean; error?: string }> {
    console.log("[CricketMultiplayerDriver] sendBowlAction:", delivery, "power:", power, "pitchTargetId:", pitchTargetId);
    
    if (this.mySeat == null) {
      console.error("[CricketMultiplayerDriver] Cannot send bowl action: no seat assigned");
      return { ok: false, error: "Cannot send bowl action: no seat assigned" };
    }

    const targetId = pitchTargetId ?? this.lastState?.pitchTarget?.targetId;
    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "bowl",
      delivery,
      power,
      ...(targetId ? { pitchTargetId: targetId } : {}),
    });
    console.log("[CricketMultiplayerDriver] bowl action result:", res);
    if (!res.ok && res.error) {
      this.hud.updateStatus(`Error: ${res.error}`, "#f43f5e");
    }
    return res;
  }
  
  async sendBatAction(shot: CricketShot, timing: CricketTiming = "good", deliveryId?: string): Promise<{ ok: boolean; error?: string }> {
    console.log("[CricketMultiplayerDriver] sendBatAction:", shot, "timing:", timing, "deliveryId:", deliveryId);
    
    if (this.mySeat == null) {
      console.error("[CricketMultiplayerDriver] Cannot send bat action: no seat assigned");
      return { ok: false, error: "Cannot send bat action: no seat assigned" };
    }
    
    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "bat",
      shot,
      timing,
      ...(deliveryId ? { deliveryId } : {}),
    });
    console.log("[CricketMultiplayerDriver] bat action result:", res);
    if (!res.ok && res.error) {
      this.hud.updateStatus(`Error: ${res.error}`, "#f43f5e");
    }
    return res;
  }

  private lastMoveSentAtMs = 0;
  private pendingMoveX: number | null = null;
  private isSendingMove = false;

  async sendBatterPosition(x: number): Promise<{ ok: boolean; error?: string }> {
    if (this.mySeat == null || this.destroyed) {
      return { ok: false, error: "Not in match" };
    }

    const now = Date.now();
    const THROTTLE_MS = 40; // 25 Hz

    // If already sending or within throttle window, buffer latest position
    if (this.isSendingMove || (now - this.lastMoveSentAtMs < THROTTLE_MS)) {
      this.pendingMoveX = x;
      return { ok: true };
    }

    this.isSendingMove = true;
    this.lastMoveSentAtMs = now;
    this.pendingMoveX = null;

    try {
      const res = await useMultiplayerStore.getState().sendGameAction({
        type: "move-batter",
        x,
      });

      // If a newer move position was requested while sending, dispatch it next
      if (this.pendingMoveX !== null && !this.destroyed) {
        const nextX = this.pendingMoveX;
        this.pendingMoveX = null;
        setTimeout(() => {
          this.isSendingMove = false;
          this.sendBatterPosition(nextX);
        }, THROTTLE_MS);
      } else {
        this.isSendingMove = false;
      }

      return res;
    } catch (err) {
      this.isSendingMove = false;
      return { ok: false, error: String(err) };
    }
  }

  async sendLockBatterMovement(): Promise<{ ok: boolean; error?: string }> {
    if (this.mySeat == null || this.destroyed) {
      return { ok: false, error: "Not in match" };
    }

    return await useMultiplayerStore.getState().sendGameAction({
      type: "lock-batter-movement",
    });
  }
  
  canBowl(): boolean {
    if (this.destroyed || this.mySeat == null) return false;
    const s = this.lastState;
    if (!s || s.finished || s.isProcessingDelivery || s.currentSeat !== this.mySeat) return false;
    return s.currentActor === "bowler";
  }
  
  canBat(): boolean {
    if (this.destroyed || this.mySeat == null) return false;
    const s = this.lastState;
    if (!s || s.finished || s.currentSeat !== this.mySeat) return false;
    return s.currentActor === "batsman";
  }
  
  isMyTurn(): boolean {
    if (this.destroyed || this.mySeat == null) return false;
    const s = this.lastState;
    if (!s || s.finished) return false;
    return s.currentSeat === this.mySeat;
  }
  
  getMyRole(): "batting" | "bowling" | null {
    if (this.mySeat == null || this.lastState == null) return null;
    return this.lastState.battingTeam === this.mySeat ? "batting" : "bowling";
  }
  
  getOpponentName(): string {
    if (this.mySeat == null) return "Opponent";
    const opponentSeat = 1 - this.mySeat;
    return this.names[opponentSeat] ?? `Player ${opponentSeat + 1}`;
  }
  
  getPlayerName(seat: number): string {
    return this.names[seat] ?? `Player ${seat + 1}`;
  }
}
