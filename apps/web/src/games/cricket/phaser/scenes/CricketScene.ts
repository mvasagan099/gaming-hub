import Phaser from "phaser";
import type { CricketState, CricketDelivery, CricketShot, CricketTiming } from "@gaming-hub/game-engine";
import { CricketHUDManager } from "../managers/CricketHUDManager";
import { CricketAudioManager } from "../managers/CricketAudioManager";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";
import CricketMultiplayerDriver from "../managers/CricketMultiplayerDriver";

const GAME_W = 924;
const GAME_H = 680;
const CENTER_X = GAME_W / 2;
const CENTER_Y = GAME_H / 2;

// Perspective constants
const HORIZON_Y = 220;
const PITCH_TOP_W = 120;
const PITCH_BOT_W = 360;
const PITCH_TOP_Y = HORIZON_Y + 40;
const PITCH_BOT_Y = GAME_H - 80;

export class CricketScene extends Phaser.Scene {
  private hud!: CricketHUDManager;
  private audioManager!: CricketAudioManager;

  // Players & Objects
  private bowler!: Phaser.GameObjects.Sprite;
  private batsman!: Phaser.GameObjects.Sprite;
  private fielders: Phaser.GameObjects.Sprite[] = [];
  private ball!: Phaser.GameObjects.Sprite;
  private ballShadow!: Phaser.GameObjects.Graphics;
  private bat!: Phaser.GameObjects.Sprite;
  private bottomBails!: Phaser.GameObjects.Graphics;
  private bail1!: Phaser.GameObjects.Graphics;
  private bail2!: Phaser.GameObjects.Graphics;
  private batsmanStumps!: Phaser.GameObjects.Graphics;
  private bowlerStumps!: Phaser.GameObjects.Graphics;

  // Particles
  private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // State
  private ballVelocity = { x: 0, y: 0 };
  private ballDepth = 0;
  private ballHeight = 0;
  private ballVelocityZ = 0;
  private gravity = 1200;
  private deliveryType: CricketDelivery = 'fast';
  private spinDirection: number = 1;
  private isBowling = false;
  private isHit = false;
  private initialBallScale = 0.28;
  private finalBallScale = 0.28;
  private aiHasSwung = false;
  private playerHasSwung = false;
  private hasSteppedOut = false;
  private confidence = 0.5;

  private pendingRuns = 0;
  private isRunning = false;
  private ballDead = true;
  private nonStriker!: Phaser.GameObjects.Sprite;
  private keeper!: Phaser.GameObjects.Sprite;

  // Game logic
  private runs = 0;
  private wickets = 0;
  private balls = 0;
  private maxBalls = 9999;
  private targetScore = 0;
  private overHistory: string[] = [];
  private role: "batting" | "bowling" = "batting";
  private bestScore: number = 0;
  private mode: "ai" | "multiplayer" = "ai";
  private inning: 1 | 2 = 1;

  private onGameOver!: (runs: number, wickets: number, won: boolean) => void;
  private nextBallTimerEvent?: Phaser.Time.TimerEvent;

  // Multiplayer (server-driven) state
  private mySeat: number | null = null;
  private remoteState: CricketState | null = null;
  private namesBySeat: Record<number, string> = {};
  private unsubscribe?: () => void;
  private multiplayerOver = false;
  private multiplayerDriver?: CricketMultiplayerDriver;

  // ── NEW visual state ─────────────────────────────────────────────────────
  private ballAngle = 0;
  private bowlerRunupActive = false;
  private crowdSprites: Phaser.GameObjects.Sprite[] = [];
  private bowlerRestX = CENTER_X;
  private bowlerRestY = PITCH_TOP_Y - 50;

  constructor() {
    super("CricketScene");
  }

