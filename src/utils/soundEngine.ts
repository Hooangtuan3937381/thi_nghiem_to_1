class SoundEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private decayTimer: number | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTuningFork(freqHz: number, volume = 0.25, durationSec = 3.5, sustained = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stop();

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqHz, now);

      const safeVol = Math.max(0.01, Math.min(0.4, volume));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(safeVol, now + 0.015);

      if (!sustained) {
        gain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);

      if (!sustained) {
        osc.stop(now + durationSec + 0.05);
        this.decayTimer = window.setTimeout(() => {
          this.stop();
        }, (durationSec + 0.1) * 1000);
      }

      this.osc = osc;
      this.gainNode = gain;
    } catch {
      // Ignore audio failures in restricted/headless environments
    }
  }

  public updateFrequency(freqHz: number): void {
    if (this.ctx && this.osc) {
      try {
        this.osc.frequency.setValueAtTime(freqHz, this.ctx.currentTime);
      } catch {
        // Ignore
      }
    }
  }

  public stop(): void {
    if (this.decayTimer !== null) {
      window.clearTimeout(this.decayTimer);
      this.decayTimer = null;
    }
    if (this.osc) {
      try {
        this.osc.stop();
        this.osc.disconnect();
      } catch {
        // Ignore
      }
      this.osc = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Ignore
      }
      this.gainNode = null;
    }
  }
}

export const soundEngine = new SoundEngine();
