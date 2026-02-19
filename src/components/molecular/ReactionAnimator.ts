// =============================================================================
// ReactionAnimator – Bond formation/breaking + atom morphing animation
// Smoothly transitions between reactant and product geometries
// =============================================================================

import type { ReactionData, BondChange, Atom, Bond } from "./types";
import { AtomMeshManager } from "./AtomMesh";
import { BondMeshManager } from "./BondMesh";

export type ReactionPhase = "idle" | "breaking" | "morphing" | "forming" | "complete";

export class ReactionAnimator {
  private reaction: ReactionData | null = null;
  private atomMgr: AtomMeshManager;
  private bondMgr: BondMeshManager;
  private progress = 0;       // 0 → 1
  private playing = false;
  private lastTimestamp = 0;
  private duration = 3000;     // ms for full animation
  private speed = 1.0;
  private phase: ReactionPhase = "idle";
  private looping = false;

  // Cached start/end positions for morphing
  private startPositions: { x: number; y: number; z: number }[] = [];
  private endPositions: { x: number; y: number; z: number }[] = [];
  private breakingBonds: BondChange[] = [];
  private formingBonds: BondChange[] = [];

  constructor(atomMgr: AtomMeshManager, bondMgr: BondMeshManager) {
    this.atomMgr = atomMgr;
    this.bondMgr = bondMgr;
  }

  /** Load reaction data and prepare for animation */
  setReaction(reaction: ReactionData): void {
    this.reaction = reaction;
    this.progress = 0;
    this.phase = "idle";

    // Cache positions
    this.startPositions = reaction.before.atoms.map((a) => ({
      x: a.x,
      y: a.y,
      z: a.z,
    }));
    this.endPositions = reaction.after.atoms.map((a) => ({
      x: a.x,
      y: a.y,
      z: a.z,
    }));

    // Separate bond changes
    this.breakingBonds = reaction.bondChanges.filter((c) => c.type === "break");
    this.formingBonds = reaction.bondChanges.filter((c) => c.type === "form");

    // Build the merged atom set (union of before + after atoms)
    // For rendering, start with "before" geometry and all bonds (including forming ones hidden)
    const mergedAtoms = [...reaction.before.atoms];
    const mergedBonds = [...reaction.before.bonds];

    // Add forming bonds (start hidden at scale 0)
    for (const fc of this.formingBonds) {
      const exists = mergedBonds.some(
        (b) =>
          (b.atom1 === fc.atom1 && b.atom2 === fc.atom2) ||
          (b.atom1 === fc.atom2 && b.atom2 === fc.atom1)
      );
      if (!exists) {
        mergedBonds.push({ atom1: fc.atom1, atom2: fc.atom2, order: fc.order ?? 1 });
      }
    }

    this.atomMgr.setAtoms(mergedAtoms);
    this.bondMgr.setBonds(mergedAtoms, mergedBonds);

    // Hide forming bonds initially
    for (const fc of this.formingBonds) {
      this.bondMgr.setBondScale(fc.atom1, fc.atom2, 0);
    }
  }

  /** Set animation duration in ms */
  setDuration(ms: number): void {
    this.duration = Math.max(500, ms);
  }

  /** Set speed multiplier */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  /** Enable/disable looping */
  setLooping(loop: boolean): void {
    this.looping = loop;
  }

  /** Start / resume */
  play(): void {
    this.playing = true;
    this.lastTimestamp = performance.now();
    if (this.phase === "idle" || this.phase === "complete") {
      this.progress = 0;
      this.phase = "breaking";
    }
  }

  /** Pause */
  pause(): void {
    this.playing = false;
  }

  /** Reset to beginning */
  reset(): void {
    this.progress = 0;
    this.phase = "idle";
    this.playing = false;
    if (this.reaction) {
      this.setReaction(this.reaction);
    }
  }

  /** Get current phase */
  getPhase(): ReactionPhase {
    return this.phase;
  }

  /** Get progress 0–1 */
  getProgress(): number {
    return this.progress;
  }

  /**
   * Advance animation. Call once per frame.
   * Returns true if scene was updated.
   */
  update(timestamp: number): boolean {
    if (!this.playing || !this.reaction) return false;

    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const effectiveDuration = this.duration / this.speed;
    this.progress += dt / effectiveDuration;

    if (this.progress >= 1) {
      this.progress = 1;
      this.phase = "complete";
      this.playing = false;
      if (this.looping) {
        this.progress = 0;
        this.phase = "breaking";
        this.playing = true;
      }
    }

    this.applyFrame(this.progress);
    return true;
  }

  /** Apply a specific progress value (for scrubbing) */
  seek(progress: number): void {
    this.progress = Math.max(0, Math.min(1, progress));
    this.phase =
      this.progress < 0.33
        ? "breaking"
        : this.progress < 0.66
        ? "morphing"
        : this.progress < 1
        ? "forming"
        : "complete";
    this.applyFrame(this.progress);
  }

  // ---- Private ----

  private applyFrame(p: number): void {
    if (!this.reaction) return;

    // Phase mapping: breaking (0–0.33), morphing (0.33–0.66), forming (0.66–1.0)
    const breakT = this.easeInOut(Math.min(1, p / 0.33));
    const morphT = this.easeInOut(Math.max(0, Math.min(1, (p - 0.2) / 0.6)));
    const formT = this.easeInOut(Math.max(0, (p - 0.66) / 0.34));

    // 1) Bond breaking: fade opacity and shrink
    for (const bc of this.breakingBonds) {
      this.bondMgr.setBondOpacity(bc.atom1, bc.atom2, 1 - breakT);
      this.bondMgr.setBondScale(bc.atom1, bc.atom2, 1 - breakT * 0.5);
    }

    // 2) Atom morphing: interpolate positions
    this.atomMgr.lerpPositions(this.startPositions, this.endPositions, morphT);

    // Update bond positions to follow atoms
    const currentAtoms = this.reaction.before.atoms.map((a, i) => ({
      ...a,
      x: this.startPositions[i].x + (this.endPositions[i].x - this.startPositions[i].x) * morphT,
      y: this.startPositions[i].y + (this.endPositions[i].y - this.startPositions[i].y) * morphT,
      z: this.startPositions[i].z + (this.endPositions[i].z - this.startPositions[i].z) * morphT,
    }));
    this.bondMgr.updateFromAtoms(currentAtoms);

    // 3) Bond forming: scale from 0 to 1
    for (const fc of this.formingBonds) {
      this.bondMgr.setBondScale(fc.atom1, fc.atom2, formT);
      this.bondMgr.setBondOpacity(fc.atom1, fc.atom2, formT);
    }
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}
