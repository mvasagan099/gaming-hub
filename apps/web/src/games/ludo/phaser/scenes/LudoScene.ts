import Phaser from "phaser";
import BoardManager from "../managers/BoardManager";
import TokenManager from "../managers/TokenManager";
import DiceManager from "../managers/DiceManager";
import GameManager from "../managers/GameManager";
import HUDManager from "../managers/HUDManager";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { LudoAI } from "../ai/LudoAI";
import { DEFAULT_SETTINGS } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import WinnerPopup from "../ui/WinnerPopup";
import ParticleManager from "../../../snake-ladder/phaser/managers/ParticleManager";
import AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";

export default class LudoScene extends Phaser.Scene {
  private board!: BoardManager;
  private tokenManager!: TokenManager;
  private dice!: DiceManager;
  private gameManager!: GameManager;
  private hud!: HUDManager;
  private ruleEngine!: LudoRuleEngine;
  private ai!: LudoAI;
  private particles!: ParticleManager;
  private audio!: AudioManager;
  private winnerPopup!: WinnerPopup;

  constructor() {
    super("LudoScene");
  }

  create(): void {
    const mode        = (this.registry.get("mode") as "ai" | "pvp") ?? "ai";
    const playerCount = (this.registry.get("players") as 2 | 4) ?? 4;

    // Settings
    const settings = {
      ...DEFAULT_SETTINGS,
      playerCount,
      mode,
    };

    // 1. Board
    this.board = new BoardManager(this);
    this.board.drawBoard();

    // 2. Pure rule engine & AI
    this.ruleEngine = new LudoRuleEngine(settings);
    this.ai = new LudoAI();

    // 3. Audio & Particles
    this.audio = new AudioManager(this);
    this.audio.init();
    this.particles = new ParticleManager(this);

    // 4. Token Manager
    this.tokenManager = new TokenManager(this);
    const initialState = this.ruleEngine.createInitialState(playerCount);
    // Flatten players' tokens
    const initialTokens = initialState.players.flatMap((p) => p.tokens);
    this.tokenManager.createTokens(initialTokens);

    // 5. HUD & UI
    this.hud = new HUDManager(this);
    this.hud.create(playerCount);

    // 6. Dice
    this.dice = new DiceManager(this);
    this.dice.create(912, 210);

    // 7. Winner Popup
    this.winnerPopup = new WinnerPopup(this, this.particles);
    this.winnerPopup.create();

    // 8. GameManager
    this.gameManager = new GameManager(
      this,
      this.board,
      this.tokenManager,
      this.dice,
      this.hud,
      this.ruleEngine,
      this.ai
    );
    this.gameManager.init(mode, playerCount);

    // ─── Event Bindings ───────────────────────────────────────────────────────

    this.events.on(LudoEvents.DICE_ROLL_STARTED, () => {
      this.audio.play("roll");
    });

    this.events.on(LudoEvents.TOKEN_CAPTURED, () => {
      this.audio.play("snake"); // Reuse snake hiss for capture effect
      const current = this.gameManager.getState();
      // Update progress texts on HUD
      current.players.forEach((p, idx) => {
        this.hud.updateProgress(idx, p.tokensDone);
      });
    });

    this.events.on(LudoEvents.TOKEN_FINISHED, () => {
      this.audio.play("win");
      const current = this.gameManager.getState();
      current.players.forEach((p, idx) => {
        this.hud.updateProgress(idx, p.tokensDone);
      });
    });

    this.events.on(LudoEvents.TOKEN_SAFE, () => {
      this.audio.play("ladder"); // Reuse ladder rung shine for safe tiles
    });

    this.events.on(LudoEvents.GAME_OVER, (payload: { winner: string; playerName: string }) => {
      this.audio.play("win");
      this.winnerPopup.show(payload.playerName, this.gameManager.getHistory());
    });
  }
}
export { LudoScene };
