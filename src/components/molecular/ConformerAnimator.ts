// =============================================================================
// ConformerAnimator – Smooth interpolation between conformer frames
// Runs in requestAnimationFrame loop, supports variable speed & looping
// =============================================================================

import type { ConformerFrame } from "./types";

export class ConformerAnimator {
  private conformers: ConformerFrame[] = [];
  private currentFrameIndex = 0;
  private interpolationT = 0;
  private speed = 1.0;
  private playing = false;
  private lastTimestamp = 0;
  /** Duration per frame transition in ms (before speed scaling) */
  private frameDuration = 2000;

  /** Set conformer frames */
  setConformers(conformers: ConformerFrame[]): void {
    this.conformers = conformers;
    this.currentFrameIndex = 0;
    this.interpolationT = 0;
  }

  /** Set playback speed multiplier */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  /** Start / resume playback */
  play(): void {
    this.playing = true;
    this.lastTimestamp = performance.now();
  }

  /** Pause playback */
  pause(): void {
    this.playing = false;
  }

  /** Reset to first frame */
  reset(): void {
    this.currentFrameIndex = 0;
    this.interpolationT = 0;
  }

  /** Whether there are enough conformers to animate */
  hasAnimation(): boolean {
    return this.conformers.length >= 2;
  }

  /** Current progress (0–1 across all frames) */
  getProgress(): number {
    if (this.conformers.length < 2) return 0;
    const totalSegments = this.conformers.length - 1;
    return (this.currentFrameIndex + this.interpolationT) / totalSegments;
  }

  /**
   * Advance animation and return interpolated positions.
   * Call once per frame inside requestAnimationFrame.
   * Returns null if no conformers or not playing.
   */
  update(timestamp: number): ConformerFrame | null {
    if (!this.playing || this.conformers.length < 2) return null;

    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Advance t
    const effectiveDuration = this.frameDuration / this.speed;
    this.interpolationT += dt / effectiveDuration;

    // Move to next segment if t >= 1
    while (this.interpolationT >= 1) {
      this.interpolationT -= 1;
      this.currentFrameIndex++;
      // Loop back
      if (this.currentFrameIndex >= this.conformers.length - 1) {
        this.currentFrameIndex = 0;
      }
    }

    return this.getInterpolatedFrame();
  }

  /** Get interpolated frame at current t without advancing time */
  getInterpolatedFrame(): ConformerFrame | null {
    if (this.conformers.length < 2) {
      return this.conformers[0] ?? null;
    }

    const frameA = this.conformers[this.currentFrameIndex];
    const nextIdx = (this.currentFrameIndex + 1) % this.conformers.length;
    const frameB = this.conformers[nextIdx];

    return interpolateConformer(frameA, frameB, this.easeInOut(this.interpolationT));
  }

  /** Smooth easing */
  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}

/** Pure function: interpolate between two conformer frames */
export function interpolateConformer(
  confA: ConformerFrame,
  confB: ConformerFrame,
  t: number
): ConformerFrame {
  const count = Math.min(confA.length, confB.length);
  const result: ConformerFrame = new Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = {
      x: confA[i].x + (confB[i].x - confA[i].x) * t,
      y: confA[i].y + (confB[i].y - confA[i].y) * t,
      z: confA[i].z + (confB[i].z - confA[i].z) * t,
    };
  }
  return result;
}
