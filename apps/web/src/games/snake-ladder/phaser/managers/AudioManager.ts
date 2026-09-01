import Phaser from "phaser";

type SfxKey = "roll" | "move" | "snake" | "ladder" | "win" | "click";

export class AudioManager {
  private scene: Phaser.Scene;
  private muted = false;
  private volume = 0.6;
  private sounds = new Map<SfxKey, Phaser.Sound.BaseSound>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Try to load and store each SFX; silently skip missing files */
  init(): void {
    const keys: SfxKey[] = ["roll", "move", "snake", "ladder", "win", "click"];
    for (const key of keys) {
      try {
        if (this.scene.cache.audio.exists(key)) {
          const sound = this.scene.sound.add(key, { volume: this.volume });
          this.sounds.set(key, sound);
        }
      } catch {
        // Asset not loaded — silently skip
      }
    }
  }

  play(key: SfxKey): void {
    if (this.muted) return;
    const s = this.sounds.get(key);
    if (!s) return;
    try {
      s.play();
    } catch {
      // Ignore playback errors (e.g., context suspended)
    }
  }

  mute(): void {
    this.muted = true;
  }

  unmute(): void {
    this.muted = false;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    for (const sound of this.sounds.values()) {
      (sound as Phaser.Sound.WebAudioSound).setVolume?.(this.volume);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export default AudioManager;
