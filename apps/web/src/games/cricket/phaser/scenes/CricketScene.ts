import Phaser from "phaser";
import type { CricketState, CricketDelivery, CricketShot, CricketTiming } from "@gaming-hub/game-engine";
import { CricketHUDManager } from "../managers/CricketHUDManager";
import { CricketAudioManager } from "../managers/CricketAudioManager";
import { useMultiplayerStore } from "../../../../store/multiplayerStore";

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
  private gravity = 1200; // pixels per second squared for Z axis
  private deliveryType: 'fast' | 'slow' | 'spin' = 'fast';
  private spinDirection: number = 1;
  private isBowling = false;
  private isHit = false;
  private initialBallScale = 0.4;
  private finalBallScale = 1.2;
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
  
  private onGameOver!: (runs: number, wickets: number, won: boolean) => void;
  private nextBallTimerEvent?: Phaser.Time.TimerEvent;

  // Multiplayer (server-driven) state
  private mySeat: number | null = null;
  private remoteState: CricketState | null = null;
  private namesBySeat: Record<number, string> = {};
  private unsubscribe?: () => void;
  private multiplayerOver = false;

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
    this.maxBalls = data.overs ? data.overs * 6 : 6; // Default to 1 over
    this.multiplayerOver = false;
    
    // Generate target score (e.g. 15 runs per over on average) - AI mode only.
    // In multiplayer the target is set by the server after the first innings.
    this.targetScore = (data.overs || 1) * 15 + Math.floor(Math.random() * ((data.overs || 1) * 5));

    // In multiplayer the perspective is derived from the authoritative toss:
    // whoever the server says is batting is "our batsman" at the bottom.
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
      // Load best score from local storage
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
    // In many browsers, this won't actually play until the user interacts,
    // which is fine since they click to start bowling/batting soon anyway.
    this.audioManager.playAmbientMurmur();

    this.events.once('shutdown', () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = undefined;
      }
      this.audioManager.destroy();
    });

    if (this.mode === "multiplayer") {
      this.unsubscribe = useMultiplayerStore.subscribe((s, prev) => {
        if (s.gameState === prev.gameState && s.lastEvents === prev.lastEvents) return;
        if (!s.gameState) return;
        this.applyRemoteState(s.gameState as unknown as CricketState, s.lastEvents);
      });

      const st = useMultiplayerStore.getState();
      if (st.gameState) {
        this.applyRemoteState(st.gameState as unknown as CricketState, []);
        const initial = st.gameState as unknown as CricketState;
        this.hud.updateStatus(`${this.nameFor(initial.battingFirst)} won the toss and will bat first!`, "#fbbf24");
        this.time.delayedCall(2500, () => {
          if (this.remoteState && !this.remoteState.finished) this.updateTurnStatus(this.remoteState);
        });
      } else {
        this.hud.updateStatus("Waiting for the match to start...", "#ffffff");
      }
      return;
    }

    // Start auto bowl timer for the very first ball
    this.startNextBallTimer(3);
  }

  private drawBackground() {
    const graphics = this.add.graphics();

    // Sky with gradient
    graphics.fillGradientStyle(0x020617, 0x020617, 0x0f172a, 0x0f172a, 1);
    graphics.fillRect(0, 0, GAME_W, HORIZON_Y);

    // Starry night subtle effect
    graphics.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 50; i++) {
      graphics.fillCircle(Math.random() * GAME_W, Math.random() * HORIZON_Y, Math.random() * 1.5);
    }

    // Stadium Lights (Glowing)
    const drawLight = (x: number, y: number) => {
      // Glow
      graphics.fillStyle(0xffffff, 0.1);
      graphics.fillCircle(x, y, 40);
      graphics.fillStyle(0xffffff, 0.2);
      graphics.fillCircle(x, y, 25);
      // Core
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(x, y, 12);
    };
    
    drawLight(100, 50);
    drawLight(200, 30);
    drawLight(GAME_W - 100, 50);
    drawLight(GAME_W - 200, 30);
    
    // Light beams
    graphics.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.15, 0.15, 0, 0);
    graphics.fillTriangle(100, 50, 0, HORIZON_Y, 200, HORIZON_Y);
    graphics.fillTriangle(GAME_W - 100, 50, GAME_W - 200, HORIZON_Y, GAME_W, HORIZON_Y);

    // Stadium stands (layered behind crowd)
    graphics.fillStyle(0x0f172a, 1); // Darker stands
    graphics.fillRect(0, HORIZON_Y - 70, GAME_W, 70);
    graphics.lineStyle(2, 0x334155, 0.4);
    graphics.beginPath();
    graphics.moveTo(0, HORIZON_Y - 20); graphics.lineTo(GAME_W, HORIZON_Y - 20);
    graphics.moveTo(0, HORIZON_Y - 40); graphics.lineTo(GAME_W, HORIZON_Y - 40);
    graphics.moveTo(0, HORIZON_Y - 60); graphics.lineTo(GAME_W, HORIZON_Y - 60);
    graphics.strokePath();

    // Grass with professional stadium stripes
    for (let y = HORIZON_Y; y < GAME_H; y += 40) {
      const isDark = Math.floor((y - HORIZON_Y) / 40) % 2 === 0;
      // Using rich emerald/green hues
      graphics.fillStyle(isDark ? 0x064e3b : 0x047857, 1);
      graphics.fillRect(0, y, GAME_W, 40);
    }

    // Horizon line (a white line representing stadium boundary)
    graphics.lineStyle(4, 0xffffff, 0.8);
    graphics.beginPath();
    graphics.moveTo(0, HORIZON_Y);
    graphics.lineTo(GAME_W, HORIZON_Y);
    graphics.strokePath();

    // Pitch (Trapezoid) with gradient
    graphics.fillGradientStyle(0xb45309, 0xb45309, 0xd97706, 0xd97706, 1); // Rich amber/dirt color
    graphics.beginPath();
    graphics.moveTo(CENTER_X - PITCH_TOP_W / 2, PITCH_TOP_Y);
    graphics.lineTo(CENTER_X + PITCH_TOP_W / 2, PITCH_TOP_Y);
    graphics.lineTo(CENTER_X + PITCH_BOT_W / 2, PITCH_BOT_Y);
    graphics.lineTo(CENTER_X - PITCH_BOT_W / 2, PITCH_BOT_Y);
    graphics.closePath();
    graphics.fillPath();

    // Creases (Perspective lines)
    graphics.lineStyle(4, 0xffffff, 0.9);
    // Top crease
    graphics.beginPath();
    graphics.moveTo(CENTER_X - PITCH_TOP_W/2 - 15, PITCH_TOP_Y + 20);
    graphics.lineTo(CENTER_X + PITCH_TOP_W/2 + 15, PITCH_TOP_Y + 20);
    graphics.strokePath();
    // Bottom crease
    graphics.beginPath();
    graphics.moveTo(CENTER_X - PITCH_BOT_W/2 + 25, PITCH_BOT_Y - 40);
    graphics.lineTo(CENTER_X + PITCH_BOT_W/2 - 25, PITCH_BOT_Y - 40);
    graphics.strokePath();
  }

  private generateTextures() {
    const g = this.add.graphics();
    
    // Ball
    g.clear();
    g.fillStyle(0xe11d48, 1);
    g.fillCircle(8, 8, 8);
    g.lineStyle(2, 0x000000);
    g.strokeCircle(8, 8, 8);
    g.generateTexture('tex_ball', 16, 16);

    // Particle - basic white circle
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('tex_particle', 8, 8);

    // Dust particle - slightly brown
    g.clear();
    g.fillStyle(0xd6d3d1, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('tex_dust', 6, 6);

    // Fielder (Human in white uniform)
    g.clear();
    // Head
    g.fillStyle(0xfca5a5, 1); // Skin tone
    g.fillCircle(12, 8, 6);
    // Cap (Black dome and peak)
    g.fillStyle(0x111827, 1);
    g.beginPath();
    g.arc(12, 7, 6, Math.PI, 0);
    g.fill();
    g.fillRect(4, 7, 10, 2); // Peak
    // Body (Black jersey)
    g.fillStyle(0x111827, 1); 
    g.fillRoundedRect(5, 14, 14, 12, 4);
    // Legs (White pants)
    g.fillStyle(0xffffff, 1);
    g.fillRect(7, 26, 4, 8);
    g.fillRect(13, 26, 4, 8);
    g.generateTexture('tex_fielder', 24, 34);

    // Bowler (Human)
    g.clear();
    // Head
    g.fillStyle(0xfca5a5, 1); // Skin tone
    g.fillCircle(15, 10, 8);
    // Cap (Black dome and peak)
    g.fillStyle(0x111827, 1);
    g.beginPath();
    g.arc(15, 9, 8, Math.PI, 0);
    g.fill();
    g.fillRect(5, 9, 14, 2); // Peak
    // Body (Black jersey)
    g.fillStyle(0x111827, 1); 
    g.fillRoundedRect(7, 18, 16, 14, 4);
    // Legs (White pants)
    g.fillStyle(0xffffff, 1);
    g.fillRect(9, 32, 5, 10);
    g.fillRect(16, 32, 5, 10);
    g.generateTexture('tex_bowler', 30, 42);

    // Batsman (Human) - MUCH LARGER & DETAILED to match bat
    g.clear();
    // Helmet Shell
    g.fillStyle(0x1e3a8a, 1); // Blue Helmet
    g.fillCircle(50, 24, 24);
    // Helmet Peak
    g.fillStyle(0x1e3a8a, 1);
    g.fillRect(26, 24, 24, 6);
    // Helmet Grill (Gray)
    g.lineStyle(2, 0xd1d5db);
    g.beginPath();
    g.moveTo(28, 30); g.lineTo(50, 44);
    g.moveTo(34, 30); g.lineTo(50, 48);
    g.strokePath();
    // Face
    g.fillStyle(0xfca5a5, 1); 
    g.fillRoundedRect(34, 28, 32, 16, 4);
    // Body (Blue Jersey)
    g.fillStyle(0x3b82f6, 1); 
    g.fillRoundedRect(24, 48, 52, 40, 8);
    // Front Arm (Sleeve)
    g.fillStyle(0x3b82f6, 1);
    g.fillRect(14, 50, 12, 24);
    // Gloves (White with Green details)
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(74, 74, 16, 16, 4);
    g.fillStyle(0x22c55e, 1); // Green trim
    g.fillRect(76, 76, 12, 4);
    // Pads (White with blue straps)
    g.fillStyle(0xffffff, 1); 
    g.fillRoundedRect(30, 88, 16, 32, 4);
    g.fillRoundedRect(54, 88, 16, 32, 4);
    // Straps
    g.fillStyle(0x1e3a8a, 1); 
    g.fillRect(30, 96, 16, 4);
    g.fillRect(30, 108, 16, 4);
    g.fillRect(54, 96, 16, 4);
    g.fillRect(54, 108, 16, 4);
    g.generateTexture('tex_batsman', 100, 120);

    // Bat (Detailed)
    g.clear();
    // Handle grip
    g.fillStyle(0x334155, 1); // Dark grey grip
    g.fillRect(3, 0, 6, 25);
    // Blade
    g.fillStyle(0xfef08a, 1); // Wood color
    g.fillRect(0, 25, 12, 50);
    // Toe guard
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 75, 12, 5);
    g.generateTexture('tex_bat', 12, 80);

    // Crowd textures (Human audience busts)
    const colors = [0xf43f5e, 0x3b82f6, 0xeab308, 0xa855f7, 0x22c55e];
    colors.forEach((color, idx) => {
      g.clear();
      // Body (Shirt)
      g.fillStyle(color, 1);
      g.fillRoundedRect(4, 10, 16, 14, 4);
      // Head
      g.fillStyle(0xfca5a5, 1); // Skin tone
      g.fillCircle(12, 6, 6);
      g.generateTexture(`tex_crowd_${idx}`, 24, 24);
    });

    // Confetti
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 12);
    g.generateTexture('tex_confetti', 8, 12);

    g.destroy();
  }

  private drawCrowd() {
    // Draw multiple rows of crowd in the stadium stands
    for (let yOffset of [-10, -25, -40]) {
      for (let i = 0; i < 60; i++) {
        const cx = (GAME_W / 60) * i + (Math.random() * 10 - 5);
        const cy = HORIZON_Y + yOffset - Math.random() * 10;
        const idx = Math.floor(Math.random() * 5);
        const scale = 0.6 + Math.random() * 0.4;
        this.add.sprite(cx, cy, `tex_crowd_${idx}`).setScale(scale);
      }
    }
  }

  private createPlayers() {
    // Fielders (Snails/Bugs randomly placed in the grass)
    for (let i = 0; i < 7; i++) {
      const px = 100 + Math.random() * (GAME_W - 200);
      const py = HORIZON_Y + 20 + Math.random() * 250;
      
      if (px > CENTER_X - 100 && px < CENTER_X + 100) continue;

      const scale = 0.5 + ((py - HORIZON_Y) / (GAME_H - HORIZON_Y)) * 0.8;
      
      const fielder = this.add.sprite(px, py, 'tex_fielder').setScale(scale);
      fielder.setData('startX', px);
      fielder.setData('startY', py);
      this.fielders.push(fielder);
    }

    if (this.role === 'batting') {
      // Bowler (Top of Pitch)
      this.bowler = this.add.sprite(CENTER_X, PITCH_TOP_Y - 30, 'tex_bowler').setDepth(10);
  
      // Non-Striker (Top of Pitch, scaled down)
      this.nonStriker = this.add.sprite(CENTER_X + 25, PITCH_TOP_Y - 20, 'tex_batsman').setScale(0.3).setDepth(10);

      // Keeper (Behind stumps at bottom) - hidden when batting
      this.keeper = this.add.sprite(CENTER_X, PITCH_BOT_Y + 15, 'tex_fielder').setDepth(11).setVisible(false);

      // Batsman (Bottom of Pitch)
      this.batsman = this.add.sprite(CENTER_X - 50, PITCH_BOT_Y - 60, 'tex_batsman').setDepth(11);
      
      // Bat 
      this.bat = this.add.sprite(CENTER_X - 18, PITCH_BOT_Y - 42, 'tex_bat')
        .setOrigin(0.5, 0)
        .setAngle(-30)
        .setDepth(12)
        .setVisible(false);
    } else {
      // Bowler (Bottom of Pitch, scaled up)
      this.bowler = this.add.sprite(CENTER_X, PITCH_BOT_Y - 30, 'tex_bowler').setScale(3).setDepth(11);
  
      // Non-Striker (Bottom of Pitch)
      this.nonStriker = this.add.sprite(CENTER_X + 50, PITCH_BOT_Y - 60, 'tex_batsman').setDepth(11);

      // Keeper (Behind stumps at top)
      this.keeper = this.add.sprite(CENTER_X, PITCH_TOP_Y - 35, 'tex_fielder').setScale(0.3).setDepth(9);

      // Batsman (Top of Pitch, scaled down)
      this.batsman = this.add.sprite(CENTER_X - 15, PITCH_TOP_Y - 20, 'tex_batsman').setScale(0.3).setDepth(10);
      
      // Bat 
      this.bat = this.add.sprite(CENTER_X - 5, PITCH_TOP_Y - 14, 'tex_bat')
        .setOrigin(0.5, 0)
        .setScale(0.3)
        .setAngle(-30)
        .setDepth(11)
        .setVisible(false);
    }

    // Bails - Created as a separate object so they can fall
    // If bowling, bails are at the top (batsman's end). If batting, they are at the bottom.
    const bailsY = this.role === 'bowling' ? PITCH_TOP_Y - 20 : PITCH_BOT_Y - 50;
    const bailsScale = this.role === 'bowling' ? 0.6 : 1.0;
    
    // Draw Stumps
    this.batsmanStumps = this.add.graphics();
    this.batsmanStumps.setPosition(CENTER_X, this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y);
    this.batsmanStumps.setDepth(5);
    
    this.bowlerStumps = this.add.graphics();
    this.bowlerStumps.setPosition(CENTER_X, this.role === 'bowling' ? PITCH_BOT_Y : PITCH_TOP_Y);
    this.bowlerStumps.setDepth(5);
    
    if (this.role === 'batting') {
      // Batsman stumps at bottom
      this.batsmanStumps.lineStyle(6, 0xfcd34d, 1);
      this.batsmanStumps.beginPath();
      [-15, 0, 15].forEach(x => { this.batsmanStumps.moveTo(x, 0); this.batsmanStumps.lineTo(x, -50); });
      this.batsmanStumps.strokePath();
      
      // Bowler stumps at top
      this.bowlerStumps.lineStyle(3, 0xfcd34d, 1);
      this.bowlerStumps.beginPath();
      [-8, 0, 8].forEach(x => { this.bowlerStumps.moveTo(x, 0); this.bowlerStumps.lineTo(x, -20); });
      this.bowlerStumps.strokePath();
    } else {
      // Batsman stumps at top
      this.batsmanStumps.lineStyle(3, 0xfcd34d, 1);
      this.batsmanStumps.beginPath();
      [-8, 0, 8].forEach(x => { this.batsmanStumps.moveTo(x, 0); this.batsmanStumps.lineTo(x, -20); });
      this.batsmanStumps.strokePath();
      
      // Bowler stumps at bottom
      this.bowlerStumps.lineStyle(6, 0xfcd34d, 1);
      this.bowlerStumps.beginPath();
      [-15, 0, 15].forEach(x => { this.bowlerStumps.moveTo(x, 0); this.bowlerStumps.lineTo(x, -50); });
      this.bowlerStumps.strokePath();
    }

    this.bottomBails = this.add.graphics();
    this.bottomBails.setPosition(CENTER_X, bailsY);
    this.bottomBails.setScale(bailsScale);
    this.bottomBails.lineStyle(this.role === 'bowling' ? 4 : 6, 0x991b1b, 1);
    this.bottomBails.beginPath();
    this.bottomBails.moveTo(-16, 0);
    this.bottomBails.lineTo(-1, 0);
    this.bottomBails.moveTo(1, 0);
    this.bottomBails.lineTo(16, 0);
    this.bottomBails.strokePath();
    this.bottomBails.setDepth(5);
    
    // Ball Shadow
    this.ballShadow = this.add.graphics();
    this.ballShadow.fillStyle(0x000000, 0.4);
    this.ballShadow.fillEllipse(0, 0, 16, 8);
    this.ballShadow.setDepth(10);
    this.ballShadow.setVisible(false);

    // Ball (Sprite rendered above shadow)
    this.ball = this.add.sprite(this.bowler.x, this.bowler.y, 'tex_ball').setVisible(false);
    this.ball.setDepth(11);

    // Emitters
    this.trailEmitter = this.add.particles(0, 0, 'tex_particle', {
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 200,
      tint: 0xff4500,
      frequency: 20,
      blendMode: 'ADD'
    }).setDepth(10);
    this.trailEmitter.stop();
    
    this.dustEmitter = this.add.particles(0, 0, 'tex_dust', {
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      gravityY: -50,
      speed: { min: 20, max: 40 },
      angle: { min: 0, max: 360 }
    }).setDepth(9);
    this.dustEmitter.stop();
  }

  // ------------------------------------------------------------- multiplayer

  private nameFor(seat: number | null | undefined): string {
    if (seat == null) return "Opponent";
    return this.namesBySeat[seat] ?? `Player ${seat + 1}`;
  }

  /** Reposition sprites/stumps when the innings flip flips my role. */
  private setRole(newRole: "batting" | "bowling") {
    if (this.role === newRole) return;
    this.role = newRole;
    this.hud.setRole(newRole);
    this.repositionForRole();
    this.redrawStumps();
    this.resetBatsmenPositions();
  }

  private repositionForRole() {
    if (this.role === "batting") {
      this.bowler.setPosition(CENTER_X, PITCH_TOP_Y - 30).setScale(1).setDepth(10);
      this.nonStriker.setPosition(CENTER_X + 25, PITCH_TOP_Y - 20).setScale(0.3).setDepth(10);
      this.keeper.setPosition(CENTER_X, PITCH_BOT_Y + 15).setScale(1).setDepth(11).setVisible(false);
      this.batsman.setPosition(CENTER_X - 50, PITCH_BOT_Y - 60).setScale(1).setDepth(11);
      this.bat.setPosition(CENTER_X - 18, PITCH_BOT_Y - 42).setScale(1).setDepth(12).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, PITCH_BOT_Y).setScale(1).setAngle(0).setDepth(5);
      this.bowlerStumps.setPosition(CENTER_X, PITCH_TOP_Y).setScale(1).setAngle(0).setDepth(5);
      this.bottomBails.setPosition(CENTER_X, PITCH_BOT_Y - 50).setScale(1).setAngle(0).setDepth(5);
    } else {
      this.bowler.setPosition(CENTER_X, PITCH_BOT_Y - 30).setScale(3).setDepth(11);
      this.nonStriker.setPosition(CENTER_X + 50, PITCH_BOT_Y - 60).setScale(1).setDepth(11);
      this.keeper.setPosition(CENTER_X, PITCH_TOP_Y - 35).setScale(0.3).setDepth(9);
      this.batsman.setPosition(CENTER_X - 15, PITCH_TOP_Y - 20).setScale(0.3).setDepth(10);
      this.bat.setPosition(CENTER_X - 5, PITCH_TOP_Y - 14).setScale(0.3).setDepth(11).setVisible(false).setAngle(-30);
      this.batsmanStumps.setPosition(CENTER_X, PITCH_TOP_Y).setScale(1).setAngle(0).setDepth(5);
      this.bowlerStumps.setPosition(CENTER_X, PITCH_BOT_Y).setScale(1).setAngle(0).setDepth(5);
      this.bottomBails.setPosition(CENTER_X, PITCH_TOP_Y - 20).setScale(0.6).setAngle(0).setDepth(5);
    }
  }

  private redrawStumps() {
    const batsmanNear = this.role === "bowling";

    this.batsmanStumps.clear();
    if (batsmanNear) {
      this.batsmanStumps.lineStyle(3, 0xfcd34d, 1);
      this.batsmanStumps.beginPath();
      [-8, 0, 8].forEach(x => { this.batsmanStumps.moveTo(x, 0); this.batsmanStumps.lineTo(x, -20); });
      this.batsmanStumps.strokePath();
    } else {
      this.batsmanStumps.lineStyle(6, 0xfcd34d, 1);
      this.batsmanStumps.beginPath();
      [-15, 0, 15].forEach(x => { this.batsmanStumps.moveTo(x, 0); this.batsmanStumps.lineTo(x, -50); });
      this.batsmanStumps.strokePath();
    }

    this.bowlerStumps.clear();
    if (batsmanNear) {
      this.bowlerStumps.lineStyle(6, 0xfcd34d, 1);
      this.bowlerStumps.beginPath();
      [-15, 0, 15].forEach(x => { this.bowlerStumps.moveTo(x, 0); this.bowlerStumps.lineTo(x, -50); });
      this.bowlerStumps.strokePath();
    } else {
      this.bowlerStumps.lineStyle(3, 0xfcd34d, 1);
      this.bowlerStumps.beginPath();
      [-8, 0, 8].forEach(x => { this.bowlerStumps.moveTo(x, 0); this.bowlerStumps.lineTo(x, -20); });
      this.bowlerStumps.strokePath();
    }
  }

  /** Mirror the latest authoritative state into the HUD. */
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
    this.remoteState = state;
    const store = useMultiplayerStore.getState();
    this.mySeat = store.mySeat;
    this.namesBySeat = {};
    for (const p of store.room?.players ?? []) {
      if (p.seat != null) this.namesBySeat[p.seat] = p.displayName;
    }

    const isBatting = this.mySeat != null && state.battingTeam === this.mySeat;
    this.setRole(this.mySeat == null ? "batting" : (isBatting ? "batting" : "bowling"));

    this.syncScoreboard(state);

    for (const ev of events) {
      this.handleRemoteEvent(ev as Record<string, unknown> & { type: string });
    }

    if (state.finished) {
      this.multiplayerOver = true;
      this.hud.setControlsState(true);
    } else {
      this.updateTurnStatus(state);
    }
  }

  private handleRemoteEvent(ev: { type: string } & Record<string, unknown>) {
    switch (ev.type) {
      case "ball-bowled":
        this.executeBowl(ev.delivery as CricketDelivery, (ev.power as number) ?? 0.5);
        // The batsman can swing once the ball is in flight (if that's me).
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
        this.overHistory = [];
        this.hud.updateOverHistory(this.overHistory);
        this.hud.updateStatus(
          this.role === "batting" ? "You're batting now!" : "You're bowling now!",
          "#fbbf24",
        );
        break;
      case "swap-roles":
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
      this.hud.updateStatus((ev.comment as string) || "OUT!", "#f43f5e");
      this.overHistory.push("W");
    } else if (runs >= 4) {
      this.audioManager.playCrowdRoar();
      this.createBalloons(runs);
      this.hud.updateStatus((ev.comment as string) || `${runs} RUNS!`, "#34d399");
      this.hud.showRunIndicator(runs);
      this.overHistory.push(String(runs));
    } else if (runs > 0) {
      this.audioManager.playHit(400 + runs * 100);
      this.hud.updateStatus((ev.comment as string) || `${runs} RUNS!`, "#34d399");
      this.hud.showRunIndicator(runs);
      this.overHistory.push(String(runs));
    } else {
      this.audioManager.playCrowdGroan();
      this.hud.updateStatus((ev.comment as string) || "Dot ball.", "#9ca3af");
      this.overHistory.push("0");
    }

    if (this.overHistory.length > 6) this.overHistory = this.overHistory.slice(-6);
    this.hud.updateOverHistory(this.overHistory);
  }

  private updateTurnStatus(state: CricketState) {
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
    } else {
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

  private startNextBallTimer(seconds: number = 5) {
    if (this.wickets >= 1 || this.balls >= this.maxBalls || (this.role === 'batting' && this.runs >= this.targetScore)) return;
    
    // Hide the ball while waiting for the next pitch
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);
    
    if (this.role === 'batting') {
      this.hud.setControlsState(true); // Disable hitting
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
      // Bowling role
      this.hud.updateStatus("Select a delivery to bowl!", "#fbbf24");
      this.hud.setControlsState(false); // Enable bowling controls
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
    this.hud.setControlsState(false); // Enable hitting
  }

  private playerBowl(type: 'fast' | 'slow' | 'spin', power: number) {
    if (this.wickets >= 1 || this.balls >= this.maxBalls) return;

    if (this.mode === 'multiplayer') {
      // The server resolves the delivery; the animation is driven by the
      // resulting `ball-bowled` broadcast so both clients stay in sync.
      this.hud.setControlsState(true);
      this.hud.updateStatus("Delivery sent! Waiting...", "#93c5fd");
      void useMultiplayerStore.getState().sendGameAction({ type: 'bowl', delivery: type, power }).then((res) => {
        if (!res.ok) {
          this.hud.updateStatus(res.error ?? "Action rejected", "#f43f5e");
          this.hud.setControlsState(false);
        }
      });
      return;
    }

    this.executeBowl(type, power);
    this.hud.setControlsState(true); // Disable bowling controls while ball is in play
  }


  private executeBowl(type: CricketDelivery, powerMultiplier: number = 1.0) {
    this.isBowling = true;
    this.isHit = false;
    this.aiHasSwung = false;
    this.playerHasSwung = false;
    this.hasSteppedOut = false;
    
    this.resetBatsmenPositions();

    this.ballDepth = this.bowler.y;
    this.ballHeight = 60; // Release height
    this.ballVelocityZ = 150; // Slight upward release
    
    this.ball.setPosition(this.bowler.x, this.ballDepth - this.ballHeight);
    // If role is bowling, ball starts close (big), otherwise starts far (small)
    this.ball.setScale(this.role === 'bowling' ? this.finalBallScale : this.initialBallScale);
    this.ball.setVisible(true);
    
    this.ballShadow.setPosition(this.bowler.x, this.ballDepth);
    this.ballShadow.setScale(this.role === 'bowling' ? this.finalBallScale : this.initialBallScale);
    this.ballShadow.setVisible(true);
    
    this.trailEmitter.stop(); // Stop trail on reset
    
    // Reset bat and bails and stumps
    this.bat.setAngle(-30);
    this.bat.setVisible(false);
    
    const bailsY = this.role === 'bowling' ? PITCH_TOP_Y - 20 : PITCH_BOT_Y - 50;
    this.bottomBails.setPosition(CENTER_X, bailsY);
    this.bottomBails.setAngle(0);
    
    this.batsmanStumps.setAngle(0);
    this.batsmanStumps.setPosition(CENTER_X, this.role === 'bowling' ? PITCH_TOP_Y : PITCH_BOT_Y);

    this.deliveryType = type;
    
    // Speed multiplier ranges from 0.5 to 1.5 based on power (0 to 1)
    const mult = 0.5 + powerMultiplier; 

    if (type === 'fast') {
      const speed = (700 + Math.random() * 150) * mult; 
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = -100 * mult; // Flatter trajectory
      this.hud.updateStatus("Fast pace! Get ready!", "#fca5a5"); 
      this.audioManager.playWhoosh();
      
      this.trailEmitter.setConfig({
        tint: 0xff4500,
        lifespan: 200,
        scale: { start: 1, end: 0 }
      });
      this.trailEmitter.start();
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
      this.trailEmitter.setConfig({ tint: 0xffa500, lifespan: 150, scale: { start: 0.8, end: 0 } });
      this.trailEmitter.start();
    } else if (type === 'bouncer') {
      const speed = (550 + Math.random() * 150) * mult;
      this.ballVelocity = { x: 0, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 400 * mult;
      this.hud.updateStatus("Bouncer! Watch the short ball!", "#ef4444");
      this.trailEmitter.setConfig({ tint: 0xff0000, lifespan: 180, scale: { start: 1.2, end: 0 } });
      this.trailEmitter.start();
    } else if (type === 'swing') {
      const speed = (450 + Math.random() * 100) * mult;
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      this.ballVelocity = { x: this.spinDirection * 80, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 50 * mult;
      this.hud.updateStatus("Swing bowling! Watch the movement!", "#a855f7");
      this.trailEmitter.setConfig({ tint: 0x9333ea, lifespan: 200, scale: { start: 1, end: 0 } });
      this.trailEmitter.start();
    } else {
      const speed = (400 + Math.random() * 100) * mult;
      this.spinDirection = Math.random() > 0.5 ? 1 : -1;
      this.ballVelocity = { x: this.spinDirection * 150, y: this.role === 'bowling' ? -speed : speed };
      this.ballVelocityZ = 100 * mult;
      this.hud.updateStatus("Spin! Watch the curve!", "#fde047");
    }
  }


  private hitShot(isAI = false, direction: 'left' | 'right' | 'up' | 'straight' = 'straight') {
    if (!this.isBowling || this.isHit || this.wickets >= 1 || this.balls >= this.maxBalls) return;
    
    // Only allow one swing per delivery!
    if (!isAI && this.playerHasSwung) return;
    if (!isAI) this.playerHasSwung = true;

    if (this.mode === 'multiplayer' && !isAI) {
      // The batsman's swing is sent to the server; the outcome is rolled
      // authoritatively and arrives back as a `ball-result` event.
      this.playBatSwing(direction);
      const timing = this.computeTiming(direction);
      this.hud.setControlsState(true);
      this.hud.updateStatus("Shot played! Waiting for result...", "#93c5fd");
      this.audioManager.playWhoosh();
      void useMultiplayerStore.getState().sendGameAction({ type: 'bat', shot: direction, timing }).then((res) => {
        if (!res.ok) {
          this.playerHasSwung = false;
          this.hud.setControlsState(false);
          this.hud.updateStatus(res.error ?? "Action rejected", "#f43f5e");
        }
      });
      return;
    }

    this.isHit = true;
    this.balls++;
    if (this.role === 'batting') {
      this.hud.setControlsState(true);
    }
    
    this.playBatSwing(direction);

    // Sweet spot is near the crease depending on role
    const sweetSpotY = this.role === 'bowling' ? PITCH_TOP_Y + 20 : PITCH_BOT_Y - 40;
    const distance = Math.abs(this.ballDepth - sweetSpotY);
    // Horizontal distance penalty
    const dx = Math.abs(this.ball.x - CENTER_X);
    // Vertical distance penalty (if it bounces too high over stumps)
    // Ideal hitting height is between 10 and 60
    let dz = 0;
    if (this.ballHeight < 10) dz = 10 - this.ballHeight;
    else if (this.ballHeight > 60) dz = this.ballHeight - 60;
    
    let totalDiff = distance + dx * 0.5 + dz * 0.8;
    
    if (this.hasSteppedOut) {
      totalDiff *= 0.6; // Significantly increase sweet spot
    }

    if (isAI) {
      // Add some random human-like error to the AI's timing
      // Reduced error to make the AI play better
      totalDiff += Math.random() * 60; 
    }

    let isOut = false;
    let runsAdded = 0;
    let message = '';
    let colorStr = "#fbbf24";
    let shotPower = 0;
    let shotAngle = 0;

    const baseAngle = this.role === 'bowling' ? Math.PI / 2 : -Math.PI / 2; // Hit towards bottom or top
    
    let angleMod = 0;
    if (direction === 'left') angleMod = -0.7;
    else if (direction === 'right') angleMod = 0.7;

    const isLofted = direction === 'up';

    if (totalDiff <= 35) {
      // Perfect Timing
      const isSix = isLofted; // Only lofted shots (SLOG) can hit a 6
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
      
      // Bat Flash
      this.bat.setTint(0xffffff);
      this.bat.setTintFill();
      this.time.delayedCall(100, () => this.bat.clearTint());

      this.trailEmitter.setConfig({
        tint: isSix ? 0x34d399 : 0x3b82f6,
        lifespan: isSix ? 400 : 300,
        scale: { start: isSix ? 1.5 : 1.2, end: 0 }
      });
      this.trailEmitter.start();
    } else if (totalDiff <= 90) {
      // Good Timing
      if (isLofted && Math.random() > 0.6) {
        // High risk of getting caught if you loft a good (not perfect) shot
        message = 'MISTIMED LOFT! CAUGHT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 500; 
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5) * 0.5;
        this.ballVelocityZ = 400; // Pops up for an easy catch
        this.audioManager.playHit(shotPower);
      } else {
        // We no longer rely on random runsAdded for physics calculation,
        // but we still set a base shot power that feels solid
        shotPower = 400 + Math.random() * 400; // 400 to 800 (was much faster)
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5) * 0.6;
        this.ballVelocityZ = (isLofted ? 200 : 50) + Math.random() * 100;
        this.audioManager.playHit(shotPower);
      }
    } else if (totalDiff <= 140) {
      // Early/Late Timing (Edge or Weak shot)
      const isEdge = Math.random() > 0.5; // 50% chance of edging it
      if (this.hasSteppedOut) {
        // High risk: Stepping out and mistiming results in stumping!
        message = 'STUMPED OUT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 50; 
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5);
        this.ballVelocityZ = 20;
        this.audioManager.playHit(50);
        this.playWicketAnimation();
      } else if (isEdge) {
        message = 'EDGE! CAUGHT BY KEEPER!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 100; // weak deflection
        shotAngle = baseAngle + (Math.random() > 0.5 ? 2.5 : -2.5); // Sharp angle backwards
        this.ballVelocityZ = 150; // Pop up for keeper
        this.audioManager.playHit(100);

        // Keeper jump animation
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
        shotPower = 50; // barely moves
        shotAngle = baseAngle + angleMod + (Math.random() - 0.5);
        this.ballVelocityZ = 20;
        this.audioManager.playHit(50);
      }
    } else {
      // Swung too early or late! Complete miss.
      if (this.hasSteppedOut) {
        this.isHit = true; // We resolve it here instead of handleMiss
        message = 'STUMPED OUT!';
        colorStr = "#ef4444";
        isOut = true;
        shotPower = 0;
        this.audioManager.playWicket();
        this.playWicketAnimation();
      } else {
        this.isHit = false;
        this.balls--; // Undo the increment since handleMiss will handle it
        return; // Let the ball continue to the stumps!
      }
    }

    if (isOut) {
      this.wickets++;
      this.addHistory('W');
      this.hud.updateStatus(message, colorStr);
      this.hud.updateScore(this.runs, this.wickets);
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
        // Boundary is auto-scored
        this.hud.updateStatus(message, colorStr);
        if (runsAdded === 6) {
          this.tweens.add({
            targets: this.ball,
            scale: this.role === 'bowling' ? 5 : 3,
            duration: 300,
            yoyo: true
          });
        }
        
        // Wait for ball to hit boundary
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
            const chaseDuration = Math.max(800, dist * 4); // slower chase / more time
            
            const throwToBowlerEnd = closestFielder.y < CENTER_Y;
            const targetX = CENTER_X;
            const targetY = throwToBowlerEnd ? PITCH_TOP_Y : PITCH_BOT_Y;
            
            const throwDist = Phaser.Math.Distance.Between(closestFielder.x, closestFielder.y, targetX, targetY);
            const throwDuration = Math.max(600, throwDist * 2); // slower throw
            
            // Calculate possible runs based on total fielder time
            // With the ball moving slower, distance is shorter, so we divide by a smaller number
            const totalFielderTime = chaseDuration + throwDuration;
            let calculatedRuns = Math.floor((totalFielderTime - 400) / 700); 
            calculatedRuns = Phaser.Math.Clamp(calculatedRuns, 0, 3);
            
            if (calculatedRuns > 0) {
              this.hud.updateStatus(`Running ${calculatedRuns}...`, "#3b82f6");
              this.audioManager.playCrowdRoar();
              this.autoRunBatsmen(calculatedRuns);
            }
            
            this.tweens.add({
              targets: closestFielder,
              x: destX,
              y: destY,
              duration: chaseDuration,
              onComplete: () => {
                // Fielder picks up ball
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
                    // Ball hits stumps
                    this.commitRuns(calculatedRuns);
                    
                    // Return fielder
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

  private playBatSwing(direction: 'left' | 'right' | 'up' | 'straight') {
    // Automatically step out on a Slog (up direction)
    if (direction === 'up' && !this.hasSteppedOut && this.role === 'batting') {
      this.hasSteppedOut = true;
      const moveDist = 40;
      this.tweens.add({
        targets: [this.batsman, this.bat],
        y: '-=' + moveDist,
        duration: 150,
        ease: 'Quad.easeOut'
      });
    }

    this.bat.setVisible(true);

    // Swing bat (from back -30 to forward -100)
    this.tweens.add({
      targets: this.bat,
      angle: -100,
      duration: 150,
      yoyo: true,
      onComplete: () => {
        this.bat.setVisible(false);
      }
    });
  }

  /**
   * Convert the current ball-flight position into a server-side timing hint.
   * The server uses this (plus the delivery/shot) to roll the authoritative
   * outcome, so it only needs to be a rough proxy of how well-timed the swing
   * was relative to the ball reaching the batsman's sweet spot.
   */
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

  private commitRuns(runs: number) {
    if (runs > 0) {
      const previousMilestone = Math.floor(this.runs / 50);
      this.runs += runs;
      this.addHistory(runs.toString());
      const currentMilestone = Math.floor(this.runs / 50);
      
      let message = `${runs} RUNS! 🏃`;
      let colorStr = "#34d399";
      
      if (runs === 4) { message = 'FOUR! 🔥'; }
      if (runs === 6) { message = 'SIX! 🚀'; }
      
      if (currentMilestone > previousMilestone && currentMilestone > 0) {
        this.createConfetti();
        message = `${currentMilestone * 50} RUNS MILESTONE! 🎉`;
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
    
    // Swap Y positions between batsman and nonStriker
    const batsmanTargetY = this.batsman.y < CENTER_Y ? PITCH_BOT_Y - 60 : PITCH_TOP_Y - 20;
    const nonStrikerTargetY = this.nonStriker.y < CENTER_Y ? PITCH_BOT_Y - 60 : PITCH_TOP_Y - 20;

    const batsmanTargetScale = batsmanTargetY < CENTER_Y ? 0.3 : 1.0;
    const nonStrikerTargetScale = nonStrikerTargetY < CENTER_Y ? 0.3 : 1.0;

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
      this.batsman.setPosition(CENTER_X - 50, PITCH_BOT_Y - 60);
      this.batsman.setScale(1.0);
      this.bat.setPosition(CENTER_X - 18, PITCH_BOT_Y - 42);
      this.bat.setScale(1.0);
      
      this.nonStriker.setPosition(CENTER_X + 25, PITCH_TOP_Y - 20);
      this.nonStriker.setScale(0.3);
    } else {
      this.batsman.setPosition(CENTER_X - 15, PITCH_TOP_Y - 20);
      this.batsman.setScale(0.3);
      this.bat.setPosition(CENTER_X - 5, PITCH_TOP_Y - 14);
      this.bat.setScale(0.3);
      
      this.nonStriker.setPosition(CENTER_X + 50, PITCH_BOT_Y - 60);
      this.nonStriker.setScale(1.0);
    }
  }

  private handleMiss() {
    this.isBowling = false;
    this.isHit = false;
    this.balls++;
    this.trailEmitter.stop();
    
    // Slight groan for a normal miss
    this.audioManager.playCrowdGroan();

    // Check if it hit the stumps (assuming simple logic for now: if not hit, it hits stumps)
    // In a real game, you'd check X coordinate of ball vs stumps
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
    this.cameras.main.shake(300, 0.02); // Add screen shake for impact
    // Dramatic Bails and Stumps falling animation
    const bailsTargetY = this.role === 'bowling' ? PITCH_TOP_Y - 40 : PITCH_BOT_Y - 80;
    const bailsGroundY = this.role === 'bowling' ? PITCH_TOP_Y + 10 : PITCH_BOT_Y + 20;

    // Stumps breaking back
    this.tweens.add({
      targets: this.batsmanStumps,
      angle: (Math.random() > 0.5 ? 1 : -1) * 30 + 90, // fall flat
      y: this.batsmanStumps.y + 20,
      duration: 300,
      ease: 'Quad.easeIn'
    });

    this.tweens.add({
      targets: this.bottomBails,
      y: bailsTargetY, // fly up
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.bottomBails,
          y: bailsGroundY, // fall to ground
          angle: (Math.random() > 0.5 ? 1 : -1) * 180,
          duration: 350,
          ease: 'Bounce.easeOut'
        });
      }
    });
    this.tweens.add({
      targets: this.bottomBails,
      x: CENTER_X + (Math.random() > 0.5 ? 30 : -30),
      duration: 500,
      ease: 'Linear'
    });
  }

  private handleWicket() {
    this.wickets++;
    
    // Large groan for a wicket
    this.audioManager.playCrowdGroan();

    this.hud.updateScore(this.runs, this.wickets);
    this.hud.updateStatus("OUT! Bowled him!", "#f43f5e");
    
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
    const isWin = this.role === 'batting' ? this.runs >= this.targetScore : this.runs < this.targetScore;
    
    if (this.runs >= this.targetScore || this.balls >= this.maxBalls || this.wickets >= 1) {
      this.hud.setControlsState(true);
      
      // Celebration Jump
      const delay = isWicket ? 1000 : 0; // Wait for stump animation if it's a wicket
      this.time.delayedCall(delay, () => {
        if ((this.role === 'bowling' && isWin) || (this.role === 'batting' && !isWin)) {
          // Bowler & Fielders celebrate
          this.fielders.forEach(f => this.jumpCelebrate(f));
          this.jumpCelebrate(this.bowler);
        } else {
          // Batsman and Non-Striker celebrate
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
      // Start near the crowd horizon
      const x = CENTER_X + (Math.random() - 0.5) * 600;
      const y = HORIZON_Y + 20 + Math.random() * 30;
      const colors = [0xf43f5e, 0x3b82f6, 0xeab308, 0xa855f7, 0x22c55e];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      const balloonBg = this.add.circle(0, 0, 24, color).setStrokeStyle(2, 0xffffff);
      const text = this.add.text(0, 0, count.toString(), {
        fontSize: "28px", color: "#ffffff", fontStyle: "bold", fontFamily: "Outfit, sans-serif"
      }).setOrigin(0.5);

      const balloon = this.add.container(x, y, [balloonBg, text]).setDepth(30);
      
      // Floating up animation
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
      const y = -50 - Math.random() * 200; // Start above screen
      const confetti = this.add.sprite(x, y, 'tex_confetti').setDepth(100);
      confetti.setTint(colors[Math.floor(Math.random() * colors.length)]);
      
      this.tweens.add({
        targets: confetti,
        y: GAME_H + 50,
        duration: 3000 + Math.random() * 2000,
        ease: 'Linear',
        onComplete: () => {
          confetti.destroy();
        }
      });
      
      // Separate tween for horizontal drifting and spinning
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

  update(time: number, delta: number) {
    const dt = delta / 1000;
    
    if (this.isBowling && !this.isHit) {
      if (this.deliveryType === 'spin') {
        // Apply acceleration to curve the ball back towards the stumps
        this.ballVelocity.x -= this.spinDirection * 350 * dt;
      }
      
      this.ball.x += this.ballVelocity.x * dt;
      this.ballDepth += this.ballVelocity.y * dt;
      
      // Vertical Physics (Bouncing)
      this.ballVelocityZ -= this.gravity * dt;
      this.ballHeight += this.ballVelocityZ * dt;
      
      if (this.ballHeight < 0) {
        this.ballHeight = 0;
        this.ballVelocityZ = Math.abs(this.ballVelocityZ) * 0.6; // Bounce with restitution
        this.dustEmitter.emitParticleAt(this.ball.x, this.ballDepth, 5); // Puff of dust!
      }
      
      // Update sprite positions
      this.ballShadow.setPosition(this.ball.x, this.ballDepth);
      this.ball.setPosition(this.ball.x, this.ballDepth - this.ballHeight);
      this.trailEmitter.particleX = this.ball.x;
      this.trailEmitter.particleY = this.ball.y;

      // AI Batting Logic (single player only - in multiplayer the opponent
      // is a real player whose swing arrives as a server `ball-result` event)
      if (this.role === 'bowling' && this.mode === 'ai') {
        const sweetSpotY = PITCH_TOP_Y + 20;
        // The AI will attempt to hit when the ball is very close to the sweet spot
        if (!this.aiHasSwung && this.ballDepth <= sweetSpotY + 15 && this.ballDepth >= sweetSpotY - 15) {
          this.aiHasSwung = true;
          // 95% chance to attempt a swing (plays much better)
          if (Math.random() < 0.95) {
            const dirs: ('up' | 'left' | 'right' | 'straight')[] = ['up', 'left', 'right', 'straight'];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            this.hitShot(true, dir);
          }
        }
      }
      
      // Perspective scaling for the ball coming towards camera (or away if bowling)
      const progress = Phaser.Math.Clamp((this.ballDepth - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y), 0, 1);
      const newScale = Phaser.Math.Linear(
        this.role === 'bowling' ? this.initialBallScale : this.finalBallScale, 
        this.role === 'bowling' ? this.finalBallScale : this.initialBallScale, 
        1 - progress
      );
      this.ball.setScale(newScale);
      this.ballShadow.setScale(newScale);

      // Missed the ball
      const isMissed = this.role === 'bowling' ? this.ballDepth < PITCH_TOP_Y - 10 : this.ballDepth > PITCH_BOT_Y + 20;
      if (isMissed) {
        this.ballVelocity = { x: 0, y: 0 };
        this.ballVelocityZ = 0;
        this.ballShadow.setVisible(false);
        this.ball.setVisible(false);
        if (this.mode === 'ai') {
          this.handleMiss();
        } else {
          // The authoritative result arrives as a `ball-result` event, so just
          // park the ball until the server broadcasts the outcome.
          this.isBowling = false;
          this.isHit = false;
          this.trailEmitter.stop();
          this.hud.setControlsState(true);
          this.hud.updateStatus("Ball is away... waiting for the shot.", "#94a3b8");
        }
      }
    } else if (this.isHit) {
      // Frame-rate independent friction
      const groundFriction = Math.pow(0.3, dt); // Loses 70% of speed per second
      const airFriction = Math.pow(0.8, dt);    // Loses 20% of speed per second
      
      if (this.ballHeight <= 5) {
        this.ballVelocity.x *= groundFriction;
        this.ballVelocity.y *= groundFriction;
      } else {
        this.ballVelocity.x *= airFriction;
        this.ballVelocity.y *= airFriction;
      }

      this.ball.x += this.ballVelocity.x * dt;
      this.ballDepth += this.ballVelocity.y * dt;
      
      // Ball arcs up into the air when hit
      this.ballVelocityZ -= this.gravity * 0.5 * dt; // Less gravity so it hangs in the air
      this.ballHeight += this.ballVelocityZ * dt;
      
      if (this.ballHeight < 0) {
        this.ballHeight = 0;
        this.ballVelocityZ = Math.abs(this.ballVelocityZ) * 0.4; // Less bouncy after hit
        this.dustEmitter.emitParticleAt(this.ball.x, this.ballDepth, 5);
      }
      
      this.ballShadow.setPosition(this.ball.x, this.ballDepth);
      this.ball.setPosition(this.ball.x, this.ballDepth - this.ballHeight);
      this.trailEmitter.particleX = this.ball.x;
      this.trailEmitter.particleY = this.ball.y;
      
      // Perspective scaling for the ball
      const progress = Phaser.Math.Clamp((this.ballDepth - HORIZON_Y) / (PITCH_BOT_Y - HORIZON_Y), 0, 1);
      
      // If batting, hit ball goes from bottom to top (shrinks). If bowling, ball goes from top to bottom (grows).
      let newScale = 1;
      if (this.role === 'batting') {
        newScale = Math.max(0.2, Phaser.Math.Linear(0.2, this.finalBallScale, progress));
      } else {
        newScale = Math.max(0.2, Phaser.Math.Linear(0.2, this.finalBallScale, progress));
      }
      
      // Only apply if there's no active tween scaling it (like the 6 runs tween)
      if (!this.tweens.isTweening(this.ball)) {
        this.ball.setScale(newScale);
        this.ballShadow.setScale(newScale);
      }
      
      // Friction
      this.ballVelocity.x *= 0.985;
      this.ballVelocity.y *= 0.985;
      
      if (Math.abs(this.ballVelocity.x) < 10 && Math.abs(this.ballVelocity.y) < 10) {
        this.ballVelocity = { x: 0, y: 0 };
        this.isHit = false;
        this.isBowling = false;
      }
      
      // Boundary check
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
