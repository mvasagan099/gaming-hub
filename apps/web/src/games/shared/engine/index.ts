export class AudioEngine {
  private static isMuted = false;

  static toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  static playBeep(freq = 440, duration = 0.1) {
    if (this.isMuted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio context fallback
    }
  }
}

export class AnimationEngine {
  static animateValue(start: number, end: number, duration: number, callback: (val: number) => void) {
    const startTime = performance.now();
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(start + (end - start) * progress);
      callback(current);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
}

export class ScoreEngine {
  static calculatePrize(stake: number, multiplier = 1.8): number {
    return Math.floor(stake * multiplier);
  }
}
