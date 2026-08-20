import Phaser from "phaser";
import BoardManager from "../managers/BoardManager";
import TokenManager from "../managers/TokenManager";
import DiceManager from "../managers/DiceManager";
import GameManager from "../managers/GameManager";
import HUDManager from "../managers/HUDManager";
import LudoMultiplayerDriver from "../managers/LudoMultiplayerDriver";
import { LudoRuleEngine } from "../engine/LudoRuleEngine";
import { LudoAI } from "../ai/LudoAI";
import { DEFAULT_SETTINGS, type LudoSettings, type PlayerColor } from "../types/ludo.types";
import { LudoEvents } from "../events/LudoEvents";
import { PLAYER_COLORS_ORDER } from "../data/boardLayout";
import WinnerPopup from "../ui/WinnerPopup";
import FeedbackText from "../ui/FeedbackText";
import CountdownOverlay from "../ui/CountdownOverlay";
import MovePathOverlay from "../ui/MovePathOverlay";
import ParticleManager from "../../../snake-ladder/phaser/managers/ParticleManager";
import AudioManager from "../../../snake-ladder/phaser/managers/AudioManager";

export default class LudoScene extends Phaser.Scene {
  private board!: BoardManager;
  private tokenManager!: TokenManager;
  private dice!: DiceManager;
  private gameManager!: GameManager;
  private multiplayerDriver!: LudoMultiplayerDriver;
  private hud!: HUDManager;
  private ruleEngine!: LudoRuleEngine;
  private ai!: LudoAI;
  private particles!: ParticleManager;
  private audio!: AudioManager;
  private winnerPopup!: WinnerPopup;
  private feedback!: FeedbackText;
  private countdown!: CountdownOverlay;
  private pathOverlay!: MovePathOverlay;

  constructor() {
    super("LudoScene");
  }

  create(): void {
    const mode        = (this.registry.get("mode") as "ai" | "pvp") ?? "ai";
    const playerCount = (this.registry.get("players") as number) ?? 4;
    const mySeat      = (this.registry.get("seat") as number | null | undefined) ?? null;
    const names       = (this.registry.get("names") as string[] | undefined) ?? [];
    const online      = (this.registry.get("online") as boolean | undefined) ?? false;
    const isReconnect = (this.registry.get("reconnect") as boolean | undefined) ?? false;

    const settings: LudoSettings = {
      ...DEFAULT_SETTINGS,
      playerCount: playerCount === 2 ? 2 : 4,
      mode,
    };

    // 1. Audio & Particles
    this.audio = new AudioManager(this);
    this.audio.init();
    this.particles = new ParticleManager(this);

    // 2. Board
    this.board = new BoardManager(this);
    this.board.drawBoard();

    // 3. Move Path Overlay (Behind tokens, above board)
    this.pathOverlay = new MovePathOverlay(this);

    // 4. Rule engine & AI
    this.ruleEngine = new LudoRuleEngine(settings);
    this.ai = new LudoAI();

    // 5. Token Manager
    this.tokenManager = new TokenManager(this);
    const activeColors: PlayerColor[] =
      playerCount === 2 ? ["red", "green"] : PLAYER_COLORS_ORDER.slice(0, playerCount);
    const initialTokens = activeColors.flatMap((color) =>
      Array.from({ length: 4 }, (_, ti) => ({
        id: `${color}-${ti}`,
        color,
        index: ti,
        position: -1,
        state: "yard" as const,
      })),
    );
    this.tokenManager.createTokens(initialTokens);

    // 6. HUD & UI
    this.hud = new HUDManager(this);
    this.hud.create(playerCount);
    this.hud.setMySeat(online ? (mySeat ?? 0) : 0);
    if (online) {
      if (names.length > 0) this.hud.setNames(names);
      this.hud.applyColors(activeColors);
    }

    // Sound toggle
    this.hud.setSoundToggleCallback(() => {
      this.audio.play("roll");
    });

    // 7. Dice
    this.dice = new DiceManager(this);
    this.dice.create(912, 205);

    // 8. Feedback Text
    this.feedback = new FeedbackText(this);

    // 9. Winner Popup
    this.winnerPopup = new WinnerPopup(this, this.particles);
    this.winnerPopup.create();

    // 10. Countdown Overlay
    this.countdown = new CountdownOverlay(this);

    // 11. Game logic
    const startGame = () => {
      if (online) {
        this.multiplayerDriver = new LudoMultiplayerDriver(
          this,
          this.tokenManager,
          this.dice,
          this.hud,
          this.winnerPopup,
          mySeat,
          names,
          this.feedback,
          this.pathOverlay,
        );
        this.multiplayerDriver.start();
      } else {
        this.gameManager = new GameManager(
          this,
          this.board,
          this.tokenManager,
          this.dice,
          this.hud,
          this.ruleEngine,
          this.ai,
          this.feedback,
          this.pathOverlay,
        );
        this.gameManager.init(mode, playerCount === 2 ? 2 : 4);
      }
    };

    // Board entry animation, then countdown (for fresh games only)
    if (!isReconnect && !online) {
      this.board.animateBoardEntry(() => {
        this.countdown.show(
          names.length > 0 ? names : ["Player 1", "Player 2", "Player 3", "Player 4"],
          playerCount,
          () => startGame(),
        );
      });
    } else {
      // Online/reconnect: skip countdown, just animate board
      this.board.animateBoardEntry(() => startGame());
    }

    // ─── Event Bindings ───────────────────────────────────────────────────────

    this.events.on(LudoEvents.DICE_ROLL_STARTED, () => {
      this.audio.play("roll");
    });

    this.events.on(LudoEvents.TOKEN_CAPTURED, () => {
      this.audio.play("snake");
      if (this.gameManager) {
        const current = this.gameManager.getState();
        current.players.forEach((p, idx) => {
          this.hud.updateProgress(idx, p.tokensDone);
        });
      }
    });

    this.events.on(LudoEvents.TOKEN_FINISHED, () => {
      this.audio.play("win");
      if (this.gameManager) {
        const current = this.gameManager.getState();
        current.players.forEach((p, idx) => {
          this.hud.updateProgress(idx, p.tokensDone);
        });
      }
    });

    this.events.on(LudoEvents.TOKEN_SAFE, () => {
      this.audio.play("ladder");
    });

    this.events.on(LudoEvents.GAME_OVER, (payload: { winner: string; playerName: string }) => {
      this.audio.play("win");
      const history = this.gameManager?.getHistory() ?? [];
      this.winnerPopup.show(payload.playerName, history);
    });
  }
}

export { LudoScene };
