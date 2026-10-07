import { SNAKE_WORMS_VISUAL_CONFIG } from '../constants/snakeVsWormsVisualConfig';

export interface Point2D {
  x: number;
  y: number;
}

export class SnakeVsWorms3DRenderer {
  /**
   * Renders the 3D Arena Floor with Grid and Beveled Neon Danger Perimeter.
   */
  static drawArena(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    animTime: number
  ): void {
    const cfg = SNAKE_WORMS_VISUAL_CONFIG;
    const w = cfg.mapWidth;
    const h = cfg.mapHeight;

    // 1. Dark Arena Matte Background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle Coordinate Grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    const gridSize = 80;

    for (let x = 0; x <= w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 3. Grid Dot Intersections
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    for (let x = 0; x <= w; x += gridSize * 2) {
      for (let y = 0; y <= h; y += gridSize * 2) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Outer Beveled Danger Perimeter Wall with Pulsing Glow
    const borderPulse = 0.55 + Math.sin(animTime * 4) * 0.35;
    ctx.strokeStyle = `rgba(239, 68, 68, ${borderPulse})`;
    ctx.lineWidth = 10;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 18;
    ctx.strokeRect(0, 0, w, h);
    ctx.shadowBlur = 0;

    // Inner warning hazard line
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.setLineDash([]);
  }

  /**
   * Renders a Volumetric 3D Collectible Food Orb / Gem.
   */
  static drawFood(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    type: 'normal' | 'golden' | 'boost',
    animTime: number
  ): void {
    const cfg = SNAKE_WORMS_VISUAL_CONFIG.food[type] || SNAKE_WORMS_VISUAL_CONFIG.food.normal;
    const pulse = Math.sin(animTime * 5 + x * 0.04 + y * 0.04) * 1.5;
    const r = Math.max(3, cfg.radius + pulse);

    // 1. Soft Floor Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + r * 0.6, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 3D Volumetric Spherical Gradient (315° Studio Light)
    const lx = x - r * 0.35;
    const ly = y - r * 0.35;
    const grad = ctx.createRadialGradient(lx, ly, 1, x, y, r);
    grad.addColorStop(0, cfg.highlight);
    grad.addColorStop(0.3, cfg.glow);
    grad.addColorStop(0.75, cfg.base);
    grad.addColorStop(1, cfg.rim);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. Specular Glint Dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx, ly, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Special spark for Golden food
    if (type === 'golden' && Math.sin(animTime * 8 + x) > 0.4) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(x + r * 0.4, y - r * 0.4, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Renders a complete 3D Segmented Snake / Worm creature.
   */
  static drawCreature(
    ctx: CanvasRenderingContext2D,
    body: Point2D[],
    headAngle: number,
    skinKey: string,
    isMe: boolean,
    isBoosting: boolean,
    name: string,
    animTime: number,
    isEliminated = false
  ): void {
    if (!body || body.length === 0) return;
    const skin = SNAKE_WORMS_VISUAL_CONFIG.skins[skinKey] || (isMe ? SNAKE_WORMS_VISUAL_CONFIG.skins.player! : SNAKE_WORMS_VISUAL_CONFIG.skins.p2!);

    // ── Handle Elimination Burst ──
    if (isEliminated) {
      const head = body[0]!;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.beginPath();
      ctx.arc(head.x, head.y, 22, 0, Math.PI * 2);
      ctx.fill();

      // Broken jewel particles around head
      for (let k = 0; k < 8; k++) {
        const pAngle = (k / 8) * Math.PI * 2 + animTime * 3;
        const pDist = 24 + Math.sin(animTime * 6 + k) * 8;
        const px = head.x + Math.cos(pAngle) * pDist;
        const py = head.y + Math.sin(pAngle) * pDist;

        ctx.fillStyle = skin.base;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${name} (OUT)`, head.x, head.y - 28);
      return;
    }

    const baseRadius = SNAKE_WORMS_VISUAL_CONFIG.segmentRadius;

    // ── 1. Soft Body Contact Shadows on Floor ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let i = body.length - 1; i >= 0; i -= 2) {
      const seg = body[i]!;
      const segTaper = Math.max(0.45, 1.0 - (i / Math.max(1, body.length)) * 0.55);
      const r = baseRadius * segTaper;
      ctx.beginPath();
      ctx.ellipse(seg.x + 3, seg.y + 6, r * 1.05, r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 2. Boosting Plasma Flame Trail ──
    if (isBoosting && body.length > 2) {
      const tail = body[body.length - 1]!;
      ctx.save();
      for (let b = 0; b < 4; b++) {
        const bAngle = Math.random() * Math.PI * 2;
        const bDist = Math.random() * 18;
        ctx.fillStyle = Math.random() > 0.5 ? '#f59e0b' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(tail.x + Math.cos(bAngle) * bDist, tail.y + Math.sin(bAngle) * bDist, 3 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 3. 3D Body Segments (Rendered Tail to Neck) ──
    for (let i = body.length - 1; i >= 1; i--) {
      const seg = body[i]!;
      const segTaper = Math.max(0.45, 1.0 - (i / Math.max(1, body.length)) * 0.55);
      const r = baseRadius * segTaper;

      // Volumetric 3D Radial Core
      const lx = seg.x - r * 0.35;
      const ly = seg.y - r * 0.35;
      const grad = ctx.createRadialGradient(lx, ly, 1, seg.x, seg.y, r);
      grad.addColorStop(0, skin.highlight);
      grad.addColorStop(0.25, skin.center);
      grad.addColorStop(0.75, skin.base);
      grad.addColorStop(1, skin.rim);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Scale glint highlight
      if (i % 2 === 0) {
        ctx.fillStyle = skin.spotColor;
        ctx.beginPath();
        ctx.arc(lx, ly, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 4. 3D Expressive Head ──
    const head = body[0]!;
    const hr = SNAKE_WORMS_VISUAL_CONFIG.headRadius;

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headAngle);

    // Head 3D Sphere
    const headLx = -hr * 0.35;
    const headLy = -hr * 0.35;
    const headGrad = ctx.createRadialGradient(headLx, headLy, 1, 0, 0, hr);
    headGrad.addColorStop(0, skin.highlight);
    headGrad.addColorStop(0.28, skin.center);
    headGrad.addColorStop(0.78, isMe ? '#34d399' : skin.base);
    headGrad.addColorStop(1, skin.rim);

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, Math.PI * 2);
    ctx.fill();

    // Head bevel outline
    ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = isMe ? 2.5 : 1.5;
    ctx.stroke();

    // ── Flicking Snake Tongue ──
    if (Math.sin(animTime * 12 + head.x * 0.1) > 0.25) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(hr, 0);
      ctx.lineTo(hr + 8, 0);
      ctx.lineTo(hr + 12, -3);
      ctx.moveTo(hr + 8, 0);
      ctx.lineTo(hr + 12, 3);
      ctx.stroke();
    }

    // ── Expressive 3D Eyes & Narrowing Pupils on Boost ──
    const eyeY = isBoosting ? 5.5 : 6.5;
    const eyeX = 6;
    const pupilR = isBoosting ? 1.8 : 2.6;

    // Sclera (White eye sockets)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX, -eyeY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(eyeX + 1.5, -eyeY, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 1.5, eyeY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Eye catchlight glints
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX + 2, -eyeY - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 2, eyeY - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── 5. Name Tag & Player Indicator ──
    ctx.fillStyle = isMe ? '#34d399' : '#ffffff';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 6;
    ctx.fillText(name, head.x, head.y - 24);
    ctx.shadowBlur = 0;
  }

  /**
   * Renders the Circular Radar Minimap on the bottom-right.
   */
  static drawRadar(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    players: Array<{ x: number; y: number; isMe: boolean; color: string; dead: boolean }>,
    mapW: number = SNAKE_WORMS_VISUAL_CONFIG.mapWidth,
    mapH: number = SNAKE_WORMS_VISUAL_CONFIG.mapHeight,
    radarAlignLeft = false
  ): void {
    const size = 95;
    const rx = radarAlignLeft ? 18 : canvasW - size - 18;
    const ry = canvasH - size - 18;
    const scale = size / mapW;

    ctx.save();
    // Glassmorphic Radar Container
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rx, ry, size, size, 18);
    ctx.fill();
    ctx.stroke();

    // Radar Center Crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + size / 2, ry);
    ctx.lineTo(rx + size / 2, ry + size);
    ctx.moveTo(rx, ry + size / 2);
    ctx.lineTo(rx + size, ry + size / 2);
    ctx.stroke();

    // Player Blips
    players.forEach((p) => {
      if (p.dead) return;
      const bx = rx + p.x * scale;
      const by = ry + p.y * scale;

      ctx.fillStyle = p.isMe ? '#34d399' : p.color;
      ctx.beginPath();
      ctx.arc(bx, by, p.isMe ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();

      if (p.isMe) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    ctx.restore();
  }
}
