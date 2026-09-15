export class CricketAudioManager {
  private ctx: AudioContext | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private noiseBuffers = new Map<number, AudioBuffer>();

  constructor() {
    // We defer AudioContext creation until a user interaction usually, 
    // but modern browsers allow creation, we just might need to resume it.
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContext();
    } catch (_e) {
      console.warn("Web Audio API not supported in this browser");
    }
  }

  private ensureContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(duration: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const cached = this.noiseBuffers.get(duration);
    if (cached) return cached;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffers.set(duration, buffer);
    return buffer;
  }

  public playHit(power: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Power ranges roughly from 0 (miss/edge) to 1500 (six)
    const isBoundary = power >= 1000;
    const strength = Math.max(0.05, Math.min(1, power / 1500));
    const duration = isBoundary ? 0.11 : 0.065;
    
    // Noise burst
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1400 + strength * 1800;
    noiseFilter.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.16 + strength * 0.30, ctx.currentTime + 0.001);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Oscillator for the wood "tock" sound
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 + strength * 300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + duration);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.12 + strength * 0.20, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noiseSrc.start();
    osc.start();
    osc.stop(ctx.currentTime + duration);
    noiseSrc.onended = () => { noiseSrc.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); };
    osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
  }

  public playCrowdRoar() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duration = 4.0;
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Sweep the filter up to simulate excitement
    filter.frequency.setValueAtTime(300, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(1500, ctx.currentTime + 0.5);
    filter.frequency.linearRampToValueAtTime(500, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    src.start();
  }

  public playCrowdGroan() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duration = 2.5;
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Sweep pitch down to simulate disappointment
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    src.start();
  }

  public playWhoosh() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duration = 0.5;
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    // Fast sweep from high to low
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    src.start();
  }

  public playWicket() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // A loud "crack" sound using noise and oscillator for the stump hit
    const duration = 0.4;
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 600; 
    noiseFilter.Q.value = 2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noiseSrc.start();
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  public playAmbientMurmur() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.ambientOsc) return; // Already playing

    // Creating a low rumbling oscillator with noise to simulate distant crowd
    const noiseBuffer = this.createNoiseBuffer(10.0); // 10 sec loop
    if (!noiseBuffer) return;
    
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150; // Very muffled

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0; // Start at 0, fade in
    this.ambientGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2); // Soft volume

    src.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(ctx.destination);
    
    src.start();
    // We store src in ambientOsc just to keep track of it to stop later
    // @ts-ignore - duck typing it for stopping
    this.ambientOsc = src; 
  }

  public stopAmbient() {
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
      setTimeout(() => {
        if (this.ambientOsc) {
          try { this.ambientOsc.stop(); } catch(_e) {}
          this.ambientOsc = null;
        }
      }, 1000);
    }
  }

  public destroy() {
    this.noiseBuffers.clear();
    this.stopAmbient();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
  }
}
