import { BUBBLE_SHOOTER_VISUAL_CONFIG } from '../constants/bubbleShooterVisualConfig';

export class Bubble3DRenderer {
  /**
   * Renders a physical 3D glossy glass/gel bubble with 315° studio lighting,
   * specular highlight, secondary bounce light, and soft ambient shadow.
   */
  static drawBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    type: 'normal' | 'bomb' | 'rainbow',
    radius = BUBBLE_SHOOTER_VISUAL_CONFIG.radius,
    alpha = 1.0,
    scale = 1.0,
    rotation = 0
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    if (scale !== 1.0) ctx.scale(scale, scale);

    const r = radius;
    const lx = -r * 0.35;
    const ly = -r * 0.35;

    // 1. Soft Ambient Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(1.5, r * 0.35, r * 0.88, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'bomb') {
      // ── 3D Graphite Bomb Sphere ──
      const bombGrad = ctx.createRadialGradient(lx, ly, 2, 0, 0, r);
      bombGrad.addColorStop(0, '#94a3b8');   // Metallic catchlight
      bombGrad.addColorStop(0.3, '#334155'); // Dark slate
      bombGrad.addColorStop(0.8, '#0f172a'); // Deep graphite
      bombGrad.addColorStop(1, '#020617');   // Black rim
      ctx.fillStyle = bombGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Danger Core Ring
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Brass Fuse Cap
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-3, -r - 3, 6, 4);

      // Burning Fuse Spark
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, -r - 5, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -r - 5, 1.8, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === 'rainbow') {
      // ── Iridescent Spectrum Prism Pearl ──
      const rainGrad = ctx.createRadialGradient(lx, ly, 1, 0, 0, r);
      rainGrad.addColorStop(0, '#ffffff');
      rainGrad.addColorStop(0.25, '#f43f5e');
      rainGrad.addColorStop(0.5, '#fbbf24');
      rainGrad.addColorStop(0.75, '#10b981');
      rainGrad.addColorStop(0.9, '#38bdf8');
      rainGrad.addColorStop(1, '#7e22ce');
      ctx.fillStyle = rainGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular Star Glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.45, r * 0.22, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ── Volumetric 3D Glass / Gel Sphere ──
      const theme = BUBBLE_SHOOTER_VISUAL_CONFIG.bubbleThemes[color] || {
        base: color,
        highlight: '#ffffff',
        center: color,
        rim: '#0f172a',
        glow: 'rgba(255, 255, 255, 0.4)',
      };

      // 1. Dark ambient rim / base
      ctx.fillStyle = theme.rim;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // 2. Volumetric 3D Radial Core
      const coreGrad = ctx.createRadialGradient(lx, ly, 1, 0, 0, r * 0.96);
      coreGrad.addColorStop(0, theme.highlight);
      coreGrad.addColorStop(0.22, theme.center);
      coreGrad.addColorStop(0.72, theme.base);
      coreGrad.addColorStop(1, theme.rim);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Bottom-Right Secondary Bounce Light (Subtle inner glow)
      const bounceGrad = ctx.createRadialGradient(r * 0.35, r * 0.35, 0, r * 0.35, r * 0.35, r * 0.5);
      bounceGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      bounceGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bounceGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1.2, 0, Math.PI * 2);
      ctx.fill();

      // 4. Razor-Sharp Top-Left Specular Catchlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.ellipse(lx, ly, r * 0.42, r * 0.22, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // 5. Micro Specular Dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx - r * 0.12, ly - r * 0.12, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Renders the 3D Swivel Cannon and Launcher Pedestal at the bottom.
   */
  static drawShooter(
    ctx: CanvasRenderingContext2D,
    shooterX: number,
    shooterY: number,
    angle: number,
    loadedColor: string,
    loadedType: 'normal' | 'bomb' | 'rainbow',
    nextColor: string,
    nextType: 'normal' | 'bomb' | 'rainbow',
    isMoving: boolean
  ): void {
    const r = BUBBLE_SHOOTER_VISUAL_CONFIG.radius;

    // ── 1. Pedestal Base Ring with Glowing Halo ──
    ctx.save();
    ctx.translate(shooterX, shooterY);

    // Glowing base halo
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Dark metallic pedestal
    const pedGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, r * 1.8);
    pedGrad.addColorStop(0, '#475569');
    pedGrad.addColorStop(0.5, '#1e293b');
    pedGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = pedGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Metallic beveled border
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner LED energy ring
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
    ctx.stroke();

    // ── 2. Rotatable Cannon Barrel ──
    ctx.save();
    ctx.rotate(angle);

    // Barrel body
    const barrelGrad = ctx.createLinearGradient(0, -r * 0.9, 0, r * 0.9);
    barrelGrad.addColorStop(0, '#64748b');
    barrelGrad.addColorStop(0.5, '#334155');
    barrelGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.roundRect(0, -r * 0.85, r * 2.6, r * 1.7, 6);
    ctx.fill();

    // Glowing barrel guide rails
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -r * 0.6);
    ctx.lineTo(r * 2.4, -r * 0.6);
    ctx.moveTo(4, r * 0.6);
    ctx.lineTo(r * 2.4, r * 0.6);
    ctx.stroke();

    ctx.restore(); // restore rotation

    // ── 3. Loaded Bubble in Cannon Chamber ──
    if (!isMoving) {
      // Gentle floating pulse
      const bob = Math.sin(Date.now() * 0.005) * 1.5;
      Bubble3DRenderer.drawBubble(ctx, 0, bob, loadedColor, loadedType, r * 1.08);
    }

    ctx.restore(); // restore translation

    // ── 4. Next Bubble Preview Slot (Left of Shooter) ──
    const nextX = shooterX - r * 3.8;
    const nextY = shooterY + 6;

    ctx.save();
    // Next Bubble Slot Pod
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(nextX, nextY, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // "NEXT" label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', nextX, nextY - r * 1.1);

    // Draw Next Bubble
    Bubble3DRenderer.drawBubble(ctx, nextX, nextY, nextColor, nextType, r * 0.72);
    ctx.restore();
  }

  /**
   * Renders the glowing dotted trajectory raycast aiming guide.
   */
  static drawAimGuide(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    phantom?: { x: number; y: number; color: string; type: 'normal' | 'bomb' | 'rainbow' }
  ): void {
    if (points.length < 2) return;

    ctx.save();

    // Draw glowing dots along raycast path
    let dotCounter = 0;
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1]!;
      const p2 = points[i]!;

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const step = 14;
      const steps = Math.floor(dist / step);

      for (let s = 0; s <= steps; s++) {
        dotCounter++;
        const t = s / Math.max(1, steps);
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;

        const progress = Math.min(1.0, dotCounter / 24);
        const dotRadius = 2.0 + progress * 1.8;

        // Glowing outer dot
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.beginPath();
        ctx.arc(x, y, dotRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // White core dot
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // If bounced on wall, draw a small impact ring
      if (i < points.length - 1) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw Predicted Ghost Phantom Bubble at Target Collision
    if (phantom) {
      ctx.save();
      // Pulsing target aura ring
      const auraPulse = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + auraPulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(phantom.x, phantom.y, BUBBLE_SHOOTER_VISUAL_CONFIG.radius * 1.2, 0, Math.PI * 2);
      ctx.stroke();

      // Translucent ghost bubble
      Bubble3DRenderer.drawBubble(
        ctx,
        phantom.x,
        phantom.y,
        phantom.color,
        phantom.type,
        BUBBLE_SHOOTER_VISUAL_CONFIG.radius,
        0.55
      );
      ctx.restore();
    }

    ctx.restore();
  }
}
