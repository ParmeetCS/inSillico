// =============================================================================
// VibrationEngine – Temperature-based sinusoidal atom oscillations
// Each atom gets unique frequency/phase; amplitude scales with temperature
// =============================================================================

import { VIBRATION_BASE_AMPLITUDE, VIBRATION_FREQ_RANGE } from "./constants";

interface AtomVibrationParams {
  freqX: number;
  freqY: number;
  freqZ: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
}

export class VibrationEngine {
  private enabled = false;
  private temperature = 0;           // 0–500 conceptual scale
  private baseAmplitude = VIBRATION_BASE_AMPLITUDE;
  private atomParams: AtomVibrationParams[] = [];
  private atomCount = 0;

  /** Initialize with a given number of atoms (random freqs/phases) */
  init(atomCount: number): void {
    this.atomCount = atomCount;
    this.atomParams = [];
    const [fMin, fMax] = VIBRATION_FREQ_RANGE;
    for (let i = 0; i < atomCount; i++) {
      this.atomParams.push({
        freqX: fMin + Math.random() * (fMax - fMin),
        freqY: fMin + Math.random() * (fMax - fMin),
        freqZ: fMin + Math.random() * (fMax - fMin),
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Enable vibration */
  enable(): void {
    this.enabled = true;
  }

  /** Disable vibration */
  disable(): void {
    this.enabled = false;
  }

  /** Toggle on/off */
  toggle(): void {
    this.enabled = !this.enabled;
  }

  /** Whether currently enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Set temperature (affects amplitude). 0 = no vibration. */
  setTemperature(temp: number): void {
    this.temperature = Math.max(0, temp);
  }

  /**
   * Compute vibration offsets for all atoms at a given time.
   * Returns array of {dx, dy, dz} displacements.
   * Returns empty array if disabled or temperature is 0.
   */
  getOffsets(timeSeconds: number): { dx: number; dy: number; dz: number }[] {
    if (!this.enabled || this.temperature <= 0 || this.atomCount === 0) {
      return [];
    }

    // Temperature factor: linear scaling, normalized so T=300 gives factor=1.0
    const tempFactor = this.temperature / 300;
    const amplitude = this.baseAmplitude * tempFactor;

    const offsets: { dx: number; dy: number; dz: number }[] = new Array(this.atomCount);
    for (let i = 0; i < this.atomCount; i++) {
      const p = this.atomParams[i];
      offsets[i] = {
        dx: amplitude * Math.sin(p.freqX * timeSeconds * Math.PI * 2 + p.phaseX),
        dy: amplitude * Math.sin(p.freqY * timeSeconds * Math.PI * 2 + p.phaseY),
        dz: amplitude * Math.sin(p.freqZ * timeSeconds * Math.PI * 2 + p.phaseZ),
      };
    }

    return offsets;
  }
}
