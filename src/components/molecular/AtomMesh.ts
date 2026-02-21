// =============================================================================
// AtomMesh – GPU-instanced atom sphere renderer
// Uses InstancedMesh for high-performance rendering of hundreds of atoms
// =============================================================================

import * as THREE from "three";
import type { Atom, VisualizationMode } from "./types";
import { getElementColor, getAtomRadius, GLOW_COLOR, GLOW_INTENSITY } from "./constants";

/** Sphere geometry detail (segments). Shared across all atoms. */
const SPHERE_SEGMENTS = 32;

export class AtomMeshManager {
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private glowMesh: THREE.InstancedMesh | null = null;
  private geometry: THREE.SphereGeometry;
  private glowGeometry: THREE.SphereGeometry;
  private material: THREE.MeshStandardMaterial;
  private glowMaterial: THREE.MeshBasicMaterial;
  private atoms: Atom[] = [];
  private mode: VisualizationMode = "ball-stick";
  private dummy = new THREE.Object3D();
  private colorAttr: THREE.InstancedBufferAttribute | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    this.glowGeometry = new THREE.SphereGeometry(1, 16, 16);

    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.15,
      vertexColors: true,
      envMapIntensity: 1.2,
    });

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: GLOW_INTENSITY,
      side: THREE.BackSide,
    });
  }

  /** Build / rebuild instanced meshes for a new set of atoms */
  setAtoms(atoms: Atom[], mode: VisualizationMode = "ball-stick"): void {
    this.dispose();
    this.atoms = atoms;
    this.mode = mode;
    if (atoms.length === 0) return;

    const count = atoms.length;

    // --- Main atom spheres ---
    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.name = "atoms";

    // Per-instance colours
    const colors = new Float32Array(count * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.instancedMesh.instanceColor = this.colorAttr;

    // --- Glow halos ---
    this.glowMesh = new THREE.InstancedMesh(this.glowGeometry, this.glowMaterial, count);
    this.glowMesh.name = "atom-glow";

    this.updateTransforms();

    this.scene.add(this.instancedMesh);
    this.scene.add(this.glowMesh);
  }

  /** Update positions without recreating meshes (for animation) */
  updatePositions(positions: { x: number; y: number; z: number }[]): void {
    if (!this.instancedMesh || !this.glowMesh) return;
    for (let i = 0; i < this.atoms.length && i < positions.length; i++) {
      this.atoms[i].x = positions[i].x;
      this.atoms[i].y = positions[i].y;
      this.atoms[i].z = positions[i].z;
    }
    this.updateTransforms();
  }

  /** Smoothly interpolate atom positions (for morphing) */
  lerpPositions(
    from: { x: number; y: number; z: number }[],
    to: { x: number; y: number; z: number }[],
    t: number
  ): void {
    if (!this.instancedMesh || !this.glowMesh) return;
    const count = Math.min(this.atoms.length, from.length, to.length);
    for (let i = 0; i < count; i++) {
      this.atoms[i].x = from[i].x + (to[i].x - from[i].x) * t;
      this.atoms[i].y = from[i].y + (to[i].y - from[i].y) * t;
      this.atoms[i].z = from[i].z + (to[i].z - from[i].z) * t;
    }
    this.updateTransforms();
  }

  /** Apply small vibration offsets */
  applyVibration(offsets: { dx: number; dy: number; dz: number }[]): void {
    if (!this.instancedMesh || !this.glowMesh) return;
    for (let i = 0; i < this.atoms.length && i < offsets.length; i++) {
      const r = getAtomRadius(this.atoms[i].element, this.mode);
      this.dummy.position.set(
        this.atoms[i].x + offsets[i].dx,
        this.atoms[i].y + offsets[i].dy,
        this.atoms[i].z + offsets[i].dz
      );
      this.dummy.scale.setScalar(r);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      // Glow slightly larger
      this.dummy.scale.setScalar(r * 1.3);
      this.dummy.updateMatrix();
      this.glowMesh!.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh!.instanceMatrix.needsUpdate = true;
  }

  /** Get current atom positions */
  getPositions(): { x: number; y: number; z: number }[] {
    return this.atoms.map((a) => ({ x: a.x, y: a.y, z: a.z }));
  }

  /** Change visualization mode without full rebuild */
  setMode(mode: VisualizationMode): void {
    this.mode = mode;
    this.updateTransforms();
  }

  /** Clean up GPU resources */
  dispose(): void {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
    if (this.glowMesh) {
      this.scene.remove(this.glowMesh);
      this.glowMesh.dispose();
      this.glowMesh = null;
    }
    this.colorAttr = null;
  }

  // ---- Private ----

  private updateTransforms(): void {
    if (!this.instancedMesh || !this.glowMesh || !this.colorAttr) return;
    const count = this.atoms.length;
    for (let i = 0; i < count; i++) {
      const atom = this.atoms[i];
      const r = getAtomRadius(atom.element, this.mode);

      // Position + scale
      this.dummy.position.set(atom.x, atom.y, atom.z);
      this.dummy.scale.setScalar(r);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      // Glow halo (slightly larger)
      this.dummy.scale.setScalar(r * 1.3);
      this.dummy.updateMatrix();
      this.glowMesh.setMatrixAt(i, this.dummy.matrix);

      // Color
      const color = getElementColor(atom.element);
      this.colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