  create(data: { mode: "ai" | "multiplayer"; role: "batting" | "bowling"; overs: number; onGameOver?: (runs: number, wickets: number, won: boolean) => void }) {
    this.mode = data.mode || "ai";
    this.onGameOver = data.onGameOver || (() => {});
    this.role = data.role || "batting";

    this.runs = 0;
    this.wickets = 0;
    this.balls = 0;
    this.overHistory = [];
    this.maxBalls = data.overs ? data.overs * 6 : 6;
    this.multiplayerOver = false;

    // Generate target score for AI mode
    this.targetScore = (data.overs || 1) * 15 + Math.floor(Math.random() * ((data.overs || 1) * 5));

    if (this.mode === "multiplayer") {
      const store = useMultiplayerStore.getState();
      this.mySeat = store.mySeat;
      const initial = store.gameState as unknown as CricketState | null;
      if (this.mySeat != null && initial) {
        this.role = initial.battingTeam === this.mySeat ? "batting" : "bowling";
      }
      this.namesBySeat = {};
      for (const p of store.room?.players ?? []) {
        if (p.seat != null) this.namesBySeat[p.seat] = p.displayName;
      }
    }

    this.drawBackground();
    this.generateTextures();
    this.drawCrowd();
    this.createPlayers();

    if (this.mode === "ai") {
      const stored = localStorage.getItem('cricket_best_score');
      if (stored) {
        this.bestScore = parseInt(stored, 10);
      }
    }

    this.hud = new CricketHUDManager(this, this.mode, this.role);
    if (this.mode === "ai") {
      this.hud.setBestScore(this.bestScore);
      this.hud.setTarget(this.targetScore);
      this.hud.updateStats(this.balls, this.maxBalls);
    } else {
      this.hud.setTarget((this.remoteState?.target) ?? null);
    }
    this.hud.updateOverHistory(this.overHistory);
    this.hud.onHit = (dir) => this.hitShot(false, dir);
    this.hud.onBowl = (type, power) => this.playerBowl(type, power);

    this.audioManager = new CricketAudioManager();
    this.audioManager.playAmbientMurmur();

    this.events.once('shutdown', () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = undefined;
      }
      if (this.multiplayerDriver) {
        this.multiplayerDriver.stop();
      }
      this.audioManager.destroy();
    });

    if (this.mode === "multiplayer") {
      console.log("[CricketScene] Initializing multiplayer mode");

      const names: string[] = [];
      for (let i = 0; i < 2; i++) {
        const p = useMultiplayerStore.getState().room?.players.find(pl => pl.seat === i);
        names[i] = p?.displayName ?? `Player ${i + 1}`;
      }

      this.multiplayerDriver = new CricketMultiplayerDriver(this, this.hud, this.mySeat, names);

      this.events.on("cricket:state:updated", (state: CricketState, events: { type: string }[]) => {
        this.applyRemoteState(state, events);
      });

      this.events.on("cricket:toss:call_needed", () => {
        console.log("[CricketScene] Toss call needed, emitting to react");
        this.events.emit("cricket:toss:call_needed_react");
      });

      this.events.on("cricket:toss:waiting", () => {
        console.log("[CricketScene] Waiting for opponent toss call");
        this.hud.updateStatus("Waiting for opponent to call the toss...", "#94a3b8");
      });

      this.events.on("cricket:match:complete", (state: CricketState) => {
        console.log("[CricketScene] Match complete event received");
        this.handleMatchComplete(state);
      });

      this.multiplayerDriver.start();
      return;
    }

    // Keyboard shortcuts
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.role === 'batting') this.hitShot(false, 'up');
      });
      this.input.keyboard.on('keydown-UP', () => {
        if (this.role === 'batting') this.hitShot(false, 'up');
      });
      this.input.keyboard.on('keydown-W', () => {
        if (this.role === 'batting') this.hitShot(false, 'up');
      });
      this.input.keyboard.on('keydown-DOWN', () => {
        if (this.role === 'batting') this.hitShot(false, 'straight');
      });
      this.input.keyboard.on('keydown-S', () => {
        if (this.role === 'batting') this.hitShot(false, 'straight');
      });
      this.input.keyboard.on('keydown-LEFT', () => {
        if (this.role === 'batting') this.hitShot(false, 'left');
      });
      this.input.keyboard.on('keydown-A', () => {
        if (this.role === 'batting') this.hitShot(false, 'left');
      });
      this.input.keyboard.on('keydown-RIGHT', () => {
        if (this.role === 'batting') this.hitShot(false, 'right');
      });
      this.input.keyboard.on('keydown-D', () => {
        if (this.role === 'batting') this.hitShot(false, 'right');
      });
      this.input.keyboard.on('keydown-ONE', () => {
        if (this.role === 'bowling') this.playerBowl('fast', this.hud.getCurrentPower());
      });
      this.input.keyboard.on('keydown-TWO', () => {
        if (this.role === 'bowling') this.playerBowl('slow', this.hud.getCurrentPower());
      });
      this.input.keyboard.on('keydown-THREE', () => {
        if (this.role === 'bowling') this.playerBowl('spin', this.hud.getCurrentPower());
      });
    }

    this.startNextBallTimer(3);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VISUALS — COMPLETELY REBUILT
  // ─────────────────────────────────────────────────────────────────────────────

  private drawBackground() {
    const g = this.add.graphics();

    // ── 1. Night Sky ──────────────────────────────────────────────────────────
    g.fillGradientStyle(0x010814, 0x010814, 0x071428, 0x071428, 1);
    g.fillRect(0, 0, GAME_W, HORIZON_Y);

    // Stars
    for (let i = 0; i < 100; i++) {
      const sx = (Math.sin(i * 137.508 * Math.PI / 180) * 0.5 + 0.5) * GAME_W;
      const sy = (Math.cos(i * 97.3 * Math.PI / 180) * 0.5 + 0.5) * (HORIZON_Y - 70);
      const alpha = 0.25 + (i % 4) * 0.18;
      const size = i % 7 === 0 ? 1.8 : i % 3 === 0 ? 1.4 : 1;
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(sx, sy, size);
    }

    // Moon (top-right area)
    g.fillStyle(0xfff5cc, 0.05);
    g.fillCircle(GAME_W * 0.84, 30, 70);
    g.fillStyle(0xfff8d6, 0.08);
    g.fillCircle(GAME_W * 0.84, 30, 45);
    g.fillStyle(0xfffde0, 0.9);
    g.fillCircle(GAME_W * 0.84, 30, 18);
    g.fillStyle(0xfffff0, 1);
    g.fillCircle(GAME_W * 0.84, 30, 14);
    // Moon crater
    g.fillStyle(0xf0ead8, 0.5);
    g.fillCircle(GAME_W * 0.84 + 5, 27, 4);

    // Atmospheric horizon glow from floodlights
    g.fillGradientStyle(0x1a3a5c, 0x1a3a5c, 0x071428, 0x071428, 0, 0, 0.35, 0.35);
    g.fillRect(0, HORIZON_Y - 55, GAME_W, 55);

    // ── 2. Multi-Tier Grandstands ─────────────────────────────────────────────
    const standH = 120;
    const standTopY = HORIZON_Y - standH;

    // Tier 3 (highest, furthest back)
    g.fillStyle(0x0d1e38, 1);
    g.fillRect(0, standTopY, GAME_W, standH * 0.34);

    // Tier 2 (middle)
    g.fillStyle(0x102240, 1);
    g.fillRect(0, standTopY + standH * 0.34, GAME_W, standH * 0.32);

    // Tier 1 (lowest, closest to field)
    g.fillStyle(0x132848, 1);
    g.fillRect(0, standTopY + standH * 0.66, GAME_W, standH * 0.34);

    // Tier dividers
    g.lineStyle(1.5, 0x1e3c60, 0.75);
    g.beginPath();
    g.moveTo(0, standTopY + standH * 0.34);
    g.lineTo(GAME_W, standTopY + standH * 0.34);
    g.moveTo(0, standTopY + standH * 0.66);
    g.lineTo(GAME_W, standTopY + standH * 0.66);
    g.strokePath();

    // Seating row lines within each tier
    for (let tier = 0; tier < 3; tier++) {
      const tierStartY = standTopY + tier * (standH / 3);
      const tierEndY = tierStartY + standH / 3;
      const rowCount = 4;
      for (let row = 1; row < rowCount; row++) {
        const rowY = tierStartY + (tierEndY - tierStartY) * (row / rowCount);
        g.lineStyle(1, 0x1a3050, 0.45);
        g.beginPath();
        g.moveTo(0, rowY);
        g.lineTo(GAME_W, rowY);
        g.strokePath();
      }
    }

    // ── 3. Stadium Roof / Canopy Structure ────────────────────────────────────
    g.fillStyle(0x08121f, 1);
    g.fillRect(0, standTopY - 16, GAME_W, 18);
    // Roof front edge highlight
    g.lineStyle(2, 0x263d5a, 0.9);
    g.beginPath();
    g.moveTo(0, standTopY - 16);
    g.lineTo(GAME_W, standTopY - 16);
    g.strokePath();
    // Steel purlins
    g.lineStyle(1.5, 0x1a2e46, 0.6);
    const purlinCount = 22;
    for (let p = 0; p < purlinCount; p++) {
      const px = (GAME_W / purlinCount) * p;
      g.beginPath();
      g.moveTo(px, standTopY - 16);
      g.lineTo(px, standTopY + 2);
      g.strokePath();
    }

    // ── 4. Floodlight Towers ──────────────────────────────────────────────────
    const drawFloodlightTower = (tx: number, headY: number, coneTargX: number, coneTargY: number) => {
      // Volumetric light cone (outer, softer)
      g.fillGradientStyle(0xfffacd, 0xfffacd, 0xfffacd, 0xfffacd, 0.10, 0.10, 0, 0);
      g.beginPath();
      g.moveTo(tx - 25, headY + 5);
      g.lineTo(tx + 25, headY + 5);
      g.lineTo(coneTargX + 210, coneTargY);
      g.lineTo(coneTargX - 210, coneTargY);
      g.closePath();
      g.fillPath();
      // Inner, brighter cone
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.06, 0.06, 0, 0);
      g.beginPath();
      g.moveTo(tx - 10, headY + 5);
      g.lineTo(tx + 10, headY + 5);
      g.lineTo(coneTargX + 90, coneTargY);
      g.lineTo(coneTargX - 90, coneTargY);
      g.closePath();
      g.fillPath();

      // Tower mast
      const mastBot = HORIZON_Y - 5;
      const mastTop = headY + 12;
      // Left & right legs
      g.fillStyle(0x2d3f52, 1);
      g.fillRect(tx - 5, mastTop, 5, mastBot - mastTop);
      g.fillRect(tx + 1, mastTop, 5, mastBot - mastTop);
      // Cross-bracing (lattice)
      const braceCount = Math.floor((mastBot - mastTop) / 14);
      g.lineStyle(1.2, 0x243448, 0.95);
      for (let b = 0; b < braceCount; b++) {
        const by = mastTop + b * 14;
        g.beginPath();
        if (b % 2 === 0) {
          g.moveTo(tx - 5, by);
          g.lineTo(tx + 6, by + 14);
        } else {
          g.moveTo(tx + 6, by);
          g.lineTo(tx - 5, by + 14);
        }
        g.strokePath();
      }
      // Horizontal braces every 4th
      for (let b = 0; b < braceCount; b += 4) {
        const by = mastTop + b * 14;
        g.beginPath();
        g.moveTo(tx - 5, by);
        g.lineTo(tx + 6, by);
        g.strokePath();
      }

      // Floodlight head frame
      g.fillStyle(0x1c2d3e, 1);
      g.fillRoundedRect(tx - 24, headY - 10, 49, 22, 3);
      // Bank of bulbs
      for (let bulb = 0; bulb < 9; bulb++) {
        const bx = tx - 20 + bulb * 5;
        // Glow halo
        g.fillStyle(0xfff8e0, 0.35);
        g.fillCircle(bx, headY, 4.5);
        // Bright bulb
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(bx, headY, 2.2);
      }
      // Head bracket/arm
      g.fillStyle(0x1a2a38, 1);
      g.fillRect(tx - 3, headY + 11, 7, 9);
    };

    // 4 towers: far-left, near-left, near-right, far-right
    drawFloodlightTower(55, 18, CENTER_X * 0.45, HORIZON_Y + 280);
    drawFloodlightTower(200, 8, CENTER_X * 0.6, HORIZON_Y + 320);
    drawFloodlightTower(GAME_W - 200, 8, CENTER_X * 1.4, HORIZON_Y + 320);
    drawFloodlightTower(GAME_W - 55, 18, CENTER_X * 1.55, HORIZON_Y + 280);

    // ── 5. Electronic Scoreboard (left stand section) ─────────────────────────
    const sbX = 70, sbY = HORIZON_Y - standH + 10, sbW = 172, sbH = 55;
    // Outer casing
    g.fillStyle(0x050e1a, 1);
    g.fillRoundedRect(sbX - 4, sbY - 4, sbW + 8, sbH + 8, 5);
    g.lineStyle(2, 0x1a4a6a, 0.9);
    g.strokeRoundedRect(sbX - 4, sbY - 4, sbW + 8, sbH + 8, 5);
    // LED panel background
    g.fillStyle(0x020c18, 1);
    g.fillRect(sbX, sbY, sbW, sbH);
    // LED dot matrix grid
    g.fillStyle(0x103040, 0.55);
    for (let dy = 3; dy < sbH - 3; dy += 4) {
      for (let dx = 3; dx < sbW - 3; dx += 4) {
        g.fillRect(sbX + dx, sbY + dy, 2, 2);
      }
    }
    // Scoreboard top caption glow
    g.fillStyle(0x22d3ee, 0.15);
    g.fillRect(sbX, sbY, sbW, 14);
    // Corner accent lines
    g.lineStyle(1, 0x22d3ee, 0.6);
    g.strokeRoundedRect(sbX, sbY, sbW, sbH, 2);

    // ── 6. Sight Screen ───────────────────────────────────────────────────────
    const ssX = CENTER_X - 65, ssY = HORIZON_Y - standH + 16, ssW = 130, ssH = 56;
    // Outer steel frame
    g.fillStyle(0x1a2840, 1);
    g.fillRoundedRect(ssX - 4, ssY - 4, ssW + 8, ssH + 8, 5);
    // White face panels (3 vertical panels)
    const panelW = ssW / 3 - 2;
    for (let p = 0; p < 3; p++) {
      g.fillStyle(0xf1f5f9, 1);
      g.fillRect(ssX + p * (panelW + 3), ssY, panelW, ssH);
      // Panel divider shadow
      g.fillStyle(0xd0d8e0, 0.6);
      g.fillRect(ssX + p * (panelW + 3), ssY, 2, ssH);
    }

    // ── 7. Advertising Boards (LED ribbon) ────────────────────────────────────
    const ribbonY = HORIZON_Y - 24;
    // Main dark LED strip
    g.fillStyle(0x010b18, 1);
    g.fillRect(0, ribbonY, GAME_W, 24);
    // LED panel edge lines
    g.lineStyle(1.2, 0x0ea5e9, 0.55);
    g.beginPath();
    g.moveTo(0, ribbonY);
    g.lineTo(GAME_W, ribbonY);
    g.moveTo(0, HORIZON_Y);
    g.lineTo(GAME_W, HORIZON_Y);
    g.strokePath();
    // Colored sponsor boards
    const sponsorColors = [0xdc2626, 0x16a34a, 0xca8a04, 0x7c3aed, 0x0891b2, 0xea580c, 0x0284c7, 0xbe185d];
    const boardsCount = 14;
    const boardW = GAME_W / boardsCount - 2;
    for (let b = 0; b < boardsCount; b++) {
      const bx = (GAME_W / boardsCount) * b + 1;
      const col = sponsorColors[b % sponsorColors.length];
      g.fillStyle(col, 0.88);
      g.fillRect(bx, ribbonY + 2, boardW, 20);
      // Board separator
      g.fillStyle(0x010b18, 1);
      g.fillRect(bx + boardW, ribbonY + 2, 2, 20);
      // White stripe detail on board
      g.fillStyle(0xffffff, 0.18);
      g.fillRect(bx + 2, ribbonY + 4, boardW - 4, 3);
    }

    // ── 8. Outfield Grass with Mowing Stripes ─────────────────────────────────
    const stripeH = 30;
    const numStripes = Math.ceil((GAME_H - HORIZON_Y) / stripeH) + 1;
    for (let s = 0; s < numStripes; s++) {
      const sy = HORIZON_Y + s * stripeH;
      // Darker close to edges, lighter in middle (bowl effect)
      g.fillStyle(s % 2 === 0 ? 0x14532d : 0x166534, 1);
      g.fillRect(0, sy, GAME_W, stripeH);
    }

    // Edge vignette (darker towards left/right to create bowl feel)
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.2, 0, 0.2, 0);
    g.fillRect(0, HORIZON_Y, 80, GAME_H - HORIZON_Y);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.2, 0, 0.2);
    g.fillRect(GAME_W - 80, HORIZON_Y, 80, GAME_H - HORIZON_Y);

    // ── 9. Boundary Rope & Cushions ───────────────────────────────────────────
    // White boundary line
    g.lineStyle(3.5, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(0, HORIZON_Y + 3);
    g.lineTo(GAME_W, HORIZON_Y + 3);
    g.strokePath();
    // Boundary advertisement cushions (orange/red pillars)
    for (let c = 0; c < 12; c++) {
      const cx = (GAME_W / 12) * c + GAME_W / 24;
      g.fillStyle(0xff6b35, 0.9);
      g.fillRoundedRect(cx - 5, HORIZON_Y - 2, 10, 16, 2);
    }

    // ── 10. 30-Yard Fielding Circle ───────────────────────────────────────────
    g.lineStyle(2, 0xffffff, 0.16);
    g.strokeEllipse(CENTER_X, (PITCH_TOP_Y + PITCH_BOT_Y) / 2 + 20,
      GAME_W * 0.83, (PITCH_BOT_Y - PITCH_TOP_Y) * 1.3);

    // ── 11. Infield Area (Groomed) ────────────────────────────────────────────
    g.fillStyle(0x15803d, 0.22);
    g.fillEllipse(CENTER_X, (PITCH_TOP_Y + PITCH_BOT_Y) / 2 + 20,
      GAME_W * 0.6, (PITCH_BOT_Y - PITCH_TOP_Y) * 0.98);

    // ── 12. Realistic Dirt Pitch ──────────────────────────────────────────────
    const pitchMidX = CENTER_X;

    // Subtle depth shadow behind pitch
    g.fillStyle(0x0d0a05, 0.35);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2 - 7, PITCH_TOP_Y - 3);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2 + 7, PITCH_TOP_Y - 3);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2 + 9, PITCH_BOT_Y + 5);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2 - 9, PITCH_BOT_Y + 5);
    g.closePath();
    g.fillPath();

    // Main pitch — warm amber clay gradient
    g.fillGradientStyle(0x8b5e26, 0x8b5e26, 0xc4923b, 0xc4923b, 1);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.closePath();
    g.fillPath();

    // Pitch side edge shading (3D depth)
    g.fillStyle(0x5c3a14, 0.45);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX - PITCH_TOP_W / 2 - 7, PITCH_TOP_Y + 6);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2 - 9, PITCH_BOT_Y + 5);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x5c3a14, 0.45);
    g.beginPath();
    g.moveTo(pitchMidX + PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2 + 7, PITCH_TOP_Y + 6);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2 + 9, PITCH_BOT_Y + 5);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.closePath();
    g.fillPath();

    // Grass patches at pitch ends (crease areas)
    g.fillStyle(0x15803d, 0.52);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2 + 4, PITCH_TOP_Y + 22);
    g.lineTo(pitchMidX - PITCH_TOP_W / 2 - 4, PITCH_TOP_Y + 22);
    g.closePath();
    g.fillPath();

    const progBot = (PITCH_BOT_Y - 25 - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y);
    const botGrassW = PITCH_TOP_W + (PITCH_BOT_W - PITCH_TOP_W) * progBot;
    g.fillStyle(0x15803d, 0.48);
    g.beginPath();
    g.moveTo(pitchMidX - botGrassW / 2, PITCH_BOT_Y - 25);
    g.lineTo(pitchMidX + botGrassW / 2, PITCH_BOT_Y - 25);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.closePath();
    g.fillPath();

    // Worn batting-crease scuff patches
    g.fillStyle(0x7a4e1a, 0.28);
    for (let f = 0; f < 16; f++) {
      const fy = PITCH_TOP_Y + 18 + f * 20;
      const prog = (fy - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y);
      const curW = PITCH_TOP_W + (PITCH_BOT_W - PITCH_TOP_W) * prog;
      const fx = pitchMidX + Math.sin(f * 51.7 + 0.5) * 0.25 * (curW / 2);
      g.fillEllipse(fx, fy, 10 + Math.sin(f * 17.3) * 4, 3 + Math.cos(f * 23.1) * 1.5);
    }

    // Center repair line
    g.lineStyle(1, 0xa07030, 0.22);
    g.beginPath();
    g.moveTo(pitchMidX, PITCH_TOP_Y + 18);
    g.lineTo(pitchMidX, PITCH_BOT_Y - 15);
    g.strokePath();

    // ── 13. Crease Markings ───────────────────────────────────────────────────
    // Helper to interpolate pitch width at a given Y
    const pitchWAtY = (y: number) => {
      const p = (y - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y);
      return PITCH_TOP_W + (PITCH_BOT_W - PITCH_TOP_W) * Phaser.Math.Clamp(p, 0, 1);
    };

    // BOWLING END (top) — bowling crease + popping crease + return creases
    const bowlCreaseY = PITCH_TOP_Y + 22;
    const bowlCreaseHW = pitchWAtY(bowlCreaseY) / 2 + 14;
    g.lineStyle(3, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(pitchMidX - bowlCreaseHW, bowlCreaseY);
    g.lineTo(pitchMidX + bowlCreaseHW, bowlCreaseY);
    g.strokePath();

    const bowlPoppingY = bowlCreaseY + 14;
    const bowlPoppingHW = pitchWAtY(bowlPoppingY) / 2 + 8;
    g.lineStyle(2.5, 0xffffff, 0.88);
    g.beginPath();
    g.moveTo(pitchMidX - bowlPoppingHW - 12, bowlPoppingY);
    g.lineTo(pitchMidX - bowlPoppingHW, bowlPoppingY);
    g.moveTo(pitchMidX + bowlPoppingHW, bowlPoppingY);
    g.lineTo(pitchMidX + bowlPoppingHW + 12, bowlPoppingY);
    g.strokePath();

    g.lineStyle(2, 0xffffff, 0.82);
    g.beginPath();
    g.moveTo(pitchMidX - bowlCreaseHW, bowlCreaseY);
    g.lineTo(pitchMidX - bowlCreaseHW, bowlPoppingY + 10);
    g.moveTo(pitchMidX + bowlCreaseHW, bowlCreaseY);
    g.lineTo(pitchMidX + bowlCreaseHW, bowlPoppingY + 10);
    g.strokePath();

    // BATTING END (bottom) — batting crease + popping crease + return creases
    const batCreaseY = PITCH_BOT_Y - 30;
    const batCreaseHW = pitchWAtY(batCreaseY) / 2 + 14;
    g.lineStyle(3.5, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(pitchMidX - batCreaseHW, batCreaseY);
    g.lineTo(pitchMidX + batCreaseHW, batCreaseY);
    g.strokePath();

    const batPoppingY = batCreaseY - 18;
    const batPoppingHW = pitchWAtY(batPoppingY) / 2 + 8;
    g.lineStyle(3, 0xffffff, 0.92);
    g.beginPath();
    g.moveTo(pitchMidX - batPoppingHW + 12, batPoppingY);
    g.lineTo(pitchMidX + batPoppingHW - 12, batPoppingY);
    g.strokePath();

    g.lineStyle(2.5, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(pitchMidX - batCreaseHW + 14, batPoppingY - 6);
    g.lineTo(pitchMidX - batCreaseHW + 14, batCreaseY + 14);
    g.moveTo(pitchMidX + batCreaseHW - 14, batPoppingY - 6);
    g.lineTo(pitchMidX + batCreaseHW - 14, batCreaseY + 14);
    g.strokePath();
  }

  private generateTextures() {
    const g = this.add.graphics();

    // ── 1. Realistic Cricket Ball (64×64) ─────────────────────────────────────
    g.clear();
    // Dark base sphere
    g.fillStyle(0x6b0d0d, 1);
    g.fillCircle(32, 32, 30);
    // Mid-tone red (most of sphere)
    g.fillStyle(0xb91c1c, 0.85);
    g.fillCircle(30, 30, 25);
    // Bright red lit area
    g.fillStyle(0xdc2626, 0.78);
    g.fillCircle(27, 26, 18);
    // Bright highlight area
    g.fillStyle(0xe53535, 0.55);
    g.fillCircle(23, 22, 11);
    // Scuff patch (old ball one side)
    g.fillStyle(0x4a0a0a, 0.35);
    g.fillEllipse(42, 34, 14, 20);
    // Outer seam arc (upper)
    g.lineStyle(2, 0xfcd34d, 0.92);
    g.beginPath();
    g.arc(32, 32, 22, -0.5, Math.PI + 0.5, false);
    g.strokePath();
    // Outer seam arc (lower)
    g.lineStyle(1.5, 0xfcd34d, 0.78);
    g.beginPath();
    g.arc(32, 32, 22, Math.PI - 0.5, Math.PI * 2 + 0.5, false);
    g.strokePath();
    // Inner seam arc (cross-seam)
    g.lineStyle(1.5, 0xfcd34d, 0.6);
    g.beginPath();
    g.arc(32, 18, 16, 0.2, Math.PI - 0.2, false);
    g.strokePath();
    g.beginPath();
    g.arc(32, 46, 16, Math.PI + 0.2, Math.PI * 2 - 0.2, false);
    g.strokePath();
    // Stitch marks on seam
    g.lineStyle(1, 0xfde68a, 0.8);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      const r1 = 20, r2 = 24;
      const sx = 32 + r1 * Math.cos(a);
      const sy = 32 + r1 * Math.sin(a);
      const ex = 32 + r2 * Math.cos(a);
      const ey = 32 + r2 * Math.sin(a);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.strokePath();
    }
    // Specular catchlight (315° — upper-left)
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(20, 17, 14, 9);
    g.fillStyle(0xffffff, 0.88);
    g.fillEllipse(18, 15, 7, 5);
    g.generateTexture('tex_ball', 64, 64);

    // ── 2. Ball trail particle ─────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('tex_particle', 8, 8);

    // ── 3. Pitch bounce dust particle ─────────────────────────────────────────
    g.clear();
    g.fillStyle(0xd97706, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('tex_dust', 6, 6);

    // ── 4. Fielder Sprite (80×130) ────────────────────────────────────────────
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(40, 127, 50, 10);
    // Shoes
    g.fillStyle(0xfafafa, 1);
    g.fillRoundedRect(25, 112, 20, 12, 3);
    g.fillRoundedRect(48, 112, 20, 12, 3);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(25, 118, 20, 6);
    g.fillRect(48, 118, 20, 6);
    // Trousers
    g.fillStyle(0xf1f5f9, 1);
    g.fillRect(28, 85, 20, 30);
    g.fillRect(52, 85, 20, 30);
    g.fillRoundedRect(25, 75, 50, 15, 3);
    // Jersey
    g.fillStyle(0x1d4ed8, 1);
    g.fillRoundedRect(22, 40, 36, 38, 5);
    // Collar
    g.fillStyle(0x1e3a8a, 1);
    g.fillRoundedRect(33, 37, 14, 8, 3);
    // Arms
    g.fillStyle(0x1d4ed8, 1);
    g.fillRoundedRect(6, 42, 18, 26, 4);
    g.fillRoundedRect(56, 42, 18, 26, 4);
    // Head
    g.fillStyle(0xfbbf87, 1);
    g.fillCircle(40, 22, 16);
    // Cap
    g.fillStyle(0x1e3a8a, 1);
    g.beginPath();
    g.arc(40, 20, 16, Math.PI, 0);
    g.fill();
    g.fillRect(24, 20, 8, 5);
    g.generateTexture('tex_fielder', 80, 130);

    // ── 5. Bowler Sprite (110×180) ────────────────────────────────────────────
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(55, 177, 70, 12);
    // Shoes
    g.fillStyle(0xfafafa, 1);
    g.fillRoundedRect(22, 160, 28, 14, 3);
    g.fillRoundedRect(62, 160, 28, 14, 3);
    g.fillStyle(0x151515, 1);
    g.fillRect(22, 168, 28, 6);
    g.fillRect(62, 168, 28, 6);
    // Trousers
    g.fillStyle(0xfafafa, 1);
    g.fillRect(26, 120, 26, 44);
    g.fillRect(60, 120, 26, 44);
    g.fillRoundedRect(22, 108, 66, 16, 4);
    // Jersey (bowling team — red)
    g.fillStyle(0xb91c1c, 1);
    g.fillRoundedRect(18, 60, 74, 52, 7);
    g.fillStyle(0x991b1b, 1);
    g.fillRect(18, 62, 10, 48);
    g.fillRect(82, 62, 10, 48);
    // Collar
    g.fillStyle(0x7f1d1d, 1);
    g.fillRoundedRect(42, 57, 26, 10, 4);
    // Arms (bowling action — left arm up, right arm follow-through)
    g.fillStyle(0xb91c1c, 1);
    g.fillRoundedRect(0, 65, 20, 45, 5);   // Left arm (front, lower)
    g.fillRoundedRect(90, 55, 20, 40, 5);  // Right arm (back, higher — delivery arm)
    // Delivery hand/ball indicator
    g.fillStyle(0xdc2626, 0.8);
    g.fillCircle(96, 52, 8);
    // Head & cap
    g.fillStyle(0xfbbf87, 1);
    g.fillCircle(55, 32, 22);
    g.fillStyle(0x7f1d1d, 1);
    g.beginPath();
    g.arc(55, 30, 22, Math.PI, 0);
    g.fill();
    g.fillRect(28, 30, 10, 7);
    // Face detail
    g.fillStyle(0xe0a070, 1);
    g.fillRect(44, 34, 22, 14);
    g.generateTexture('tex_bowler', 110, 180);

    // ── 6. Batsman Sprite (180×290) ───────────────────────────────────────────
    g.clear();
    // Ground shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(90, 286, 100, 14);
    // SHOES — cricket spikes
    g.fillStyle(0xfafafa, 1);
    g.fillRoundedRect(50, 265, 36, 18, 4);  // Left boot
    g.fillRoundedRect(96, 265, 40, 18, 4);  // Right boot (front foot, wider stance)
    g.fillStyle(0x0f172a, 1);
    g.fillRect(50, 276, 36, 7);
    g.fillRect(96, 276, 40, 7);
    // Spike dots
    g.fillStyle(0x334155, 1);
    for (let sp = 0; sp < 4; sp++) {
      g.fillCircle(54 + sp * 9, 282, 2);
      g.fillCircle(100 + sp * 9, 282, 2);
    }

    // PADS (white, left and right leg)
    g.fillStyle(0xf5f7fa, 1);
    g.fillRoundedRect(47, 180, 38, 90, 6);  // Left pad
    g.fillRoundedRect(93, 185, 40, 85, 6);  // Right pad (front leg, more visible)
    // Pad highlights (3D curved surface)
    g.fillStyle(0xffffff, 0.55);
    g.fillRect(50, 182, 9, 88);
    g.fillRect(96, 187, 10, 83);
    // Pad straps (3 per pad, horizontal bands)
    g.fillStyle(0x1e40af, 1);
    for (let strap = 0; strap < 3; strap++) {
      const sy = 195 + strap * 24;
      g.fillRoundedRect(47, sy, 38, 5, 2);
      g.fillRoundedRect(93, sy + 2, 40, 5, 2);
    }
    // Pad knee roll (3D bump at top)
    g.fillStyle(0xe8eaed, 1);
    g.fillEllipse(66, 183, 42, 14);
    g.fillEllipse(113, 188, 44, 14);

    // THIGH PAD
    g.fillStyle(0xd1d5db, 0.75);
    g.fillEllipse(82, 178, 50, 16);

    // BATTING TROUSERS
    g.fillStyle(0xedf0f3, 1);
    g.fillRoundedRect(44, 150, 92, 38, 5);

    // ABDOMEN GUARD hint
    g.fillStyle(0xc8ccd2, 0.5);
    g.fillEllipse(90, 163, 28, 14);

    // JERSEY — India Blue (customizable)
    const jColor = 0x0f4c9e;  // Deep India blue
    g.fillStyle(jColor, 1);
    g.fillRoundedRect(38, 88, 104, 68, 9);
    // Jersey side panels
    g.fillStyle(0x083d8a, 0.6);
    g.fillRect(38, 90, 16, 64);
    g.fillRect(126, 90, 16, 64);
    // Jersey collar (V-neck)
    g.fillStyle(0x083d8a, 1);
    g.fillRoundedRect(76, 85, 28, 12, 4);
    // BCCI/sponsor crest area
    g.fillStyle(0xfbbf24, 0.95);
    g.fillRoundedRect(68, 106, 44, 30, 5);
    g.fillStyle(0xffd700, 1);
    g.fillCircle(90, 118, 8);  // Circular logo
    g.fillStyle(0x0f4c9e, 1);
    g.fillCircle(90, 118, 5);

    // LEFT ARM (top hand — holding bat, foreground)
    g.fillStyle(jColor, 1);
    g.fillRoundedRect(14, 92, 26, 65, 6);   // Upper arm
    g.fillRoundedRect(8, 148, 24, 38, 5);   // Lower arm/wrist

    // RIGHT ARM (bottom hand — further arm)
    g.fillStyle(jColor, 1);
    g.fillRoundedRect(140, 94, 26, 55, 6);  // Upper arm
    g.fillRoundedRect(144, 140, 22, 32, 5); // Lower arm

    // BATTING GLOVES
    g.fillStyle(0xe8eaed, 1);
    g.fillRoundedRect(5, 182, 34, 28, 6);  // Left glove (top hand)
    g.fillRoundedRect(144, 168, 30, 24, 5);// Right glove (bottom hand)
    // Glove knuckle protection
    g.fillStyle(0x374151, 1);
    for (let fi = 0; fi < 4; fi++) {
      g.fillRoundedRect(8 + fi * 7, 185, 5, 10, 2);
    }
    // Glove wrist strap
    g.fillStyle(0x1e40af, 1);
    g.fillRect(5, 203, 34, 5);
    g.fillRect(144, 186, 30, 5);

    // BAT (in guard position, resting beside left leg)
    // Handle grip (dark rubber)
    g.fillStyle(0x1c1917, 1);
    g.fillRoundedRect(0, 160, 16, 60, 3);
    // Grip tape texture
    g.lineStyle(1.5, 0x44403c, 0.7);
    for (let t = 0; t < 7; t++) {
      g.beginPath();
      g.moveTo(0, 165 + t * 8);
      g.lineTo(16, 165 + t * 7);
      g.strokePath();
    }
    // Handle throat
    g.fillStyle(0x92400e, 1);
    g.fillRoundedRect(0, 218, 16, 10, 3);
    // Blade — willow (light wood)
    g.fillStyle(0xfef3c7, 1);
    g.fillRect(0, 228, 22, 56);
    // Wood grain
    g.lineStyle(0.8, 0xe5c97a, 0.4);
    for (let wg = 0; wg < 7; wg++) {
      g.beginPath();
      g.moveTo(0, 234 + wg * 7);
      g.lineTo(22, 234 + wg * 7);
      g.strokePath();
    }
    // Bevel edge (3D effect)
    g.fillStyle(0xca8a04, 0.55);
    g.fillRect(17, 228, 5, 56);
    // Sponsor sticker
    g.fillStyle(0xef4444, 1);
    g.fillRect(2, 238, 15, 26);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(4, 244, 11, 3);
    g.fillRect(4, 252, 11, 3);
    // Toe guard
    g.fillStyle(0x0f172a, 1);
    g.fillRect(0, 280, 22, 5);
    // Blade edge highlight
    g.fillStyle(0xfef9c3, 0.65);
    g.fillRect(0, 228, 4, 56);

    // NECK skin
    g.fillStyle(0xfbbf87, 1);
    g.fillRect(80, 72, 22, 20);

    // HELMET ─ gloss navy ABS plastic
    // Helmet dome
    g.fillStyle(0x0a172e, 1);
    g.fillCircle(90, 46, 32);
    // Dome highlight (glossy)
    g.fillStyle(0x1e3a6a, 0.45);
    g.fillCircle(78, 32, 16);
    g.fillStyle(0x2d5296, 0.25);
    g.fillCircle(72, 27, 10);
    // Helmet peak
    g.fillStyle(0x0a172e, 1);
    g.fillRect(56, 46, 32, 12);
    // Peak underside shadow
    g.fillStyle(0x000000, 0.4);
    g.fillRect(56, 52, 32, 6);

    // FACE GRILL (titanium/steel bars)
    // 4 horizontal bars
    g.lineStyle(2.8, 0x9ca3af, 0.92);
    for (let bar = 0; bar < 4; bar++) {
      const by = 52 + bar * 7;
      g.beginPath();
      g.moveTo(58, by);
      g.lineTo(90, by);
      g.strokePath();
    }
    // 3 vertical bars
    g.lineStyle(2, 0x9ca3af, 0.75);
    for (let vb = 0; vb < 4; vb++) {
      g.beginPath();
      g.moveTo(62 + vb * 7, 50);
      g.lineTo(62 + vb * 7, 76);
      g.strokePath();
    }
    // Face skin visible through grill
    g.fillStyle(0xfbbf87, 0.82);
    g.fillRoundedRect(60, 52, 28, 22, 3);
    // Eyes
    g.fillStyle(0x1e293b, 1);
    g.fillCircle(67, 59, 3.5);
    g.fillCircle(78, 59, 3.5);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(69, 58, 1.5);
    g.fillCircle(80, 58, 1.5);

    // Neck guard (dangling chin protector)
    g.fillStyle(0x0a172e, 0.85);
    g.fillRoundedRect(74, 74, 30, 14, 4);
    // Padding detail
    g.lineStyle(1, 0x1e3a6a, 0.6);
    g.beginPath();
    g.moveTo(78, 79);
    g.lineTo(100, 79);
    g.strokePath();

    g.generateTexture('tex_batsman', 180, 290);

    // ── 7. Cricket Bat Sprite (20×110) ───────────────────────────────────────
    g.clear();
    // Grip (dark rubber, textured)
    g.fillStyle(0x1c1917, 1);
    g.fillRoundedRect(3, 0, 14, 30, 3);
    g.lineStyle(1.5, 0x44403c, 0.7);
    for (let t = 0; t < 6; t++) {
      g.beginPath();
      g.moveTo(3, 3 + t * 5);
      g.lineTo(17, 3 + t * 4);
      g.strokePath();
    }
    // Throat
    g.fillStyle(0x78350f, 1);
    g.fillRoundedRect(1, 28, 18, 9, 3);
    // Blade
    g.fillStyle(0xfef3c7, 1);
    g.fillRect(0, 37, 20, 65);
    // Wood grain
    g.lineStyle(0.8, 0xe5c97a, 0.4);
    for (let wg = 0; wg < 9; wg++) {
      g.beginPath();
      g.moveTo(0, 43 + wg * 7);
      g.lineTo(20, 43 + wg * 7);
      g.strokePath();
    }
    // Bevel
    g.fillStyle(0xca8a04, 0.55);
    g.fillRect(16, 37, 4, 65);
    // Sponsor
    g.fillStyle(0xef4444, 1);
    g.fillRect(2, 46, 14, 28);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(4, 52, 10, 3);
    g.fillRect(4, 59, 10, 3);
    // Toe guard
    g.fillStyle(0x0f172a, 1);
    g.fillRect(0, 98, 20, 5);
    // Highlight
    g.fillStyle(0xfef9c3, 0.6);
    g.fillRect(0, 37, 3, 65);
    g.generateTexture('tex_bat', 20, 106);

    // ── 8. Crowd sprites (5 color variants, 26×34) ────────────────────────────
    const crowdColors = [0xf43f5e, 0x3b82f6, 0xeab308, 0xa855f7, 0x22c55e,
                         0xfb923c, 0x06b6d4, 0xe11d48, 0x4ade80, 0xfacc15];
    crowdColors.forEach((color, idx) => {
      g.clear();
      // Body
      g.fillStyle(color, 1);
      g.fillRoundedRect(4, 12, 18, 18, 4);
      // Arms raised (reacting)
      g.fillStyle(color, 0.8);
      if (idx % 2 === 0) {
        g.fillRoundedRect(0, 10, 6, 14, 3);
        g.fillRoundedRect(20, 8, 6, 16, 3);
      } else {
        g.fillRoundedRect(1, 12, 5, 12, 3);
        g.fillRoundedRect(20, 10, 5, 14, 3);
      }
      // Head
      g.fillStyle(0xfbbf87, 1);
      g.fillCircle(13, 6, 7);
      // Hat or hair
      g.fillStyle(idx % 3 === 0 ? 0x1e3a8a : (idx % 3 === 1 ? 0x0f172a : color), 1);
      g.beginPath();
      g.arc(13, 5, 7, Math.PI, 0);
      g.fill();
      g.generateTexture(`tex_crowd_${idx}`, 26, 34);
    });

    // ── 9. Confetti ───────────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 12);
    g.generateTexture('tex_confetti', 8, 12);

    // ── 10. Bounce flash ─────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xfff8e0, 1);
    g.fillCircle(12, 12, 12);
    g.generateTexture('tex_bounce_flash', 24, 24);

    g.destroy();
  }

  private drawCrowd() {
    this.crowdSprites = [];
    const rows = [-8, -24, -42, -60];
    for (const yOffset of rows) {
      const count = 65;
      for (let i = 0; i < count; i++) {
        const cx = (GAME_W / count) * i + (Math.sin(i * 37) * 4);
        const cy = HORIZON_Y + yOffset + Math.sin(i * 77) * 4;
        const colorIdx = Math.floor(Math.abs(Math.sin(i * 31 + yOffset)) * 10);
        const scale = 0.55 + Math.abs(Math.sin(i * 17)) * 0.35;
        const sprite = this.add.sprite(cx, cy, `tex_crowd_${colorIdx % 10}`).setScale(scale);
        sprite.setAlpha(0.72 + Math.random() * 0.28);
        this.crowdSprites.push(sprite);

        // Subtle idle sway tween
        this.tweens.add({
          targets: sprite,
          y: cy - (2 + Math.random() * 3),
          duration: 1800 + Math.random() * 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: Math.random() * 2000
        });
      }
    }
  }

  private crowdReact(intensity: 'mild' | 'strong' | 'max') {
    const sample = intensity === 'max' ? this.crowdSprites :
                   intensity === 'strong' ? this.crowdSprites.filter((_, i) => i % 2 === 0) :
                   this.crowdSprites.filter((_, i) => i % 4 === 0);
    const jumpH = intensity === 'max' ? 18 : intensity === 'strong' ? 12 : 6;
    const dur = intensity === 'max' ? 280 : 200;

    sample.forEach((sprite, i) => {
      this.time.delayedCall(i * 2, () => {
        this.tweens.add({
          targets: sprite,
          y: sprite.y - jumpH,
          scaleY: sprite.scaleY * 1.15,
          duration: dur,
          yoyo: true,
          ease: 'Quad.easeOut'
        });
      });
    });
  }

  private createPlayers() {
    // ── Fielders in Authentic Balanced Cricket Positions ───────────────────
    const fieldingPositions = [
      { x: CENTER_X + 130, y: HORIZON_Y + 75 },  // Mid-Off (close off-side)
      { x: CENTER_X - 130, y: HORIZON_Y + 75 },  // Mid-On (close leg-side)
      { x: CENTER_X + 250, y: HORIZON_Y + 140 }, // Extra Cover (30-yard off-side)
      { x: CENTER_X - 250, y: HORIZON_Y + 140 }, // Mid-Wicket (30-yard leg-side)
      { x: CENTER_X + 340, y: HORIZON_Y + 235 }, // Cover Point (square off-side)
      { x: CENTER_X - 340, y: HORIZON_Y + 235 }, // Square Leg (square leg-side)
      { x: CENTER_X + 300, y: HORIZON_Y + 35 },  // Deep Long-Off (boundary)
      { x: CENTER_X - 300, y: HORIZON_Y + 35 },  // Deep Long-On (boundary)
    ];

    this.fielders = [];
    for (const pos of fieldingPositions) {
      const progress = Phaser.Math.Clamp((pos.y - HORIZON_Y) / (GAME_H - HORIZON_Y), 0, 1);
      const scale = 0.28 + progress * 0.22;
      const depth = 8 + Math.floor(progress * 4);

      const fielder = this.add.sprite(pos.x, pos.y, 'tex_fielder')
        .setScale(scale)
        .setDepth(depth);
      fielder.setData('startX', pos.x);
      fielder.setData('startY', pos.y);
      fielder.setData('startScale', scale);
      this.fielders.push(fielder);
    }

    if (this.role === 'batting') {
      this.bowlerRestX = CENTER_X - 45;
      this.bowlerRestY = PITCH_TOP_Y - 48;
      this.bowler = this.add.sprite(this.bowlerRestX, this.bowlerRestY, 'tex_bowler').setScale(0.38).setDepth(10);
      this.nonStriker = this.add.sprite(CENTER_X + 45, PITCH_TOP_Y - 18, 'tex_batsman').setScale(0.18).setDepth(10);
      this.keeper = this.add.sprite(CENTER_X, PITCH_BOT_Y + 18, 'tex_fielder').setScale(0.40).setDepth(11).setVisible(false);
      this.batsman = this.add.sprite(CENTER_X - 35, PITCH_BOT_Y - 42, 'tex_batsman').setScale(0.34).setDepth(11);
      this.bat = this.add.sprite(CENTER_X - 8, PITCH_BOT_Y - 30, 'tex_bat')
        .setOrigin(0.5, 0).setScale(0.34).setAngle(-30).setDepth(12).setVisible(false);
    } else {
      // Bowling view: Decreased foreground player sizes with clear space for middle stumps
      this.bowlerRestX = CENTER_X - 80;
      this.bowlerRestY = PITCH_BOT_Y - 35;
      this.bowler = this.add.sprite(this.bowlerRestX, this.bowlerRestY, 'tex_bowler').setScale(0.62).setDepth(11);
      this.nonStriker = this.add.sprite(CENTER_X + 85, PITCH_BOT_Y - 40, 'tex_batsman').setScale(0.34).setDepth(11);
      this.keeper = this.add.sprite(CENTER_X, PITCH_TOP_Y - 32, 'tex_fielder').setScale(0.24).setDepth(9);
      this.batsman = this.add.sprite(CENTER_X - 14, PITCH_TOP_Y - 18, 'tex_batsman').setScale(0.18).setDepth(10);
      this.bat = this.add.sprite(CENTER_X - 3, PITCH_TOP_Y - 11, 'tex_bat')
        .setOrigin(0.5, 0).setScale(0.18).setAngle(-30).setDepth(11).setVisible(false);
    }

    // ── Stumps: 3 cylindrical with bails ─────────────────────────────────────
    this.batsmanStumps = this.add.graphics();
    this.batsmanStumps.setPosition(CENTER_X, this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y);
    this.batsmanStumps.setDepth(5);

    this.bowlerStumps = this.add.graphics();
    this.bowlerStumps.setPosition(CENTER_X, this.role === 'bowling' ? PITCH_BOT_Y : PITCH_TOP_Y);
    this.bowlerStumps.setDepth(5);

    // Bail objects (separate for animation)
    this.bail1 = this.add.graphics().setDepth(6);
    this.bail2 = this.add.graphics().setDepth(6);

    this.redrawStumps();
    this.redrawBails();

    // Ball Shadow
    this.ballShadow = this.add.graphics();
    this.ballShadow.fillStyle(0x000000, 0.38);
    this.ballShadow.fillEllipse(0, 0, 18, 9);
    this.ballShadow.setDepth(10);
    this.ballShadow.setVisible(false);

    // Ball
    this.ball = this.add.sprite(this.bowler.x, this.bowler.y, 'tex_ball').setVisible(false);
    this.ball.setDepth(12);

    // Trail emitter
    this.trailEmitter = this.add.particles(0, 0, 'tex_particle', {
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.75, end: 0 },
      lifespan: 180,
      tint: 0xff4500,
      frequency: 18,
      blendMode: 'ADD'
    }).setDepth(11);
    this.trailEmitter.stop();

    // Dust emitter
    this.dustEmitter = this.add.particles(0, 0, 'tex_dust', {
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 320,
      gravityY: -45,
      speed: { min: 18, max: 42 },
      angle: { min: 0, max: 360 }
    }).setDepth(9);
    this.dustEmitter.stop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STUMP & BAIL DRAWING
  // ─────────────────────────────────────────────────────────────────────────────

  private drawStumpsOn(gfx: Phaser.GameObjects.Graphics, near: boolean) {
    gfx.clear();
    const h = near ? 50 : 18;
    const gap = near ? 15 : 8;
    const sw = near ? 5 : 2.5;
    const bevelColor = near ? 0xe6c664 : 0xd4a73a;
    const woodColor = near ? 0xd4a237 : 0xb8882c;
    const shadowCol = near ? 0x7a5e0e : 0x5a4410;

    for (let s = -1; s <= 1; s++) {
      const sx = s * gap;
      // Shadow
      gfx.fillStyle(shadowCol, 0.35);
      gfx.fillRoundedRect(sx + sw / 2, -h, 2, h, 1);
      // Main wood stump body
      gfx.fillStyle(woodColor, 1);
      gfx.fillRoundedRect(sx - sw / 2, -h, sw, h, 2);
      // Highlight (3D roundness)
      gfx.fillStyle(bevelColor, 0.55);
      gfx.fillRoundedRect(sx - sw / 2 + 1, -h + 1, sw / 2, h - 2, 1);
      // Base ring
      gfx.fillStyle(0x0f172a, 0.7);
      gfx.fillRect(sx - sw / 2 - 1, -2, sw + 2, 3);
    }
  }

  private redrawStumps() {
    const batsmanNear = this.role === 'bowling';
    this.drawStumpsOn(this.batsmanStumps, !batsmanNear);
    this.drawStumpsOn(this.bowlerStumps, batsmanNear);
  }

  private redrawBails() {
    const bailsY = this.role === 'bowling' ? PITCH_TOP_Y - 20 : PITCH_BOT_Y - 52;
    const near = this.role === 'batting';
    const gap = near ? 15 : 8;
    const bailW = near ? 16 : 8;
    const bailH = near ? 3 : 1.5;
    const bailColor = near ? 0xd4a237 : 0xb8882c;

    this.bail1.clear();
    this.bail1.setPosition(CENTER_X, bailsY);
    this.bail1.fillStyle(bailColor, 1);
    this.bail1.fillRoundedRect(-gap - bailW / 2, 0, bailW, bailH, 1);
    this.bail1.fillStyle(0xe6c664, 0.5);
    this.bail1.fillRect(-gap - bailW / 2 + 1, 0, bailW - 2, 1);

    this.bail2.clear();
    this.bail2.setPosition(CENTER_X, bailsY);
    this.bail2.fillStyle(bailColor, 1);
    this.bail2.fillRoundedRect(gap - bailW / 2, 0, bailW, bailH, 1);
    this.bail2.fillStyle(0xe6c664, 0.5);
    this.bail2.fillRect(gap - bailW / 2 + 1, 0, bailW - 2, 1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MULTIPLAYER — ALL PRESERVED IDENTICALLY
  // ─────────────────────────────────────────────────────────────────────────────

  private nameFor(seat: number | null | undefined): string {
    if (seat == null) return "Opponent";
    return this.namesBySeat[seat] ?? `Player ${seat + 1}`;
  }

  private setRole(newRole: "batting" | "bowling") {
    if (this.role === newRole) return;
    this.role = newRole;
    this.hud.setRole(newRole);
    this.repositionForRole();
    this.redrawStumps();
    this.redrawBails();
    this.resetBatsmenPositions();
  }

  private repositionForRole() {
    if (this.role === "batting") {
      this.bowlerRestX = CENTER_X - 45;
      this.bowlerRestY = PITCH_TOP_Y - 48;
      this.bowler.setPosition(this.bowlerRestX, this.bowlerRestY).setScale(0.38).setDepth(10);
      this.nonStriker.setPosition(CENTER_X + 45, PITCH_TOP_Y - 18).setScale(0.18).setDepth(10);
      this.keeper.setPosition(CENTER_X, PITCH_BOT_Y + 18).setScale(0.40).setDepth(11).setVisible(false);
      this.batsman.setPosition(CENTER_X - 35, PITCH_BOT_Y - 42).setScale(0.34).setDepth(11);
      this.bat.setPosition(CENTER_X - 8, PITCH_BOT_Y - 30).setScale(0.34).setDepth(12).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, PITCH_BOT_Y).setScale(1).setAngle(0).setDepth(5);
      this.bowlerStumps.setPosition(CENTER_X, PITCH_TOP_Y).setScale(1).setAngle(0).setDepth(5);
      this.bail1.setPosition(CENTER_X, PITCH_BOT_Y - 52).setScale(1).setAngle(0);
      this.bail2.setPosition(CENTER_X, PITCH_BOT_Y - 52).setScale(1).setAngle(0);
    } else {
      // Bowling view: Decreased foreground player sizes with clear space for middle stumps
      this.bowlerRestX = CENTER_X - 80;
      this.bowlerRestY = PITCH_BOT_Y - 35;
      this.bowler.setPosition(this.bowlerRestX, this.bowlerRestY).setScale(0.62).setDepth(11);
      this.nonStriker.setPosition(CENTER_X + 85, PITCH_BOT_Y - 40).setScale(0.34).setDepth(11);
      this.keeper.setPosition(CENTER_X, PITCH_TOP_Y - 32).setScale(0.24).setDepth(9);
      this.batsman.setPosition(CENTER_X - 14, PITCH_TOP_Y - 18).setScale(0.18).setDepth(10);
      this.bat.setPosition(CENTER_X - 3, PITCH_TOP_Y - 11).setScale(0.18).setDepth(11).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, PITCH_TOP_Y).setScale(1).setAngle(0).setDepth(5);
      this.bowlerStumps.setPosition(CENTER_X, PITCH_BOT_Y).setScale(1).setAngle(0).setDepth(5);
      this.bail1.setPosition(CENTER_X, PITCH_TOP_Y - 20).setScale(0.6).setAngle(0);
      this.bail2.setPosition(CENTER_X, PITCH_TOP_Y - 20).setScale(0.6).setAngle(0);
    }

    for (const fielder of this.fielders) {
      const startX = fielder.getData('startX');
      const startY = fielder.getData('startY');
      const startScale = fielder.getData('startScale');
      if (startX !== undefined && startY !== undefined) {
        fielder.setPosition(startX, startY);
        if (startScale !== undefined) fielder.setScale(startScale);
      }
    }
  }

  private syncScoreboard(state: CricketState) {
    const score = state.inning === 1 ? state.team1Score : state.team2Score;
    const wkts = state.inning === 1 ? state.team1Wickets : state.team2Wickets;
    this.hud.updateScore(score, wkts);
    this.hud.setInnings(state.inning);
    this.hud.updateOvers(state.currentOver, state.currentBall, state.totalOvers);
    this.hud.setTarget(state.target);
    const ballsBowled = state.currentOver * 6 + state.currentBall;
    this.hud.setRunRate(ballsBowled > 0 ? score / (ballsBowled / 6) : 0);
  }

  private applyRemoteState(state: CricketState, events: { type: string }[]) {
    console.log("[CricketScene] applyRemoteState called, currentActor:", state.currentActor, "tossWinner:", state.tossWinner);

    this.remoteState = state;
    const store = useMultiplayerStore.getState();
    this.mySeat = store.mySeat;
    this.namesBySeat = {};
    for (const p of store.room?.players ?? []) {
      if (p.seat != null) this.namesBySeat[p.seat] = p.displayName;
    }

    if (state.currentActor === "toss") {
      console.log("[CricketScene] Toss phase - not applying game state yet");
      return;
    }

    if (state.tossWinner != null && state.battingFirst != null) {
      const battingName = this.namesBySeat[state.battingFirst] ?? `Player ${state.battingFirst + 1}`;
      const calledBy = this.namesBySeat[state.tossWinner] ?? `Player ${state.tossWinner + 1}`;
      console.log("[CricketScene] Toss completed:", calledBy, "won, batting first:", battingName);

      const isMyTurn = state.currentSeat === this.mySeat;
      if (isMyTurn) {
        this.hud.updateStatus(`You ${state.battingFirst === this.mySeat ? 'bat' : 'bowl'} first!`, "#34d399");
      } else {
        const opponentSeat = 1 - (this.mySeat ?? 0);
        const opponentName = this.namesBySeat[opponentSeat] ?? `Player ${opponentSeat + 1}`;
        this.hud.updateStatus(`${opponentName} ${state.battingFirst === opponentSeat ? 'bats' : 'bowls'} first!`, "#94a3b8");
      }

      if (!this.tossCompleteDisplayed) {
        this.tossCompleteDisplayed = true;
        this.time.delayedCall(2000, () => {
          if (this.remoteState && !this.remoteState.finished) {
            this.updateTurnStatus(this.remoteState);
          }
        });
      }

      if (state.inning === 1 && state.currentOver === 0 && state.currentBall === 0 && !state.pendingDelivery) {
        this.updateTurnStatus(state);
      }
    }

    const isBatting = this.mySeat != null && state.battingTeam === this.mySeat;
    const targetRole = this.mySeat == null ? "batting" : (isBatting ? "batting" : "bowling");

    const isInningsFlip = events.some(e => ["inning-change", "swap-roles", "role-change", "innings-break"].includes(e.type));

    if (isInningsFlip) {
      const ballResultEvent = events.find(e => e.type === "ball-result");
      if (ballResultEvent) {
        this.onRemoteBallResult(ballResultEvent as Record<string, unknown> & { type: string });
      }

      this.hud.setControlsState(true);
      this.isBowling = false;
      this.isHit = false;
      this.bowlerRunupActive = false;
      this.ball.setVisible(false);
      this.ballShadow.setVisible(false);
      this.trailEmitter.stop();
      this.overHistory = [];
      this.hud.updateOverHistory(this.overHistory);

      const targetScore = state.target ?? (state.team1Score + 1);
      this.hud.setTarget(targetScore);
      this.hud.updateStatus(`INNINGS 1 ENDED! Target: ${targetScore} runs to win.`, "#fbbf24");

      this.time.delayedCall(2000, () => {
        this.setRole(targetRole);
        this.syncScoreboard(state);
        if (!state.finished) {
          this.updateTurnStatus(state);
        }
      });
      return;
    }

    this.setRole(targetRole);
    this.syncScoreboard(state);

    for (const ev of events) {
      this.handleRemoteEvent(ev as Record<string, unknown> & { type: string });
    }

    if (state.currentActor === "batsman" && state.pendingDelivery && !this.isBowling) {
      this.executeBowl(state.pendingDelivery.delivery as CricketDelivery, state.pendingDelivery.power ?? 0.5);
      if (this.mySeat === state.battingTeam) {
        this.hud.setControlsState(false);
      }
    }

    if (state.finished) {
      this.multiplayerOver = true;
      this.hud.setControlsState(true);
    } else {
      this.updateTurnStatus(state);
    }
  }

  private tossCompleteDisplayed = false;

  private handleRemoteEvent(ev: { type: string } & Record<string, unknown>) {
    switch (ev.type) {
      case "ball-bowled":
        this.executeBowl(ev.delivery as CricketDelivery, (ev.power as number) ?? 0.5);
        if (this.mySeat === this.remoteState?.battingTeam) {
          this.hud.setControlsState(false);
        }
        break;
      case "shot-played":
        this.audioManager.playWhoosh();
        break;
      case "ball-result":
        this.onRemoteBallResult(ev);
        break;
      case "inning-change":
      case "role-change":
      case "innings-break":
      case "swap-roles":
        this.overHistory = [];
        this.hud.updateOverHistory(this.overHistory);
        break;
      case "target-chased":
        break;
      case "match-complete":
        this.onRemoteMatchComplete(ev);
        break;
      default:
        break;
    }
  }

  private onRemoteBallResult(ev: { type: string } & Record<string, unknown>) {
    this.isBowling = false;
    this.isHit = false;
    this.bowlerRunupActive = false;
    this.tweens.killTweensOf(this.ball);
    this.tweens.killTweensOf(this.ballShadow);
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);
    this.trailEmitter.stop();
    this.hud.setControlsState(true);
    this.playerHasSwung = false;

    const runs = (ev.runs as number) ?? 0;
    const isWicket = Boolean(ev.wicket);

    if (isWicket) {
      this.audioManager.playWicket();
      this.audioManager.playCrowdGroan();
      this.playWicketAnimation();
      this.hud.updateStatus((ev.comment as string) || "OUT! Bowled him!", "#f43f5e");
      this.overHistory.push("W");
      this.emitGameEvent('wicket');
      this.crowdReact('strong');
    } else if (runs >= 6) {
      this.audioManager.playCrowdRoar();
      this.createBalloons(runs);
      this.hud.updateStatus((ev.comment as string) || `SIX! 🚀`, "#34d399");
      this.hud.showRunIndicator(runs);
      this.overHistory.push(String(runs));
      this.emitGameEvent('six', { runs });
      this.crowdReact('max');
    } else if (runs >= 4) {
      this.audioManager.playCrowdRoar();
      this.createBalloons(runs);
      this.hud.updateStatus((ev.comment as string) || `FOUR! 🔥`, "#34d399");
      this.hud.showRunIndicator(runs);
      this.overHistory.push(String(runs));
      this.emitGameEvent('four', { runs });
      this.crowdReact('strong');
    } else if (runs > 0) {
      this.audioManager.playHit(400 + runs * 100);
      this.hud.updateStatus((ev.comment as string) || `${runs} RUNS!`, "#34d399");
      this.hud.showRunIndicator(runs);
      this.overHistory.push(String(runs));
      this.emitGameEvent('runs', { runs });
      this.autoRunBatsmen(runs);
      this.crowdReact('mild');
    } else {
      this.audioManager.playCrowdGroan();
      this.hud.updateStatus((ev.comment as string) || "Dot ball.", "#9ca3af");
      this.overHistory.push("0");
    }

    if (this.overHistory.length > 6) this.overHistory = this.overHistory.slice(-6);
    this.hud.updateOverHistory(this.overHistory);
  }

  private updateTurnStatus(state: CricketState) {
    if (state.currentActor === "toss") {
      console.log("[CricketScene] updateTurnStatus - toss phase, not updating controls");
      return;
    }

    if (this.mySeat == null) {
      this.hud.setControlsState(true);
      this.hud.updateStatus("Spectating...", "#94a3b8");
      return;
    }

    if (state.currentActor === "bowler") {
      if (this.mySeat === state.bowlingTeam) {
        this.hud.setControlsState(false);
        this.hud.updateStatus("Your turn to bowl!", "#fbbf24");
      } else {
        this.hud.setControlsState(true);
        this.hud.updateStatus(`Waiting for ${this.nameFor(state.bowlingTeam)} to bowl...`, "#94a3b8");
      }
    } else if (state.currentActor === "batsman") {
      if (this.mySeat === state.battingTeam) {
        this.hud.setControlsState(false);
        this.hud.updateStatus("Ready for the ball!", "#fbbf24");
      } else {
        this.hud.setControlsState(true);
        this.hud.updateStatus(`Waiting for ${this.nameFor(state.battingTeam)} to bat...`, "#94a3b8");
      }
    }
  }

  private onRemoteMatchComplete(ev: { type: string } & Record<string, unknown>) {
    this.audioManager.playCrowdRoar();
    this.createConfetti();
    this.crowdReact('max');
    const winner = (ev.winner as number | null) ?? null;
    const seats = (ev.winnerSeats as number[]) ?? [];
    if (seats.length === 0) {
      this.hud.updateStatus("Match tied!", "#fbbf24");
    } else if (winner === this.mySeat) {
      this.hud.updateStatus("YOU WIN THE MATCH!", "#34d399");
      this.fielders.forEach(f => this.jumpCelebrate(f));
      this.jumpCelebrate(this.batsman);
      this.jumpCelebrate(this.nonStriker);
    } else {
      this.hud.updateStatus(`${this.nameFor(winner)} wins the match!`, "#f43f5e");
    }
  }

  public callToss(call: "heads" | "tails"): void {
    console.log("[CricketScene] callToss:", call);
    if (this.multiplayerDriver) {
      this.multiplayerDriver.sendTossCall(call);
    }
  }

  private handleMatchComplete(state: CricketState) {
    console.log("[CricketScene] handleMatchComplete - winner:", state.winner, "mySeat:", this.mySeat);
    this.multiplayerOver = true;
    this.hud.setControlsState(true);

    this.audioManager.playCrowdRoar();
    this.createConfetti();
    this.crowdReact('max');

    if (state.winnerSeats.length === 0) {
      this.hud.updateStatus("Match tied!", "#fbbf24");
    } else if (state.winner === this.mySeat) {
      this.hud.updateStatus("YOU WIN THE MATCH!", "#34d399");
      this.fielders.forEach(f => this.jumpCelebrate(f));
      this.jumpCelebrate(this.batsman);
      this.jumpCelebrate(this.nonStriker);
    } else {
      const winnerName = this.namesBySeat[state.winner ?? 0] ?? "Opponent";
      this.hud.updateStatus(`${winnerName} wins the match!`, "#f43f5e");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BALL TIMER — PRESERVED
  // ─────────────────────────────────────────────────────────────────────────────

  private startNextBallTimer(seconds: number = 5) {
    if (this.wickets >= 1 || this.balls >= this.maxBalls || (this.role === 'batting' && this.runs >= this.targetScore)) return;

    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);

    if (this.mode === 'multiplayer') {
      if (this.role === 'batting') {
        this.hud.setControlsState(true);
        this.hud.updateStatus("Waiting for opponent to bowl...", "#94a3b8");
      } else {
        this.hud.updateStatus("Select a delivery to bowl!", "#fbbf24");
        this.hud.setControlsState(false);
      }
      return;
    }

    if (this.role === 'batting') {
      this.hud.setControlsState(true);
      let timeLeft = seconds;

      this.hud.updateStatus(`Next ball in ${timeLeft}...`, "#ffffff");

      if (this.nextBallTimerEvent) {
        this.nextBallTimerEvent.remove();
      }

      this.nextBallTimerEvent = this.time.addEvent({
        delay: 1000,
        repeat: seconds - 1,
        callback: () => {
          timeLeft--;
          if (timeLeft > 0) {
            this.hud.updateStatus(`Next ball in ${timeLeft}...`, "#ffffff");
          } else {
            this.aiBowlBall();
          }
        }
      });
    } else {
      this.hud.updateStatus("Select a delivery to bowl!", "#fbbf24");
      this.hud.setControlsState(false);
    }
  }

  private aiBowlBall() {
    if (this.wickets >= 1 || this.balls >= this.maxBalls) return;

    let rand = Math.random();
    if (this.balls < 6) {
      rand = 0.33 + Math.random() * 0.67;
    }

    let type: 'fast' | 'slow' | 'spin' = 'fast';
    if (rand < 0.33) type = 'fast';
    else if (rand < 0.66) type = 'slow';
    else type = 'spin';

    this.executeBowl(type);
    this.hud.setControlsState(false);
  }

  private playerBowl(type: 'fast' | 'slow' | 'spin', power: number) {
    if (this.isBowling || this.isHit || this.wickets >= 1 || this.balls >= this.maxBalls) return;

    this.hud.setControlsState(true);

    if (this.mode === 'multiplayer') {
      if (!this.multiplayerDriver?.canBowl()) {
        console.log("[CricketScene] playerBowl rejected - not my turn to bowl");
        this.hud.updateStatus("Not your turn to bowl!", "#f43f5e");
        return;
      }

      this.hud.updateStatus("Delivery sent! Waiting...", "#93c5fd");
      this.multiplayerDriver.sendBowlAction(type, power);
      return;
    }

    this.executeBowl(type, power);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOWLING — WITH RUN-UP ANIMATION
  // ─────────────────────────────────────────────────────────────────────────────

  private executeBowl(type: CricketDelivery, powerMultiplier: number = 1.0) {
    this.tweens.killTweensOf(this.ball);
    this.tweens.killTweensOf(this.ballShadow);
    this.tweens.killTweensOf(this.bowler);
    this.isBowling = true;   // Prevent re-entry
    this.bowlerRunupActive = true;  // Pause ball physics
    this.isHit = false;
    this.aiHasSwung = false;
    this.playerHasSwung = false;
    this.hasSteppedOut = false;
    this.ballAngle = 0;

    this.resetBatsmenPositions();

    // Reset visuals
    this.bat.setAngle(-30).setVisible(false);
    const bailsY = this.role === 'bowling' ? PITCH_TOP_Y - 20 : PITCH_BOT_Y - 52;
    this.bail1.setPosition(CENTER_X, bailsY).setAngle(0).setAlpha(1);
    this.bail2.setPosition(CENTER_X, bailsY).setAngle(0).setAlpha(1);
    this.batsmanStumps.setAngle(0).setPosition(CENTER_X, this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y);
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);

    this.deliveryType = type;
    const mult = 0.5 + powerMultiplier;

    // Calculate physics values based on delivery type
    if (type === 'fast') {
      const speed = (700 + Math.random() * 150) * mult;
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = -100 * mult;
      this.hud.updateStatus("Fast pace! Get ready!", "#fca5a5");
      this.audioManager.playWhoosh();
    } else if (type === 'slow') {
      const speed = (250 + Math.random() * 100) * mult;
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 300 * mult;
      this.hud.updateStatus("Slower ball... hold your swing.", "#93c5fd");
    } else if (type === 'yorker') {
      const speed = (600 + Math.random() * 100) * mult;
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = -150 * mult;
      this.hud.updateStatus("Yorker! Keep it low!", "#fbbf24");
    } else if (type === 'bouncer') {
      const speed = (550 + Math.random() * 150) * mult;
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 400 * mult;
      this.hud.updateStatus("Bouncer! Watch the short ball!", "#ef4444");
    } else if (type === 'swing') {
      const speed = (450 + Math.random() * 100) * mult;
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      this.ballVelocity = { x: this.spinDirection * 80, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 50 * mult;
      this.hud.updateStatus("Swing bowling! Watch the movement!", "#a855f7");
    } else {
      // spin
      const speed = (400 + Math.random() * 100) * mult;
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      this.ballVelocity = { x: this.spinDirection * 150, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 100 * mult;
      this.hud.updateStatus("Spin! Watch the curve!", "#fde047");
    }

    // Animate the run-up, then start ball physics
    this.animateBowlerRunup(() => {
      // Set ball start position at bowler's hand
      this.ballDepth = this.bowler.y;
      this.ballHeight = 60;
      this.ballVelocityZ = type === 'fast' ? -100 * mult :
                           type === 'bouncer' ? 400 * mult :
                           type === 'slow' ? 300 * mult :
                           type === 'yorker' ? -150 * mult : 100 * mult;

      this.ball.setPosition(this.bowler.x, this.ballDepth - this.ballHeight);
      const startScale = this.initialBallScale;
      this.ball.setScale(startScale);
      this.ball.setVisible(true);

      this.ballShadow.setPosition(this.bowler.x, this.ballDepth);
      this.ballShadow.setScale(startScale);
      this.ballShadow.setVisible(true);

      // Setup trail emitters
      this.trailEmitter.stop();
      if (type === 'fast' || type === 'yorker' || type === 'bouncer') {
        const tint = type === 'bouncer' ? 0xff0000 : type === 'yorker' ? 0xffa500 : 0xff4500;
        this.trailEmitter.setConfig({
          tint,
          lifespan: type === 'fast' ? 200 : 150,
          scale: { start: type === 'bouncer' ? 1.2 : 1, end: 0 }
        });
        this.trailEmitter.start();
      } else if (type === 'swing') {
        this.trailEmitter.setConfig({ tint: 0x9333ea, lifespan: 200, scale: { start: 1, end: 0 } });
        this.trailEmitter.start();
      }

      this.bowlerRunupActive = false; // Begin ball physics in update()
    });
  }

  private animateBowlerRunup(onComplete: () => void) {
    const isBatting = this.role === 'batting';
    // Bowling toward the near crease
    const runupDir = isBatting ? 1 : -1; // +1 = down (toward batsman), -1 = up
    const approachDist = isBatting ? 28 : 20;
    const jumpDist = isBatting ? 10 : 8;

    // Phase 1: Run-up approach
    this.tweens.add({
      targets: this.bowler,
      y: this.bowlerRestY + runupDir * approachDist,
      x: this.bowlerRestX + (Math.random() - 0.5) * 8,
      duration: 280,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // Phase 2: Leap / gather stride
        this.tweens.add({
          targets: this.bowler,
          y: this.bowlerRestY + runupDir * (approachDist + jumpDist),
          scaleY: (this.bowler.scaleY ?? 1) * 0.88,
          duration: 120,
          ease: 'Quad.easeOut',
          onComplete: () => {
            // Phase 3: Follow-through — bowler moves back to rest
            this.tweens.add({
              targets: this.bowler,
              y: this.bowlerRestY,
              x: this.bowlerRestX,
              scaleY: (this.role === 'batting' ? 0.38 : 0.62),
              duration: 240,
              ease: 'Sine.easeOut',
              onComplete: () => {
                onComplete();
              }
            });
          }
        });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATTING — PRESERVED + IMPROVED ANIMATION
  // ─────────────────────────────────────────────────────────────────────────────

  private hitShot(isAI = false, direction: 'left' | 'right' | 'up' | 'straight' = 'straight') {
    if (!this.isBowling || this.isHit || this.wickets >= 1 || this.balls >= this.maxBalls) return;

    if (!isAI && this.playerHasSwung) return;
    if (!isAI) this.playerHasSwung = true;

    if (this.mode === 'multiplayer' && !isAI) {
      if (!this.multiplayerDriver?.canBat()) {
        console.log("[CricketScene] hitShot rejected - not my turn to bat");
        this.playerHasSwung = false;
        this.hud.updateStatus("Not your turn to bat!", "#f43f5e");
        return;
      }

      this.playBatSwing(direction);
      const timing = this.computeTiming(direction);
      this.hud.setControlsState(true);
      this.hud.updateStatus("Shot played! Waiting for result...", "#93c5fd");
      this.audioManager.playWhoosh();
      this.multiplayerDriver.sendBatAction(direction, timing);
      return;
    }

    this.isHit = true;
    this.balls++;
    if (this.role === 'batting') {
      this.hud.setControlsState(true);
    }

    this.playBatSwing(direction);

    const sweetSpotY = this.role === 'bowling' ? PITCH_TOP_Y + 20 : PITCH_BOT_Y - 40;
    const distance = Math.abs(this.ballDepth - sweetSpotY);
    const dx = Math.abs(this.ball.x - CENTER_X);
    let dz = 0;
    if (this.ballHeight < 10) dz = 10 - this.ballHeight;
    else if (this.ballHeight > 60) dz = this.ballHeight - 60;

    let totalDiff = distance + dx * 0.5 + dz * 0.8;

    if (this.hasSteppedOut) {
      totalDiff *= 0.6;
    }

    if (isAI) {
      totalDiff += Math.random() * 60;
    }

    let isOut = false;
    let runsAdded = 0;
    let message = '';
    let colorStr = "#fbbf24";
    let shotPower = 0;
    let shotAngle = 0;

    const baseAngle = this.role === 'bowling' ? Math.PI / 2 : -Math.PI / 2;

    let angleMod = 0;
    if (direction === 'left') angleMod = -0.7;
    else if (direction === 'right') angleMod = 0.7;

    const isLofted = direction === 'up';

    if (totalDiff <= 35) {
      const isSix = isLofted;
      runsAdded = isSix ? 6 : 4;
      message = isSix ? 'PERFECT TIMING! SIX! 🚀' : 'PERFECT TIMING! FOUR! 🔥';
      colorStr = "#34d399";
      shotPower = isSix ? 1500 : 1200;
      shotAngle = baseAngle + angleMod + (Math.random() - 0.5) * 0.3;
      this.ballVelocityZ = isSix ? 800 : (isLofted ? 500 : 200);

      this.cameras.main.shake(isSix ? 300 : 200, 0.015);
      this.createBalloons(runsAdded);
      this.audioManager.playHit(shotPower);
      this.audioManager.playCrowdRoar();

      this.bat.setTint(0xffffff);
      this.bat.setTintFill();
      this.time.delayedCall(100, () => this.bat.clearTint());

      this.trailEmitter.setConfig({
        tint: isSix ? 0x34d399 : 0x3b82f6,
        lifespan: isSix ? 400 : 300,
        scale: { start: isSix ? 1.5 : 1.2, end: 0 }
      });
      this.trailEmitter.start();

      if (isSix) {
        this.emitGameEvent('six', { runs: 6 });
        this.crowdReact('max');
      } else {
        this.emitGameEvent('four', { runs: 4 });
        this.crowdReact('strong');
      }
    } else if (totalDiff <= 90) {
      if (isLofted && Math.random() > 0.6) {
        message = 'MISTIMED LOFT! CAUGHT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 500;
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5) * 0.5;
        this.ballVelocityZ = 400;
        this.audioManager.playHit(shotPower);
      } else {
        shotPower = 400 + Math.random() * 400;
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5) * 0.6;
        this.ballVelocityZ = (isLofted ? 200 : 50) + Math.random() * 100;
        this.audioManager.playHit(shotPower);
      }
    } else if (totalDiff <= 140) {
      const isEdge = Math.random() > 0.5;
      if (this.hasSteppedOut) {
        message = 'STUMPED OUT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 50;
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5);
        this.ballVelocityZ = 20;
        this.audioManager.playHit(50);
      } else if (isEdge) {
        message = 'EDGE! CAUGHT BY KEEPER!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 100;
        shotAngle = baseAngle + (Math.random() > 0.5 ? 2.5 : -2.5);
        this.ballVelocityZ = 150;
        this.audioManager.playHit(100);

        this.tweens.add({
          targets: this.keeper,
          y: this.keeper.y - (this.role === 'batting' ? 30 : 10),
          yoyo: true,
          duration: 300,
          ease: 'Sine.easeOut'
        });
      } else {
        message = 'Weak Shot, 0 runs.';
        runsAdded = 0;
        shotPower = 50;
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5);
        this.ballVelocityZ = 20;
        this.audioManager.playHit(50);
      }
    } else {
      if (this.hasSteppedOut) {
        this.isHit = true;
        message = 'STUMPED OUT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 0;
        this.audioManager.playWicket();
        this.playWicketAnimation();
      } else {
        this.isHit = false;
        this.balls--;
        return;
      }
    }

    if (isOut) {
      this.wickets++;
      this.addHistory('W');
      this.hud.updateStatus(message, colorStr);
      this.hud.updateScore(this.runs, this.wickets);
      this.emitGameEvent('wicket');
      this.crowdReact('strong');
      if (!this.checkInningsEnd(true)) {
        this.time.delayedCall(1000, () => this.startNextBallTimer(3));
      }
      return;
    }

    if (shotPower > 0) {
      this.ballVelocity = {
        x: Math.cos(shotAngle) * shotPower,
        y: Math.sin(shotAngle) * shotPower
      };

      if (runsAdded >= 4) {
        this.hud.updateStatus(message, colorStr);
        if (runsAdded === 6) {
          this.tweens.add({
            targets: this.ball,
            scale: this.role === 'bowling' ? 5 : 3,
            duration: 300,
            yoyo: true
          });
        }

        this.time.delayedCall(1000, () => {
          this.ballVelocity = { x: 0, y: 0 };
          this.commitRuns(runsAdded);
        });
      } else {
        if (this.fielders.length > 0) {
          let destX = this.ball.x + this.ballVelocity.x * 0.4;
          let destY = this.ballDepth + this.ballVelocity.y * 0.4;
          destX = Phaser.Math.Clamp(destX, 0, GAME_W);
          destY = Phaser.Math.Clamp(destY, HORIZON_Y, GAME_H);

          const closestFielder = this.getClosestFielder(destX, destY);

          if (closestFielder) {
            const dist = Phaser.Math.Distance.Between(closestFielder.x, closestFielder.y, destX, destY);
            const chaseDuration = Math.max(800, dist * 4);

            const throwToBowlerEnd = closestFielder.y < CENTER_Y;
            const targetX = CENTER_X;
            const targetY = throwToBowlerEnd ? PITCH_TOP_Y : PITCH_BOT_Y;

            const throwDist = Phaser.Math.Distance.Between(closestFielder.x, closestFielder.y, targetX, targetY);
            const throwDuration = Math.max(600, throwDist * 2);

            const totalFielderTime = chaseDuration + throwDuration;
            let calculatedRuns = Math.floor((totalFielderTime - 400) / 700);
            calculatedRuns = Phaser.Math.Clamp(calculatedRuns, 0, 3);

            if (calculatedRuns > 0) {
              this.hud.updateStatus(`Running ${calculatedRuns}...`, "#3b82f6");
              this.audioManager.playCrowdRoar();
              this.autoRunBatsmen(calculatedRuns);
              this.emitGameEvent('runs', { runs: calculatedRuns });
              this.crowdReact('mild');
            }

            this.tweens.add({
              targets: closestFielder,
              x: destX,
              y: destY,
              duration: chaseDuration,
              onComplete: () => {
                this.ballVelocity = { x: 0, y: 0 };
                this.ballVelocityZ = 0;
                this.ballDepth = closestFielder.y;
                this.ballHeight = 20;
                this.ballShadow.setPosition(closestFielder.x, closestFielder.y);
                this.ball.setPosition(closestFielder.x, closestFielder.y - 20);
                this.trailEmitter.stop();

                this.trailEmitter.setConfig({ tint: 0xffffff, lifespan: 200, scale: { start: 0.8, end: 0 } });
                this.trailEmitter.start();

                this.tweens.add({
                  targets: this,
                  ballHeight: 80,
                  duration: throwDuration / 2,
                  yoyo: true,
                  ease: 'Sine.easeOut'
                });

                this.tweens.add({
                  targets: this,
                  ballDepth: targetY,
                  duration: throwDuration,
                  ease: 'Linear',
                  onUpdate: () => {
                    this.ballShadow.setPosition(this.ball.x, this.ballDepth);
                    this.ball.setPosition(this.ball.x, this.ballDepth - this.ballHeight);
                    this.trailEmitter.particleX = this.ball.x;
                    this.trailEmitter.particleY = this.ball.y;
                  },
                  onComplete: () => {
                    this.trailEmitter.stop();
                    this.commitRuns(calculatedRuns);

                    this.tweens.add({
                      targets: closestFielder,
                      x: closestFielder.getData('startX') || closestFielder.x,
                      y: closestFielder.getData('startY') || closestFielder.y,
                      duration: 2000
                    });
                  }
                });

                this.tweens.add({
                  targets: this.ball,
                  x: targetX,
                  scale: this.initialBallScale,
                  duration: throwDuration,
                  ease: 'Linear'
                });
              }
            });
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BAT SWING — SHOT-SPECIFIC ANIMATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  private playBatSwing(direction: 'left' | 'right' | 'up' | 'straight') {
    // Step out for slog
    if (direction === 'up' && !this.hasSteppedOut && this.role === 'batting') {
      this.hasSteppedOut = true;
      this.tweens.add({
        targets: [this.batsman, this.bat],
        y: '-=22',
        duration: 140,
        ease: 'Quad.easeOut'
      });
    }

    this.bat.setVisible(true);

    let startAngle = -30;
    let endAngle = -100;
    let easeType = 'Quad.easeIn';
    let duration = 160;

    switch (direction) {
      case 'straight': // Defensive or straight drive — compact forward lunge
        startAngle = -20;
        endAngle = -95;
        duration = 140;
        easeType = 'Quad.easeIn';
        // Batsman body lean forward
        this.tweens.add({ targets: this.batsman, x: this.batsman.x - 8, duration: 120, yoyo: true, ease: 'Sine.easeInOut' });
        break;

      case 'left': // Cover drive — elegant front-foot extension
        startAngle = -45;
        endAngle = -130;
        duration = 175;
        easeType = 'Cubic.easeIn';
        // Front foot step (left)
        this.tweens.add({ targets: this.batsman, x: this.batsman.x - 18, duration: 160, yoyo: true, ease: 'Sine.easeOut' });
        break;

      case 'right': // Cut / pull — weight on back foot, horizontal swing
        startAngle = 10;
        endAngle = -80;
        duration = 150;
        easeType = 'Quad.easeIn';
        // Weight shift back
        this.tweens.add({ targets: this.batsman, x: this.batsman.x + 12, duration: 100, yoyo: true, ease: 'Sine.easeOut' });
        break;

      case 'up': // Slog sweep — big horizontal arc with knee bend
        startAngle = 30;
        endAngle = -140;
        duration = 200;
        easeType = 'Cubic.easeIn';
        // Batsman dips and rises
        this.tweens.add({ targets: this.batsman, scaleY: (this.batsman.scaleY ?? 0.85) * 0.9, duration: 110, yoyo: true, ease: 'Sine.easeInOut' });
        break;
    }

    this.bat.setAngle(startAngle);

    this.tweens.add({
      targets: this.bat,
      angle: endAngle,
      duration,
      ease: easeType,
      onComplete: () => {
        // Return bat to guard position
        this.tweens.add({
          targets: this.bat,
          angle: -30,
          duration: 180,
          ease: 'Sine.easeOut',
          onComplete: () => {
            this.bat.setVisible(false);
          }
        });
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TIMING — PRESERVED IDENTICALLY
  // ─────────────────────────────────────────────────────────────────────────────

  private computeTiming(direction: 'left' | 'right' | 'up' | 'straight'): CricketTiming {
    const sweetSpotY = this.role === 'bowling' ? PITCH_TOP_Y + 20 : PITCH_BOT_Y - 40;
    const distance = Math.abs(this.ballDepth - sweetSpotY);
    const dx = Math.abs(this.ball.x - CENTER_X);
    let dz = 0;
    if (this.ballHeight < 10) dz = 10 - this.ballHeight;
    else if (this.ballHeight > 60) dz = this.ballHeight - 60;

    let totalDiff = distance + dx * 0.5 + dz * 0.8;
    if (this.hasSteppedOut) totalDiff *= 0.6;

    if (totalDiff <= 90) return 'good';
    if (this.ballDepth < sweetSpotY) return 'early';
    return 'late';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RUN SCORING — WITH EVENT EMISSION
  // ─────────────────────────────────────────────────────────────────────────────

  private commitRuns(runs: number) {
    if (runs > 0) {
      const previousMilestone = Math.floor(this.runs / 50);
      this.runs += runs;
      this.addHistory(runs.toString());
      const currentMilestone = Math.floor(this.runs / 50);

      let message = `${runs} RUNS! 🏃`;
      let colorStr = "#34d399";

      if (runs === 4) {
        message = 'FOUR! 🔥';
        this.emitGameEvent('four', { runs: 4 });
        this.crowdReact('strong');
      } else if (runs === 6) {
        message = 'SIX! 🚀';
        this.emitGameEvent('six', { runs: 6 });
        this.crowdReact('max');
      } else {
        this.emitGameEvent('runs', { runs });
        this.crowdReact('mild');
      }

      if (currentMilestone > previousMilestone && currentMilestone > 0) {
        this.createConfetti();
        message = `${currentMilestone * 50} RUNS MILESTONE! 🎉`;
        this.crowdReact('max');
      }

      this.hud.updateStatus(message, colorStr);
      this.hud.updateScore(this.runs, this.wickets);
      this.hud.showRunIndicator(runs);
    } else {
      this.addHistory("0");
      this.hud.updateStatus("Dot ball.", "#9ca3af");
    }

    if (!this.checkInningsEnd()) {
      this.time.delayedCall(1000, () => this.startNextBallTimer(3));
    }
  }

  private addHistory(val: string) {
    if (this.overHistory.length >= 6) {
      this.overHistory = [];
    }
    this.overHistory.push(val);
    this.hud.updateOverHistory(this.overHistory);
    this.hud.updateStats(this.balls, this.maxBalls);
  }

  private autoRunBatsmen(runs: number, currentRun: number = 1) {
    if (runs <= 0) return;

    const batsmanTargetY = this.batsman.y < CENTER_Y ? PITCH_BOT_Y - 60 : PITCH_TOP_Y - 20;
    const nonStrikerTargetY = this.nonStriker.y < CENTER_Y ? PITCH_BOT_Y - 60 : PITCH_TOP_Y - 20;

    const batsmanTargetScale = batsmanTargetY < CENTER_Y ? 0.18 : 0.34;
    const nonStrikerTargetScale = nonStrikerTargetY < CENTER_Y ? 0.18 : 0.34;

    this.tweens.add({
      targets: this.batsman,
      y: batsmanTargetY,
      scale: batsmanTargetScale,
      duration: 1000,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: this.nonStriker,
      y: nonStrikerTargetY,
      scale: nonStrikerTargetScale,
      duration: 1000,
      ease: 'Linear',
      onComplete: () => {
        if (currentRun < runs) {
          this.autoRunBatsmen(runs, currentRun + 1);
        } else {
          this.resetBatsmenPositions();
        }
      }
    });
  }

  private resetBatsmenPositions() {
    if (this.role === 'batting') {
      this.batsman.setPosition(CENTER_X - 35, PITCH_BOT_Y - 42);
      this.batsman.setScale(0.34);
      this.bat.setPosition(CENTER_X - 8, PITCH_BOT_Y - 30);
      this.bat.setScale(0.34);

      this.nonStriker.setPosition(CENTER_X + 45, PITCH_TOP_Y - 18);
      this.nonStriker.setScale(0.18);
    } else {
      this.batsman.setPosition(CENTER_X - 14, PITCH_TOP_Y - 18);
      this.batsman.setScale(0.18);
      this.bat.setPosition(CENTER_X - 3, PITCH_TOP_Y - 11);
      this.bat.setScale(0.18);

      this.nonStriker.setPosition(CENTER_X + 85, PITCH_BOT_Y - 40);
      this.nonStriker.setScale(0.34);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MISS / WICKET — IMPROVED
  // ─────────────────────────────────────────────────────────────────────────────

  private handleMiss() {
    this.isBowling = false;
    this.isHit = false;
    this.bowlerRunupActive = false;
    this.balls++;
    this.trailEmitter.stop();

    this.audioManager.playCrowdGroan();

    const dx = Math.abs(this.ball.x - CENTER_X);
    if (dx < 25) {
      this.handleWicket();
    } else {
      this.addHistory('0');
      this.hud.updateStatus("Missed! No runs.", "#94a3b8");
      if (!this.checkInningsEnd()) {
        if (this.role === 'bowling') {
          this.time.delayedCall(1000, () => this.startNextBallTimer(3));
        } else {
          this.startNextBallTimer(3);
        }
      }
    }
  }

  private playWicketAnimation() {
    // Camera shake
    this.cameras.main.shake(350, 0.022);

    // Camera zoom to stumps
    this.cameras.main.zoomTo(1.12, 400, 'Quad.easeOut');
    this.time.delayedCall(800, () => {
      this.cameras.main.zoomTo(1.0, 500, 'Quad.easeIn');
    });

    // Stump collapse
    this.tweens.add({
      targets: this.batsmanStumps,
      angle: (Math.random() > 0.5 ? 1 : -1) * 28 + 85,
      y: this.batsmanStumps.y + 18,
      duration: 280,
      ease: 'Quad.easeIn'
    });

    // Bail 1 — fly up and to the left
    const bail1StartX = this.bail1.x;
    const bail1StartY = this.bail1.y;
    this.tweens.add({
      targets: this.bail1,
      x: bail1StartX - 35 - Math.random() * 20,
      y: bail1StartY - 55 - Math.random() * 25,
      angle: -180 - Math.random() * 180,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.bail1,
          y: bail1StartY + 25 + Math.random() * 15,
          angle: (this.bail1.angle ?? 0) - 90,
          duration: 340,
          ease: 'Bounce.easeOut'
        });
      }
    });

    // Bail 2 — fly up and to the right
    const bail2StartX = this.bail2.x;
    const bail2StartY = this.bail2.y;
    this.time.delayedCall(40, () => {
      this.tweens.add({
        targets: this.bail2,
        x: bail2StartX + 28 + Math.random() * 22,
        y: bail2StartY - 48 - Math.random() * 22,
        angle: 160 + Math.random() * 200,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: this.bail2,
            y: bail2StartY + 20 + Math.random() * 15,
            angle: (this.bail2.angle ?? 0) + 90,
            duration: 360,
            ease: 'Bounce.easeOut'
          });
        }
      });
    });

    // Red dust particles at stump base
    this.dustEmitter.setConfig({
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xdc2626,
      lifespan: 450,
      speed: { min: 30, max: 70 },
      angle: { min: 220, max: 320 }
    });
    const stumpX = CENTER_X;
    const stumpY = this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y;
    this.dustEmitter.emitParticleAt(stumpX, stumpY - 10, 18);
  }

  private handleWicket() {
    this.wickets++;

    this.audioManager.playCrowdGroan();

    this.hud.updateScore(this.runs, this.wickets);
    this.hud.updateStatus("OUT! Bowled him!", "#f43f5e");

    this.emitGameEvent('wicket');
    this.crowdReact('strong');
    this.playWicketAnimation();

    this.hud.updateScore(this.runs, this.wickets);

    if (!this.checkInningsEnd(true)) {
      if (this.role === 'bowling') {
        this.time.delayedCall(1000, () => this.startNextBallTimer(3));
      } else {
        this.startNextBallTimer(3);
      }
    }
  }

  private checkInningsEnd(isWicket = false) {
    if (this.mode === 'multiplayer') {
      return false;
    }

    if (this.inning === 1) {
      if (this.wickets >= 1 || this.balls >= this.maxBalls) {
        this.hud.setControlsState(true);
        this.inning = 2;
        this.targetScore = this.runs + 1;
        this.hud.setTarget(this.targetScore);
        this.hud.setInnings(2);

        this.audioManager.playCrowdRoar();
        this.hud.updateStatus(`INNINGS 1 OVER! Target: ${this.targetScore} runs to win.`, "#fbbf24");

        this.time.delayedCall(2000, () => {
          this.runs = 0;
          this.wickets = 0;
          this.balls = 0;
          this.overHistory = [];
          this.hud.updateScore(0, 0);
          this.hud.updateOverHistory([]);

          const newRole = this.role === 'batting' ? 'bowling' : 'batting';
          this.setRole(newRole);

          this.startNextBallTimer(3);
        });
        return true;
      }
      return false;
    }

    const isWin = this.role === 'batting' ? this.runs >= this.targetScore : this.runs < this.targetScore;
    const isEnded = (this.role === 'batting' && this.runs >= this.targetScore) ||
                    this.balls >= this.maxBalls ||
                    this.wickets >= 1;

    if (isEnded) {
      this.hud.setControlsState(true);

      const delay = isWicket ? 1000 : 0;
      this.time.delayedCall(delay, () => {
        if ((this.role === 'bowling' && isWin) || (this.role === 'batting' && !isWin)) {
          this.fielders.forEach(f => this.jumpCelebrate(f));
          this.jumpCelebrate(this.bowler);
        } else {
          this.jumpCelebrate(this.batsman);
          this.jumpCelebrate(this.nonStriker);
        }
      });

      const isNewBest = this.runs > this.bestScore && this.runs > 0;
      if (isNewBest) {
        this.bestScore = this.runs;
        localStorage.setItem('cricket_best_score', this.bestScore.toString());
      }

      const depth = 50;

      this.time.delayedCall(2000, () => {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRect(0, 0, GAME_W, GAME_H);
        bg.setDepth(depth);

        const msg = this.role === 'batting'
          ? (isWin ? "TARGET REACHED! YOU WIN!" : "INNINGS OVER! YOU LOSE!")
          : (isWin ? "TARGET DEFENDED! YOU WIN!" : "TARGET REACHED! YOU LOSE!");

        this.add.text(CENTER_X, CENTER_Y - 50, msg, {
          fontSize: "36px", color: isWin ? "#34d399" : "#f43f5e", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 1);

        this.add.text(CENTER_X, CENTER_Y + 20, `Final Score: ${this.runs}/${this.wickets}`, {
          fontSize: "24px", color: "#ffffff", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 1);

        const btnBg = this.add.graphics();
        btnBg.fillStyle(0xf59e0b, 1);
        btnBg.fillRoundedRect(CENTER_X - 100, CENTER_Y + 80, 200, 50, 8);
        btnBg.setDepth(depth + 1);

        this.add.text(CENTER_X, CENTER_Y + 105, "FINISH", {
          fontSize: "20px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
        }).setOrigin(0.5).setDepth(depth + 2);

        const btnZone = this.add.zone(CENTER_X, CENTER_Y + 105, 200, 50).setInteractive({ useHandCursor: true }).setDepth(depth + 3);
        btnZone.once('pointerdown', () => {
          if (this.onGameOver) this.onGameOver(this.runs, this.wickets, isWin);
        });
      });

      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CELEBRATIONS — PRESERVED
  // ─────────────────────────────────────────────────────────────────────────────

  private jumpCelebrate(target: Phaser.GameObjects.Sprite) {
    this.tweens.add({
      targets: target,
      y: target.y - 20,
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private createBalloons(count: number) {
    for (let i = 0; i < count; i++) {
      const x = CENTER_X + (Math.random() - 0.5) * 600;
      const y = HORIZON_Y + 20 + Math.random() * 30;
      const colors = [0xf43f5e, 0x3b82f6, 0xeab308, 0xa855f7, 0x22c55e];
      const color = colors[Math.floor(Math.random() * colors.length)];

      const balloonBg = this.add.circle(0, 0, 24, color).setStrokeStyle(2, 0xffffff);
      const text = this.add.text(0, 0, count.toString(), {
        fontSize: "28px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5);

      const balloon = this.add.container(x, y, [balloonBg, text]).setDepth(30);

      this.tweens.add({
        targets: balloon,
        y: -50,
        x: x + (Math.random() - 0.5) * 150,
        duration: 3000 + Math.random() * 2000,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          balloon.destroy();
        }
      });
    }
  }

  private createConfetti() {
    const colors = [0xf43f5e, 0x3b82f6, 0xeab308, 0xa855f7, 0x22c55e, 0xffffff];
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * GAME_W;
      const y = -50 - Math.random() * 200;
      const confetti = this.add.sprite(x, y, 'tex_confetti').setDepth(100);
      confetti.setTint(colors[Math.floor(Math.random() * colors.length)]);

      this.tweens.add({
        targets: confetti,
        y: GAME_H + 50,
        duration: 3000 + Math.random() * 2000,
        ease: 'Linear',
        onComplete: () => { confetti.destroy(); }
      });

      this.tweens.add({
        targets: confetti,
        x: x + (Math.random() * 200 - 100),
        angle: Math.random() * 720 - 360,
        duration: 2000 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  private getClosestFielder(x: number, y: number) {
    if (this.fielders.length === 0) return null;
    let closest = this.fielders[0];
    let minDist = Phaser.Math.Distance.Between(x, y, closest.x, closest.y);

    for (let i = 1; i < this.fielders.length; i++) {
      const dist = Phaser.Math.Distance.Between(x, y, this.fielders[i].x, this.fielders[i].y);
      if (dist < minDist) {
        minDist = dist;
        closest = this.fielders[i];
      }
    }
    return closest;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT EMISSION — NEW
  // ─────────────────────────────────────────────────────────────────────────────

  private emitGameEvent(type: string, data?: Record<string, unknown>) {
    this.game.events.emit('cricket:game_event', { type, ...data });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE LOOP — SEAM ROTATION + BOWLER RUN-UP GATE
  // ─────────────────────────────────────────────────────────────────────────────

  update(time: number, delta: number) {
    const dt = delta / 1000;

    // Skip ball physics during bowler run-up animation
    if (this.bowlerRunupActive) return;

    // ── Seam rotation ──
    if ((this.isBowling || this.isHit) && this.ball.visible) {
      const speed = Math.sqrt(
        this.ballVelocity.x * this.ballVelocity.x +
        this.ballVelocity.y * this.ballVelocity.y
      );
      const spinFactor = this.deliveryType === 'spin' ? 0.20 :
                         this.deliveryType === 'fast' ? 0.09 : 0.13;
      this.ballAngle += speed * dt * spinFactor;
      if (this.isHit) this.ballAngle -= speed * dt * 0.06; // Reverse spin after hit
      this.ball.setAngle(this.ballAngle);
    }

    // ── Ball physics ──
    if (this.isBowling && !this.isHit) {
      if (this.deliveryType === 'spin') {
        this.ballVelocity.x -= this.spinDirection * 350 * dt;
      }

      this.ball.x += this.ballVelocity.x * dt;
      this.ballDepth += this.ballVelocity.y * dt;

      // Vertical physics (bounce)
      this.ballVelocityZ -= this.gravity * dt;
      this.ballHeight += this.ballVelocityZ * dt;

      if (this.ballHeight < 0) {
        this.ballHeight = 0;
        this.ballVelocityZ = Math.abs(this.ballVelocityZ) * 0.6;
        // Bounce dust + flash
        this.dustEmitter.emitParticleAt(this.ball.x, this.ballDepth, 5);
      }

      this.ballShadow.setPosition(this.ball.x, this.ballDepth);
      this.ball.setPosition(this.ball.x, this.ballDepth - this.ballHeight);
      this.trailEmitter.particleX = this.ball.x;
      this.trailEmitter.particleY = this.ball.y;

      // AI batting
      if (this.role === 'bowling' && this.mode === 'ai') {
        const sweetSpotY = PITCH_TOP_Y + 20;
        if (!this.aiHasSwung && this.ballDepth <= sweetSpotY + 15 && this.ballDepth >= sweetSpotY - 15) {
          this.aiHasSwung = true;
          if (Math.random() < 0.95) {
            const dirs: ('up' | 'left' | 'right' | 'straight')[] = ['up', 'left', 'right', 'straight'];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            this.hitShot(true, dir);
          }
        }
      }

      // Standard Small Cricket Ball Scale
      this.ball.setScale(this.initialBallScale);
      this.ballShadow.setScale(this.initialBallScale);

      // Missed?
      const isMissed = this.role === 'bowling' ? this.ballDepth < PITCH_TOP_Y - 10 : this.ballDepth > PITCH_BOT_Y + 20;
      if (isMissed) {
        this.ballVelocity = { x: 0, y: 0 };
        this.ballVelocityZ = 0;
        this.ballShadow.setVisible(false);
        this.ball.setVisible(false);
        if (this.mode === 'ai') {
          this.handleMiss();
        } else {
          this.isBowling = false;
          this.isHit = false;
          this.trailEmitter.stop();
          this.hud.updateStatus("Ball delivered! Awaiting outcome...", "#fbbf24");

          this.time.delayedCall(1500, () => {
            if (!this.isBowling && !this.isHit && !this.multiplayerOver) {
              this.handleMiss();
            }
          });
        }
      }
    } else if (this.isHit) {
      const groundFriction = Math.pow(0.3, dt);
      const airFriction = Math.pow(0.8, dt);

      if (this.ballHeight <= 5) {
        this.ballVelocity.x *= groundFriction;
        this.ballVelocity.y *= groundFriction;
      } else {
        this.ballVelocity.x *= airFriction;
        this.ballVelocity.y *= airFriction;
      }

      this.ball.x += this.ballVelocity.x * dt;
      this.ballDepth += this.ballVelocity.y * dt;

      this.ballVelocityZ -= this.gravity * 0.5 * dt;
      this.ballHeight += this.ballVelocityZ * dt;

      if (this.ballHeight < 0) {
        this.ballHeight = 0;
        this.ballVelocityZ = Math.abs(this.ballVelocityZ) * 0.4;
        this.dustEmitter.emitParticleAt(this.ball.x, this.ballDepth, 5);
      }

      this.ballShadow.setPosition(this.ball.x, this.ballDepth);
      this.ball.setPosition(this.ball.x, this.ballDepth - this.ballHeight);
      this.trailEmitter.particleX = this.ball.x;
      this.trailEmitter.particleY = this.ball.y;

      if (!this.tweens.isTweening(this.ball)) {
        this.ball.setScale(this.initialBallScale);
        this.ballShadow.setScale(this.initialBallScale);
      }

      this.ballVelocity.x *= 0.985;
      this.ballVelocity.y *= 0.985;

      if (Math.abs(this.ballVelocity.x) < 10 && Math.abs(this.ballVelocity.y) < 10) {
        this.ballVelocity = { x: 0, y: 0 };
        this.isHit = false;
        this.isBowling = false;
      }

      if (this.ball.x < 0 || this.ball.x > GAME_W || this.ball.y < HORIZON_Y || this.ball.y > GAME_H) {
        this.ballVelocity = { x: 0, y: 0 };
        this.ball.x = Phaser.Math.Clamp(this.ball.x, 0, GAME_W);
        this.ball.y = Phaser.Math.Clamp(this.ball.y, HORIZON_Y, GAME_H);
        this.isHit = false;
        this.isBowling = false;
      }
    }
  }
}
