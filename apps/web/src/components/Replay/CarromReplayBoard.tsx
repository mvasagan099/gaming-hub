import { useEffect, useRef } from 'react';
import type { ReplayEventRecord } from '@gaming-hub/shared';
import { CarromBoardRenderer } from '../../games/carrom/rendering/CarromBoardRenderer';
import { CarromPieceRenderer, type RenderableCoin } from '../../games/carrom/rendering/CarromPieceRenderer';
import { startAnimationLoop } from '../../games/shared/hooks/animationLoop';

interface Piece { id: string; type?: RenderableCoin['type']; x: number; y: number; pocketed?: boolean }
interface Frame { frame: number; pieces: Piece[] }

// Recorded positions only: no live driver, worker, socket input or physics engine.
export function CarromReplayBoard({ event, fallbackState, isPlaying, speed }: {
  event?: ReplayEventRecord; fallbackState: unknown; isPlaying: boolean; speed: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef({ event: undefined as ReplayEventRecord | undefined, elapsed: 0, started: false });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const state = fallbackState as { coins?: Piece[]; striker?: Piece } | undefined;
    const events = event?.resultData.events;
    const trajectory = Array.isArray(events) ? events.find(e => e.type === 'shot-trajectory') : undefined;
    const frames = (trajectory?.keyframes ?? event?.resultData.lastTrajectory ?? []) as Frame[];
    const types = new Map((state?.coins ?? []).map(coin => [coin.id, coin.type]));
    const draw = (pieces: Piece[]) => {
      ctx.clearRect(0, 0, 600, 600);
      CarromBoardRenderer.drawBoard(ctx, 600, 600);
      for (const piece of pieces) {
        if (piece.pocketed || !Number.isFinite(piece.x) || !Number.isFinite(piece.y)) continue;
        const type = piece.type ?? (piece.id === 'striker' ? 'striker' : types.get(piece.id));
        if (!type) continue;
        CarromPieceRenderer.drawCoin(ctx, { ...piece, type, radius: type === 'striker' ? 18 : 15, active: true }, true, false, false);
      }
    };
    const settled = [...(state?.coins ?? []), ...(state?.striker ? [{ ...state.striker, id: 'striker', type: 'striker' as const }] : [])];
    if (playbackRef.current.event !== event) playbackRef.current = { event, elapsed: 0, started: false };
    const clock = playbackRef.current;
    let index = 0;
    const drawFrame = () => {
      while (index < frames.length - 1 && frames[index + 1].frame <= clock.elapsed) index++;
      if (index === frames.length - 1) {
        draw(settled.length ? settled : frames[index].pieces);
        return true;
      }
      const a = frames[index], b = frames[index + 1];
      const fraction = b.frame > a.frame ? Math.min(1, (clock.elapsed - a.frame) / (b.frame - a.frame)) : 0;
      const next = new Map(b.pieces.map(p => [p.id, p]));
      draw(a.pieces.map(p => {
        const target = next.get(p.id);
        return target ? { ...p, x: p.x + (target.x - p.x) * fraction, y: p.y + (target.y - p.y) * fraction } : p;
      }));
      return false;
    };
    if (!frames.length) { draw(settled); return; }
    if (!isPlaying) {
      if (clock.started) drawFrame();
      else draw(settled.length ? settled : frames[frames.length - 1].pieces);
      return;
    }
    if (clock.elapsed >= frames[frames.length - 1].frame) clock.elapsed = 0;
    clock.started = true;
    drawFrame();
    let stop = () => {};
    stop = startAnimationLoop(dt => {
      clock.elapsed += dt * speed * 60;
      if (drawFrame()) stop();
    });
    return () => stop();
  }, [event, fallbackState, isPlaying, speed]);
  return <canvas ref={canvasRef} width={600} height={600} aria-label="Recorded Carrom board"
    className="w-full max-w-[min(28rem,42vh)] mx-auto aspect-square rounded-xl" />;
}
