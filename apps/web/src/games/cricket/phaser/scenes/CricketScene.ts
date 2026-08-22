import Phaser from "phaser";
import type { CricketState, CricketDelivery, CricketShot, CricketTiming } from "@gaming-hub/game-engine";
import { CricketHUDManager } from "../managers/CricketHUDManager";
import { CricketAudioManager } from "../managers/CricketAudioManager";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";
import CricketMultiplayerDriver from "../managers/CricketMultiplayerDriver";
import { CricketPlayerRenderer } from "../renderers/cricketPlayerRenderer";

const GAME_W = 924;
const GAME_H = 680;
const CENTER_X = GAME_W / 2;
const CENTER_Y = GAME_H / 2;

// Stick Cricket Low-Angle Ground Perspective constants
const HORIZON_Y = 175;
const PITCH_TOP_W = 150;
const PITCH_BOT_W = 860;
const PITCH_TOP_Y = 195;
const PITCH_BOT_Y = 680;

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
  private swingAccel = 0;
  private spinTurned = false;
  private batsmanIdleTimer?: Phaser.Time.TimerEvent;
  private batsmanRunTimer?: Phaser.Time.TimerEvent;

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

    // ── 1. Vibrant Tri-Color Stadium Sky (Magenta -> Purple -> Cyan) ─────────
    // Left half: Vibrant magenta to deep purple
    g.fillGradientStyle(0xdb2777, 0x7c3aed, 0x9d174d, 0x4338ca, 1);
    g.fillRect(0, 0, GAME_W * 0.5, HORIZON_Y);
    // Right half: Deep purple to electric cyan/teal
    g.fillGradientStyle(0x7c3aed, 0x06b6d4, 0x4338ca, 0x0284c7, 1);
    g.fillRect(GAME_W * 0.5, 0, GAME_W * 0.5, HORIZON_Y);

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 137.508 * Math.PI / 180) * 0.5 + 0.5) * GAME_W;
      const sy = (Math.cos(i * 97.3 * Math.PI / 180) * 0.5 + 0.5) * (HORIZON_Y - 70);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(sx, sy, 1.2);
    }

    // Atmospheric horizon glow from floodlights
    g.fillGradientStyle(0xffffff, 0xffffff, 0x7c3aed, 0x7c3aed, 0.25, 0.25, 0, 0);
    g.fillRect(0, HORIZON_Y - 55, GAME_W, 55);

    // ── 2. Multi-Tier Grandstands ─────────────────────────────────────────────
    const standH = 120;
    const standTopY = HORIZON_Y - standH;

    // Tier 3 (highest, furthest back — deep violet)
    g.fillStyle(0x3b0764, 1);
    g.fillRect(0, standTopY, GAME_W, standH * 0.34);

    // Tier 2 (middle — vibrant magenta / purple)
    g.fillStyle(0x581c87, 1);
    g.fillRect(0, standTopY + standH * 0.34, GAME_W, standH * 0.32);

    // Tier 1 (lowest — neon cyan / purple)
    g.fillStyle(0x701a75, 1);
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

    // ── 6. Sight Screen (Stick Cricket Centered Black Box) ─────────────────────
    const ssX = CENTER_X - 45, ssY = 140, ssW = 90, ssH = 65;
    // Outer steel frame
    g.fillStyle(0x0a0a0a, 1);
    g.fillRoundedRect(ssX - 3, ssY - 3, ssW + 6, ssH + 6, 4);
    // Dark sight screen face
    g.fillStyle(0x18181b, 1);
    g.fillRect(ssX, ssY, ssW, ssH);
    // Panel seam lines
    g.fillStyle(0x27272a, 0.8);
    g.fillRect(ssX + ssW / 2 - 1, ssY, 2, ssH);

    // ── 7. Advertising Boards (Stick Cricket sponsor hoardings) ────────────────
    const ribbonY = HORIZON_Y - 22;
    g.fillStyle(0x010b18, 1);
    g.fillRect(0, ribbonY, GAME_W, 22);
    
    // Colored sponsor boards: Red, Blue, Cyan
    const sponsorColors = [0xdc2626, 0x0284c7, 0x16a34a, 0xdc2626, 0x0284c7];
    const boardsCount = 10;
    const boardW = GAME_W / boardsCount - 2;
    for (let b = 0; b < boardsCount; b++) {
      const bx = (GAME_W / boardsCount) * b + 1;
      const col = sponsorColors[b % sponsorColors.length];
      g.fillStyle(col, 0.92);
      g.fillRect(bx, ribbonY + 2, boardW, 18);
      g.fillStyle(0x010b18, 1);
      g.fillRect(bx + boardW, ribbonY + 2, 2, 18);
    }

    // ── 8. Outfield Grass with Mowing Stripes ─────────────────────────────────
    const stripeH = 26;
    const numStripes = Math.ceil((GAME_H - HORIZON_Y) / stripeH) + 1;
    for (let s = 0; s < numStripes; s++) {
      const sy = HORIZON_Y + s * stripeH;
      g.fillStyle(s % 2 === 0 ? 0x15803d : 0x16a34a, 1);
      g.fillRect(0, sy, GAME_W, stripeH);
    }

    // Outer boundary vignette
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.22, 0, 0.22, 0);
    g.fillRect(0, HORIZON_Y, 70, GAME_H - HORIZON_Y);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.22, 0, 0.22);
    g.fillRect(GAME_W - 70, HORIZON_Y, 70, GAME_H - HORIZON_Y);

    // ── 9. Boundary Line ──────────────────────────────────────────────────────
    g.lineStyle(3, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(0, HORIZON_Y + 2);
    g.lineTo(GAME_W, HORIZON_Y + 2);
    g.strokePath();

    // ── 10. Stick Cricket Wide Sand & Clay Pitch ──────────────────────────────
    const pitchMidX = CENTER_X;

    // Pitch Drop Shadow
    g.fillStyle(0x0a2412, 0.45);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2 - 8, PITCH_TOP_Y - 4);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2 + 8, PITCH_TOP_Y - 4);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2 + 10, PITCH_BOT_Y + 8);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2 - 10, PITCH_BOT_Y + 8);
    g.closePath();
    g.fillPath();

    // Main Pitch Bed — Light Golden Tan Clay with Textured Compaction
    g.fillGradientStyle(0xded0b8, 0xded0b8, 0xcaa982, 0xcaa982, 1);
    g.beginPath();
    g.moveTo(pitchMidX - PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_TOP_W / 2, PITCH_TOP_Y);
    g.lineTo(pitchMidX + PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.lineTo(pitchMidX - PITCH_BOT_W / 2, PITCH_BOT_Y);
    g.closePath();
    g.fillPath();

    // Roller Compaction Grain Lines
    g.fillStyle(0xbfa07a, 0.25);
    const pSteps = 7;
    for (let s = 1; s < pSteps; s++) {
      const fx = s / pSteps;
      const topX = (pitchMidX - PITCH_TOP_W / 2) + PITCH_TOP_W * fx;
      const botX = (pitchMidX - PITCH_BOT_W / 2) + PITCH_BOT_W * fx;
      g.beginPath();
      g.moveTo(topX - 1.5, PITCH_TOP_Y);
      g.lineTo(topX + 1.5, PITCH_TOP_Y);
      g.lineTo(botX + 3, PITCH_BOT_Y);
      g.lineTo(botX - 3, PITCH_BOT_Y);
      g.closePath();
      g.fillPath();
    }

    // ── 11. Regulation White Chalk Crease Markings ─────────────────────────────
    // TOP END (Bowler's Creases):
    const topStumpY = 200;
    g.lineStyle(2, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(pitchMidX - 65, topStumpY);
    g.lineTo(pitchMidX + 65, topStumpY);
    g.strokePath();

    const topPoppingY = 216;
    g.lineStyle(2.5, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(pitchMidX - 80, topPoppingY);
    g.lineTo(pitchMidX + 80, topPoppingY);
    g.strokePath();

    // BOTTOM END (Batting Creases):
    // Main Popping Crease Line across the pitch (at y = 575)
    const botPoppingY = 575;
    const botPoppingHalfW = 320;
    g.lineStyle(3.5, 0xffffff, 1.0);
    g.beginPath();
    g.moveTo(pitchMidX - botPoppingHalfW, botPoppingY);
    g.lineTo(pitchMidX + botPoppingHalfW, botPoppingY);
    g.strokePath();

    // Bowling Crease across stumps (at y = 665)
    const botStumpY = 665;
    const botStumpHalfW = 220;
    g.lineStyle(2.5, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(pitchMidX - botStumpHalfW, botStumpY);
    g.lineTo(pitchMidX + botStumpHalfW, botStumpY);
    g.strokePath();

    // Return Creases (Perpendicular lines connecting popping crease to bowling crease)
    g.lineStyle(2.5, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(pitchMidX - botStumpHalfW, botStumpY + 10);
    g.lineTo(pitchMidX - botStumpHalfW, botPoppingY - 10);
    g.moveTo(pitchMidX + botStumpHalfW, botStumpY + 10);
    g.lineTo(pitchMidX + botStumpHalfW, botPoppingY - 10);
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

    // ── 4. High-Definition Realistic Fielder Sprite (120×180) ──
    const fielderCanvas = document.createElement('canvas');
    CricketPlayerRenderer.renderFielder(fielderCanvas);
    if (this.textures.exists('tex_fielder')) {
      this.textures.remove('tex_fielder');
    }
    this.textures.addCanvas('tex_fielder', fielderCanvas);

    // ── 5. High-Definition Realistic Fast Bowler Animation Frames (160×260) ──
    const bowlerFrames: { key: string; render: (canvas: HTMLCanvasElement) => void }[] = [
      { key: 'tex_bowler', render: CricketPlayerRenderer.renderBowlerIdle.bind(CricketPlayerRenderer) },
      { key: 'tex_bowler_idle', render: CricketPlayerRenderer.renderBowlerIdle.bind(CricketPlayerRenderer) },
      { key: 'tex_bowler_stride', render: CricketPlayerRenderer.renderBowlerStride.bind(CricketPlayerRenderer) },
      { key: 'tex_bowler_gather', render: CricketPlayerRenderer.renderBowlerGather.bind(CricketPlayerRenderer) },
      { key: 'tex_bowler_release', render: CricketPlayerRenderer.renderBowlerRelease.bind(CricketPlayerRenderer) },
      { key: 'tex_bowler_followthrough', render: CricketPlayerRenderer.renderBowlerFollowthrough.bind(CricketPlayerRenderer) },
    ];

    for (const frame of bowlerFrames) {
      const bCanvas = document.createElement('canvas');
      frame.render(bCanvas);
      if (this.textures.exists(frame.key)) {
        this.textures.remove(frame.key);
      }
      this.textures.addCanvas(frame.key, bCanvas);
    }

    // ── 6. High-Definition Realistic Batsman Animation Suite (240×300) ──
    const batsmanFrames: { key: string; render: (canvas: HTMLCanvasElement) => void }[] = [
      { key: 'tex_batsman', render: CricketPlayerRenderer.renderBatsmanStance.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_stance', render: CricketPlayerRenderer.renderBatsmanStance.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_tap', render: CricketPlayerRenderer.renderBatsmanTap.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_backlift', render: CricketPlayerRenderer.renderBatsmanBacklift.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_drive_stride', render: CricketPlayerRenderer.renderBatsmanDriveStride.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_drive_impact', render: CricketPlayerRenderer.renderBatsmanDriveImpact.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_drive_follow', render: CricketPlayerRenderer.renderBatsmanDriveFollow.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_straight_impact', render: CricketPlayerRenderer.renderBatsmanStraightImpact.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_straight_follow', render: CricketPlayerRenderer.renderBatsmanStraightFollow.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_pull_prep', render: CricketPlayerRenderer.renderBatsmanPullPrep.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_pull_impact', render: CricketPlayerRenderer.renderBatsmanPullImpact.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_pull_follow', render: CricketPlayerRenderer.renderBatsmanPullFollow.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_loft_prep', render: CricketPlayerRenderer.renderBatsmanLoftPrep.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_loft_impact', render: CricketPlayerRenderer.renderBatsmanLoftImpact.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_loft_follow', render: CricketPlayerRenderer.renderBatsmanLoftFollow.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_defend', render: CricketPlayerRenderer.renderBatsmanDefend.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_wicket', render: CricketPlayerRenderer.renderBatsmanWicket.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_1', render: CricketPlayerRenderer.renderBatsmanRunAway1.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_2', render: CricketPlayerRenderer.renderBatsmanRunAway2.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_away_1', render: CricketPlayerRenderer.renderBatsmanRunAway1.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_away_2', render: CricketPlayerRenderer.renderBatsmanRunAway2.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_towards_1', render: CricketPlayerRenderer.renderBatsmanRunTowards1.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_run_towards_2', render: CricketPlayerRenderer.renderBatsmanRunTowards2.bind(CricketPlayerRenderer) },
      { key: 'tex_batsman_celebrate', render: CricketPlayerRenderer.renderBatsmanCelebrate.bind(CricketPlayerRenderer) },
    ];

    for (const frame of batsmanFrames) {
      const btCanvas = document.createElement('canvas');
      frame.render(btCanvas);
      if (this.textures.exists(frame.key)) {
        this.textures.remove(frame.key);
      }
      this.textures.addCanvas(frame.key, btCanvas);
    }

    // ── 6b. Realistic Non-Striker Sprite (160×260) ──
    const nonStrikerCanvas = document.createElement('canvas');
    CricketPlayerRenderer.renderNonStriker(nonStrikerCanvas);
    if (this.textures.exists('tex_non_striker')) {
      this.textures.remove('tex_non_striker');
    }
    this.textures.addCanvas('tex_non_striker', nonStrikerCanvas);

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

  /**
   * Calculates consistent player scale based on 3D perspective depth (Y position)
   * and underlying texture canvas height, ensuring all human players are the exact
   * same physical human height relative to field depth with an athletic, thick build (35% wider scaleX).
   */
  private getPlayerScale(type: 'batsman' | 'bowler' | 'non_striker' | 'keeper' | 'fielder', y: number): { x: number; y: number } {
    const progress = Phaser.Math.Clamp((y - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y), 0, 1);
    // Human height on screen ranges smoothly from 98px (far horizon) to 210px (foreground) — 40% bigger
    const targetHumanHeight = (70 + progress * (150 - 70)) * 1.4;

    let texHeight = 180;
    if (type === 'batsman') texHeight = 300;
    else if (type === 'bowler' || type === 'non_striker') texHeight = 260;
    else if (type === 'keeper' || type === 'fielder') texHeight = 180;

    const scaleY = targetHumanHeight / texHeight;
    const scaleX = scaleY * 1.35; // 35% wider build to make players thicker & athletic

    return { x: scaleX, y: scaleY };
  }

  private setPlayerScale(sprite: Phaser.GameObjects.Sprite, type: 'batsman' | 'bowler' | 'non_striker' | 'keeper' | 'fielder', y: number) {
    const s = this.getPlayerScale(type, y);
    sprite.setScale(s.x, s.y);
    return s;
  }

  private getBatScale(y: number): number {
    const progress = Phaser.Math.Clamp((y - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y), 0, 1);
    // Bat height on screen ranges smoothly from ~36px (far) to ~73px (foreground) — 40% bigger
    const targetBatLength = (26 + progress * (52 - 26)) * 1.4;
    return targetBatLength / 106;
  }

  private createPlayers() {
    // ── Fielders in Authentic Balanced Cricket Positions ───────────────────
    const fieldingPositions = [
      { x: CENTER_X + 220, y: HORIZON_Y + 30 },  // Deep Mid-Off
      { x: CENTER_X - 220, y: HORIZON_Y + 30 },  // Deep Mid-On
      { x: CENTER_X + 340, y: HORIZON_Y + 60 },  // Deep Extra Cover
      { x: CENTER_X - 340, y: HORIZON_Y + 60 },  // Deep Mid-Wicket
      { x: CENTER_X + 410, y: HORIZON_Y + 140 }, // Deep Point
      { x: CENTER_X - 410, y: HORIZON_Y + 140 }, // Deep Square Leg
      { x: CENTER_X + 160, y: HORIZON_Y + 15 },  // Long-Off
      { x: CENTER_X - 160, y: HORIZON_Y + 15 },  // Long-On
    ];

    this.fielders = [];
    for (const pos of fieldingPositions) {
      const s = this.getPlayerScale('fielder', pos.y);
      const progress = Phaser.Math.Clamp((pos.y - HORIZON_Y) / (GAME_H - HORIZON_Y), 0, 1);
      const depth = 8 + Math.floor(progress * 4);

      const fielder = this.add.sprite(pos.x, pos.y, 'tex_fielder')
        .setScale(s.x, s.y)
        .setDepth(depth);
      fielder.setData('startX', pos.x);
      fielder.setData('startY', pos.y);
      fielder.setData('startScaleX', s.x);
      fielder.setData('startScaleY', s.y);
      this.fielders.push(fielder);
    }

    if (this.role === 'batting') {
      this.bowlerRestX = CENTER_X;
      this.bowlerRestY = 200;
      this.bowler = this.add.sprite(this.bowlerRestX, this.bowlerRestY, 'tex_bowler_idle').setOrigin(0.5, 1).setDepth(9);
      this.setPlayerScale(this.bowler, 'bowler', 200);

      this.nonStriker = this.add.sprite(CENTER_X - 45, 204, 'tex_non_striker').setOrigin(0.5, 1).setDepth(9);
      this.setPlayerScale(this.nonStriker, 'non_striker', 204);

      this.keeper = this.add.sprite(CENTER_X, 675, 'tex_fielder').setOrigin(0.5, 1).setDepth(11).setVisible(false);
      this.setPlayerScale(this.keeper, 'keeper', 675);

      this.batsman = this.add.sprite(CENTER_X - 45, 575, 'tex_batsman_stance').setOrigin(0.5, 1).setDepth(11);
      this.setPlayerScale(this.batsman, 'batsman', 575);

      this.bat = this.add.sprite(CENTER_X - 4, 550, 'tex_bat')
        .setOrigin(0.5, 0).setScale(this.getBatScale(575)).setAngle(-30).setDepth(12).setVisible(false);
      this.startBatsmanIdleAnimation();
    } else {
      // Bowling view: Prominent foreground players and clearly visible far batsman & keeper
      this.bowlerRestX = CENTER_X - 60;
      this.bowlerRestY = 650;
      this.bowler = this.add.sprite(this.bowlerRestX, this.bowlerRestY, 'tex_bowler_idle').setOrigin(0.5, 1).setDepth(11);
      this.setPlayerScale(this.bowler, 'bowler', 650);

      this.nonStriker = this.add.sprite(CENTER_X + 80, 650, 'tex_non_striker').setOrigin(0.5, 1).setDepth(10);
      this.setPlayerScale(this.nonStriker, 'non_striker', 650);

      this.keeper = this.add.sprite(CENTER_X, 185, 'tex_fielder').setOrigin(0.5, 1).setDepth(4);
      this.setPlayerScale(this.keeper, 'keeper', 185);

      this.batsman = this.add.sprite(CENTER_X - 16, 215, 'tex_batsman_stance').setOrigin(0.5, 1).setDepth(7);
      this.setPlayerScale(this.batsman, 'batsman', 215);

      this.bat = this.add.sprite(CENTER_X - 4, 195, 'tex_bat')
        .setOrigin(0.5, 0).setScale(this.getBatScale(215)).setAngle(-30).setDepth(8).setVisible(false);
    }

    // ── Stumps: 3 tall cylindrical with bails ──────────────────────────────────
    this.batsmanStumps = this.add.graphics();
    this.batsmanStumps.setPosition(CENTER_X, this.role === 'bowling' ? 200 : 665);
    this.batsmanStumps.setDepth(this.role === 'bowling' ? 5 : 12);

    this.bowlerStumps = this.add.graphics();
    this.bowlerStumps.setPosition(CENTER_X, this.role === 'bowling' ? 665 : 200);
    this.bowlerStumps.setDepth(5);

    // Bail objects (separate for animation)
    this.bail1 = this.add.graphics().setDepth(13);
    this.bail2 = this.add.graphics().setDepth(13);

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
  // BATSMAN ANIMATION & IDLE CONTROLLERS
  // ─────────────────────────────────────────────────────────────────────────────

  private startBatsmanIdleAnimation() {
    this.stopBatsmanIdleAnimation();
    if (!this.batsman || !this.batsman.active || this.role !== 'batting') return;

    this.batsman.setTexture('tex_batsman_stance');
    let tapCycle = 0;

    this.batsmanIdleTimer = this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        if (!this.batsman || !this.batsman.active || this.isBowling || this.isHit || this.isRunning || this.role !== 'batting') return;
        tapCycle++;
        if (tapCycle % 3 === 0) {
          this.batsman.setTexture('tex_batsman_tap');
          this.time.delayedCall(180, () => {
            if (!this.batsman || !this.batsman.active || this.isBowling || this.isHit || this.isRunning || this.role !== 'batting') return;
            this.batsman.setTexture('tex_batsman_stance');
          });
        }
      }
    });
  }

  private stopBatsmanIdleAnimation() {
    if (this.batsmanIdleTimer) {
      this.batsmanIdleTimer.remove();
      this.batsmanIdleTimer = undefined;
    }
    if (this.batsman && this.batsman.active) {
      this.tweens.killTweensOf(this.batsman);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STUMP & BAIL DRAWING
  // ─────────────────────────────────────────────────────────────────────────────

  private drawStumpsOn(gfx: Phaser.GameObjects.Graphics, near: boolean) {
    gfx.clear();
    const h = near ? 115 : 36;
    const gap = near ? 22 : 10;
    const sw = near ? 9 : 3.5;

    for (let s = -1; s <= 1; s++) {
      const sx = s * gap;
      // Directional Ambient Ground Shadow on Clay
      gfx.fillStyle(0x000000, 0.45);
      gfx.fillEllipse(sx + (near ? 6 : 2), 2, sw * 2.8, near ? 6 : 2.5);

      // Brass Ground Ferrule at stump base
      gfx.fillStyle(0x1e293b, 1);
      gfx.fillRoundedRect(sx - sw / 2 - 0.5, -4, sw + 1, 4, 1);

      // Cylindrical Black / Dark Wood Stump Body (Stick Cricket style)
      gfx.fillStyle(0x18181b, 1);
      gfx.fillRoundedRect(sx - sw / 2, -h, sw, h, 2);

      // Left shadow curve
      gfx.fillStyle(0x09090b, 0.85);
      gfx.fillRect(sx - sw / 2, -h, sw * 0.35, h);

      // Right core highlight strip
      gfx.fillStyle(0x71717a, 0.55);
      gfx.fillRect(sx - sw / 2 + sw * 0.45, -h + 2, 1.5, h - 4);

      // Red Competition Bands (Stick Cricket style)
      gfx.fillStyle(0xdc2626, 1);
      gfx.fillRect(sx - sw / 2, -Math.floor(h * 0.72), sw, near ? 14 : 5);
      gfx.fillRect(sx - sw / 2, -Math.floor(h * 0.32), sw, near ? 7 : 3);

      // Black Crown Spigot Cap
      gfx.fillStyle(0x0a0a0a, 1);
      gfx.fillRoundedRect(sx - sw / 2, -h, sw, near ? 5 : 2, { tl: 2, tr: 2, bl: 0, br: 0 });
    }
  }

  private redrawStumps() {
    const isBatting = this.role === 'batting';
    this.drawStumpsOn(this.batsmanStumps, isBatting);
    this.drawStumpsOn(this.bowlerStumps, !isBatting);
  }

  private redrawBails() {
    const isBatting = this.role === 'batting';
    const nearH = 115;
    const farH = 36;
    const bailsY = isBatting ? 665 - nearH : 200 - farH;
    const bailsX = CENTER_X;
    const gap = isBatting ? 22 : 10;
    const bailW = isBatting ? 24 : 11;
    const bailH = isBatting ? 5 : 2.5;

    this.bail1.clear();
    this.bail1.setPosition(bailsX, bailsY);
    this.bail1.fillStyle(0x18181b, 1);
    this.bail1.fillRoundedRect(-gap / 2 - bailW / 2, 0, bailW, bailH, 1.5);
    this.bail1.fillStyle(0xdc2626, 0.9);
    this.bail1.fillRect(-gap / 2 - bailW / 2 + 2, 1, bailW - 4, bailH - 2);

    this.bail2.clear();
    this.bail2.setPosition(bailsX, bailsY);
    this.bail2.fillStyle(0x18181b, 1);
    this.bail2.fillRoundedRect(gap / 2 - bailW / 2, 0, bailW, bailH, 1.5);
    this.bail2.fillStyle(0xdc2626, 0.9);
    this.bail2.fillRect(gap / 2 - bailW / 2 + 2, 1, bailW - 4, bailH - 2);
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
      this.bowlerRestX = CENTER_X;
      this.bowlerRestY = 200;
      this.bowler.setPosition(this.bowlerRestX, this.bowlerRestY).setTexture('tex_bowler_idle').setOrigin(0.5, 1).setDepth(9);
      this.setPlayerScale(this.bowler, 'bowler', 200);

      this.nonStriker.setPosition(CENTER_X - 45, 204).setTexture('tex_non_striker').setOrigin(0.5, 1).setDepth(9);
      this.setPlayerScale(this.nonStriker, 'non_striker', 204);

      this.keeper.setPosition(CENTER_X, 675).setOrigin(0.5, 1).setDepth(11).setVisible(false);
      this.setPlayerScale(this.keeper, 'keeper', 675);

      this.batsman.setPosition(CENTER_X - 45, 575).setOrigin(0.5, 1).setTexture('tex_batsman_stance').setDepth(11);
      this.setPlayerScale(this.batsman, 'batsman', 575);

      this.bat.setPosition(CENTER_X - 4, 550).setScale(this.getBatScale(575)).setDepth(12).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, 665).setScale(1).setAngle(0).setDepth(12);
      this.bowlerStumps.setPosition(CENTER_X, 200).setScale(1).setAngle(0).setDepth(5);
      this.bail1.setPosition(CENTER_X, 665 - 115).setScale(1).setAngle(0);
      this.bail2.setPosition(CENTER_X, 665 - 115).setScale(1).setAngle(0);
      this.startBatsmanIdleAnimation();
    } else {
      // Bowling view: Prominent foreground players and clearly visible far batsman & keeper
      this.bowlerRestX = CENTER_X - 60;
      this.bowlerRestY = 650;
      this.bowler.setPosition(this.bowlerRestX, this.bowlerRestY).setTexture('tex_bowler_idle').setOrigin(0.5, 1).setDepth(11);
      this.setPlayerScale(this.bowler, 'bowler', 650);

      this.nonStriker.setPosition(CENTER_X + 80, 650).setOrigin(0.5, 1).setDepth(10);
      this.setPlayerScale(this.nonStriker, 'non_striker', 650);

      this.keeper.setPosition(CENTER_X, 185).setOrigin(0.5, 1).setDepth(4);
      this.setPlayerScale(this.keeper, 'keeper', 185);

      this.batsman.setPosition(CENTER_X - 16, 215).setOrigin(0.5, 1).setTexture('tex_batsman_stance').setDepth(7);
      this.setPlayerScale(this.batsman, 'batsman', 215);

      this.bat.setPosition(CENTER_X - 4, 195).setScale(this.getBatScale(215)).setDepth(8).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, 200).setScale(1).setAngle(0).setDepth(5);
      this.bowlerStumps.setPosition(CENTER_X, 665).setScale(1).setAngle(0).setDepth(5);
      this.redrawBails();
      this.stopBatsmanIdleAnimation();
      this.batsman.setTexture('tex_batsman_stance');
    }

    for (const fielder of this.fielders) {
      const startX = fielder.getData('startX');
      const startY = fielder.getData('startY');
      const startScaleX = fielder.getData('startScaleX');
      const startScaleY = fielder.getData('startScaleY');
      if (startX !== undefined && startY !== undefined) {
        fielder.setPosition(startX, startY);
        if (startScaleX !== undefined && startScaleY !== undefined) fielder.setScale(startScaleX, startScaleY);
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
    const bailsY = this.role === 'bowling' ? PITCH_TOP_Y - 24 : PITCH_BOT_Y - 78;
    this.bail1.setPosition(CENTER_X, bailsY).setAngle(0).setAlpha(1);
    this.bail2.setPosition(CENTER_X, bailsY).setAngle(0).setAlpha(1);
    this.batsmanStumps.setAngle(0).setPosition(CENTER_X, this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y);
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);

    this.deliveryType = type;
    const mult = 0.5 + powerMultiplier;

    // Delivery release point (bowler's bowling hand at crease)
    const releaseX = this.role === 'bowling' ? this.bowlerRestX + 30 : CENTER_X;
    const releaseY = this.role === 'bowling' ? 620 : 200;
    const targetStumpY = this.role === 'bowling' ? 200 : 665;
    const targetStumpX = CENTER_X + (Math.random() - 0.5) * 6; // Target directly onto the stumps

    let speed = 700;
    if (type === 'fast') speed = 700 + Math.random() * 120;
    else if (type === 'slow') speed = 280 + Math.random() * 60;
    else if (type === 'yorker') speed = 640 + Math.random() * 80;
    else if (type === 'bouncer') speed = 560 + Math.random() * 100;
    else if (type === 'swing') speed = 480 + Math.random() * 80;
    else speed = 420 + Math.random() * 70; // spin

    const finalSpeed = speed * mult;
    const distY = Math.abs(targetStumpY - releaseY);
    const timeToStumps = distY / finalSpeed;
    const baseVx = (targetStumpX - releaseX) / timeToStumps;

    const velY = this.role === 'bowling' ? -finalSpeed : finalSpeed;

    this.swingAccel = 0;
    this.spinTurned = false;

    // Calculate physics values based on delivery type
    if (type === 'fast') {
      this.ballVelocity = { x: baseVx, y: velY };
      this.ballVelocityZ = -100 * mult;
      this.hud.updateStatus("Fast pace! Straight at the stumps!", "#fca5a5");
      this.audioManager.playWhoosh();
    } else if (type === 'slow') {
      this.ballVelocity = { x: baseVx, y: velY };
      this.ballVelocityZ = 280 * mult;
      this.hud.updateStatus("Slower ball... hold your swing.", "#93c5fd");
    } else if (type === 'yorker') {
      this.ballVelocity = { x: baseVx, y: velY };
      this.ballVelocityZ = -220 * mult;
      this.hud.updateStatus("Yorker! Direct at the stump base!", "#fbbf24");
    } else if (type === 'bouncer') {
      this.ballVelocity = { x: baseVx, y: velY };
      this.ballVelocityZ = 450 * mult;
      this.hud.updateStatus("Bouncer! Watch the rising ball!", "#ef4444");
    } else if (type === 'swing') {
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      this.swingAccel = this.spinDirection * 90;
      this.ballVelocity = { x: baseVx - (this.swingAccel * timeToStumps * 0.5), y: velY };
      this.ballVelocityZ = 50 * mult;
      this.hud.updateStatus("Swing bowling! Moving into the stumps!", "#a855f7");
    } else {
      // spin
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      const prePitchTargetX = targetStumpX - this.spinDirection * 18;
      const prePitchVx = (prePitchTargetX - releaseX) / timeToStumps;
      this.ballVelocity = { x: prePitchVx, y: velY };
      this.ballVelocityZ = 100 * mult;
      this.hud.updateStatus("Spin! Turning towards the stumps!", "#fde047");
    }

    // Animate the run-up, then start ball physics
    this.animateBowlerRunup(() => {
      // Set ball start position at bowler's release hand
      this.ballDepth = releaseY;
      this.ballHeight = 60;
      this.ballVelocityZ = type === 'fast' ? -100 * mult :
                           type === 'bouncer' ? 450 * mult :
                           type === 'slow' ? 280 * mult :
                           type === 'yorker' ? -220 * mult : 100 * mult;

      this.ball.setPosition(releaseX, this.ballDepth - this.ballHeight);
      const startScale = this.initialBallScale;
      this.ball.setScale(startScale);
      this.ball.setVisible(true);

      this.ballShadow.setPosition(releaseX, this.ballDepth);
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

  private animateBowlerRunup(onRelease: () => void) {
    const isBatting = this.role === 'batting';
    const runupDir = isBatting ? 1 : -1; // +1 = down (toward batsman), -1 = up
    const approachDist = isBatting ? 24 : 18;
    const jumpDist = isBatting ? 12 : 9;
    const baseScale = this.getPlayerScale('bowler', this.bowlerRestY);

    // ── Phase 1: Fast Approach / Stride ──
    if (this.batsman && this.batsman.active) {
      this.stopBatsmanIdleAnimation();
      this.batsman.setTexture('tex_batsman_backlift');
    }
    this.bowler.setTexture('tex_bowler_stride');
    this.tweens.add({
      targets: this.bowler,
      y: this.bowlerRestY + runupDir * approachDist,
      x: this.bowlerRestX + (Math.random() - 0.5) * 4,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // ── Phase 2: High Airborne Gather Leap & Coil ──
        this.bowler.setTexture('tex_bowler_gather');
        this.tweens.add({
          targets: this.bowler,
          y: this.bowlerRestY + runupDir * (approachDist + jumpDist),
          scaleY: baseScale.y * 1.05,
          scaleX: baseScale.x * 1.02,
          duration: 160,
          ease: 'Quad.easeOut',
          onComplete: () => {
            // ── Phase 3: 12 O'Clock High Delivery Release ──
            this.bowler.setTexture('tex_bowler_release');
            this.bowler.setScale(baseScale.x, baseScale.y);

            // Release ball at apex of bowling arc!
            onRelease();

            // ── Phase 4: Follow-Through & Deceleration ──
            this.time.delayedCall(80, () => {
              if (!this.bowler.active) return;
              this.bowler.setTexture('tex_bowler_followthrough');
              this.tweens.add({
                targets: this.bowler,
                y: this.bowlerRestY + runupDir * (approachDist + jumpDist + 4),
                x: this.bowlerRestX + (isBatting ? 4 : 8),
                duration: 280,
                ease: 'Sine.easeOut',
                onComplete: () => {
                  // Settle smoothly back to idle stance
                  this.tweens.add({
                    targets: this.bowler,
                    y: this.bowlerRestY,
                    x: this.bowlerRestX,
                    duration: 320,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                      if (this.bowler.active) {
                        this.bowler.setTexture('tex_bowler_idle');
                      }
                    }
                  });
                }
              });
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

    const sweetSpotY = this.role === 'bowling' ? 215 : 575;
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
      if (isLofted && Math.random() > 0.85) {
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
      if (this.hasSteppedOut) {
        message = 'STUMPED OUT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 50;
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5);
        this.ballVelocityZ = 20;
        this.audioManager.playHit(50);
      } else {
        message = 'Defensive Contact, 0 runs.';
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
    this.stopBatsmanIdleAnimation();

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

    if (direction === 'left') {
      // Cover Drive / Off Drive: Stride -> Impact -> High Elbow Follow-Through
      this.batsman.setTexture('tex_batsman_drive_stride');
      this.tweens.add({ targets: this.batsman, x: this.batsman.x - 14, duration: 140, yoyo: true, ease: 'Sine.easeOut' });
      this.time.delayedCall(110, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_drive_impact');
      });
      this.time.delayedCall(260, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_drive_follow');
      });
      this.time.delayedCall(620, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_stance');
        if (!this.isHit && !this.isRunning) this.startBatsmanIdleAnimation();
      });
    } else if (direction === 'right') {
      // Pull Shot / Cut: Back-Foot Prep -> Impact -> Swivel Follow-Through
      this.batsman.setTexture('tex_batsman_pull_prep');
      this.tweens.add({ targets: this.batsman, x: this.batsman.x + 10, duration: 120, yoyo: true, ease: 'Sine.easeOut' });
      this.time.delayedCall(90, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_pull_impact');
      });
      this.time.delayedCall(240, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_pull_follow');
      });
      this.time.delayedCall(600, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_stance');
        if (!this.isHit && !this.isRunning) this.startBatsmanIdleAnimation();
      });
    } else if (direction === 'up') {
      // Lofted Slog / Six: Deep Power Base -> Uppercut Impact -> Skyward Follow-Through
      this.batsman.setTexture('tex_batsman_loft_prep');
      const currentBatsmanScaleY = this.getPlayerScale('batsman', this.batsman.y);
      this.tweens.add({ targets: this.batsman, scaleY: currentBatsmanScaleY * 0.94, duration: 110, yoyo: true, ease: 'Sine.easeInOut' });
      this.time.delayedCall(100, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_loft_impact');
      });
      this.time.delayedCall(250, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_loft_follow');
      });
      this.time.delayedCall(680, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_stance');
        if (!this.isHit && !this.isRunning) this.startBatsmanIdleAnimation();
      });
    } else {
      // Straight Punch / Drive: Direct Impact -> High Vertical Follow-Through
      this.batsman.setTexture('tex_batsman_straight_impact');
      this.tweens.add({ targets: this.batsman, x: this.batsman.x - 6, duration: 120, yoyo: true, ease: 'Sine.easeInOut' });
      this.time.delayedCall(140, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_straight_follow');
      });
      this.time.delayedCall(540, () => {
        if (!this.batsman.active) return;
        this.batsman.setTexture('tex_batsman_stance');
        if (!this.isHit && !this.isRunning) this.startBatsmanIdleAnimation();
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TIMING — PRESERVED IDENTICALLY
  // ─────────────────────────────────────────────────────────────────────────────

  private computeTiming(direction: 'left' | 'right' | 'up' | 'straight'): CricketTiming {
    const sweetSpotY = this.role === 'bowling' ? 215 : 575;
    const distance = Math.abs(this.ballDepth - sweetSpotY);
    const targetX = CENTER_X;
    const dx = Math.abs(this.ball.x - targetX);
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
    this.stopBatsmanIdleAnimation();
    this.isRunning = true;

    // Check movement direction:
    // If player is at bottom (> CENTER_Y), they run UP (away from camera).
    // If player is at top (< CENTER_Y), they run DOWN (towards camera).
    const isBatsmanRunningUp = this.batsman.y > CENTER_Y;
    const isNonStrikerRunningUp = this.nonStriker.y > CENTER_Y;

    const batsmanTargetY = isBatsmanRunningUp ? 204 : 575;
    const batsmanTargetX = isBatsmanRunningUp ? CENTER_X - 18 : CENTER_X - 45;
    const batsmanTargetScale = this.getPlayerScale('batsman', batsmanTargetY);

    const nonStrikerTargetY = isNonStrikerRunningUp ? 204 : 575;
    const nonStrikerTargetX = isNonStrikerRunningUp ? CENTER_X + 22 : CENTER_X + 46;
    const nonStrikerTargetScale = this.getPlayerScale('non_striker', nonStrikerTargetY);

    // Running Stride Cycle Animation
    let runStep = 0;
    const runCycleEvent = this.time.addEvent({
      delay: 140,
      repeat: 6,
      callback: () => {
        runStep++;
        // Choose forward/away stride textures based on real run direction
        const bTex = isBatsmanRunningUp
          ? (runStep % 2 === 0 ? 'tex_batsman_run_away_1' : 'tex_batsman_run_away_2')
          : (runStep % 2 === 0 ? 'tex_batsman_run_towards_1' : 'tex_batsman_run_towards_2');

        const nsTex = isNonStrikerRunningUp
          ? (runStep % 2 === 0 ? 'tex_batsman_run_away_1' : 'tex_batsman_run_away_2')
          : (runStep % 2 === 0 ? 'tex_batsman_run_towards_1' : 'tex_batsman_run_towards_2');

        if (this.batsman.active) this.batsman.setTexture(bTex);
        if (this.nonStriker.active) this.nonStriker.setTexture(nsTex);
      }
    });

    this.tweens.add({
      targets: this.batsman,
      x: batsmanTargetX,
      y: batsmanTargetY,
      scaleX: batsmanTargetScale.x,
      scaleY: batsmanTargetScale.y,
      duration: 850,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: this.nonStriker,
      x: nonStrikerTargetX,
      y: nonStrikerTargetY,
      scaleX: nonStrikerTargetScale.x,
      scaleY: nonStrikerTargetScale.y,
      duration: 850,
      ease: 'Linear',
      onComplete: () => {
        runCycleEvent.remove();
        if (currentRun < runs) {
          // Slide/grounding turn pause before taking next run
          this.time.delayedCall(100, () => {
            this.autoRunBatsmen(runs, currentRun + 1);
          });
        } else {
          this.isRunning = false;
          this.resetBatsmenPositions();
        }
      }
    });
  }

  private resetBatsmenPositions() {
    this.stopBatsmanIdleAnimation();
    if (this.role === 'batting') {
      this.batsman.setPosition(CENTER_X - 45, 575).setOrigin(0.5, 1).setTexture('tex_batsman_stance');
      this.setPlayerScale(this.batsman, 'batsman', 575);

      this.bat.setPosition(CENTER_X - 4, 550).setScale(this.getBatScale(575));

      this.nonStriker.setPosition(CENTER_X - 45, 204).setTexture('tex_non_striker').setOrigin(0.5, 1);
      this.setPlayerScale(this.nonStriker, 'non_striker', 204);

      this.startBatsmanIdleAnimation();
    } else {
      this.batsman.setPosition(CENTER_X - 16, 215).setOrigin(0.5, 1).setTexture('tex_batsman_stance');
      this.setPlayerScale(this.batsman, 'batsman', 215);

      this.bat.setPosition(CENTER_X - 4, 195).setScale(this.getBatScale(215));

      this.nonStriker.setPosition(CENTER_X + 80, 650).setOrigin(0.5, 1).setTexture('tex_non_striker');
      this.setPlayerScale(this.nonStriker, 'non_striker', 650);

      this.batsman.setTexture('tex_batsman_stance');
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

    if (this.batsman && this.batsman.active) {
      this.batsman.setTexture('tex_batsman_defend');
      this.time.delayedCall(450, () => {
        if (this.batsman && this.batsman.active && !this.isBowling) {
          this.batsman.setTexture('tex_batsman_stance');
          this.startBatsmanIdleAnimation();
        }
      });
    }

    // Ball safely collected by keeper (Not out)
    this.addHistory('0');
    if (this.deliveryType === 'spin') {
      this.hud.updateStatus("Beaten by spin! Missed the stumps.", "#38bdf8");
    } else if (this.deliveryType === 'bouncer') {
      this.hud.updateStatus("Bounced high over the stumps! Dot ball.", "#94a3b8");
    } else if (this.deliveryType === 'swing') {
      this.hud.updateStatus("Swung past outside the off stump!", "#a855f7");
    } else {
      this.hud.updateStatus("Missed! Safely collected by keeper.", "#94a3b8");
    }

    if (!this.checkInningsEnd()) {
      if (this.role === 'bowling') {
        this.time.delayedCall(1000, () => this.startNextBallTimer(3));
      } else {
        this.startNextBallTimer(3);
      }
    }
  }

  private playWicketAnimation() {
    if (this.batsman && this.batsman.active) {
      this.stopBatsmanIdleAnimation();
      this.batsman.setTexture('tex_batsman_wicket');
    }

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
    const isBatting = this.role === 'batting';
    const stumpX = isBatting ? CENTER_X + 16 : CENTER_X;
    const stumpY = isBatting ? 525 : PITCH_TOP_Y + 18;
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
    if (target === this.batsman) {
      this.stopBatsmanIdleAnimation();
      target.setTexture('tex_batsman_celebrate');
    }
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
      if (this.deliveryType === 'swing') {
        this.ballVelocity.x += this.swingAccel * dt;
      }

      this.ball.x += this.ballVelocity.x * dt;
      this.ballDepth += this.ballVelocity.y * dt;

      // Vertical physics (bounce)
      this.ballVelocityZ -= this.gravity * dt;
      this.ballHeight += this.ballVelocityZ * dt;

      if (this.ballHeight < 0) {
        this.ballHeight = 0;
        this.ballVelocityZ = Math.abs(this.ballVelocityZ) * 0.6;
        if (this.deliveryType === 'spin' && !this.spinTurned) {
          this.spinTurned = true;
          this.ballVelocity.x += this.spinDirection * 120;
        }
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

      // ── Physical 3D Stump Collision Check ──
      const isBatting = this.role === 'batting';
      const stumpX = CENTER_X;
      const stumpDepth = isBatting ? 665 : 200;
      const stumpMaxH = isBatting ? 120 : 40;
      const stumpW = isBatting ? 26 : 13;

      const isCrossingStumpPlane = isBatting
        ? (this.ballDepth >= 650 && this.ballDepth <= 675)
        : (this.ballDepth <= 210 && this.ballDepth >= 195);

      if (isCrossingStumpPlane && !this.isHit && this.isBowling) {
        const hitsStumps = Math.abs(this.ball.x - stumpX) <= stumpW &&
                           this.ballHeight <= stumpMaxH &&
                           this.ballHeight >= 0;

        if (hitsStumps) {
          this.isBowling = false;
          this.isHit = false;
          this.ballVelocity = {
            x: (this.ball.x - stumpX) * 3 + (Math.random() - 0.5) * 60,
            y: isBatting ? 140 : -140
          };
          this.ballVelocityZ = 80;
          this.trailEmitter.stop();
          this.handleWicket();
          return;
        }
      }

      // Missed? (Ball passed behind the stumps into the keeper's gloves)
      const isMissed = isBatting ? this.ballDepth > 685 : this.ballDepth < 180;
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
