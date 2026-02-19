// =============================================================================
// BondMesh – GPU-instanced bond cylinder renderer
// Handles single, double, and triple bonds with proper quaternion alignment
// =============================================================================

import * as THREE from "three";
import type { Atom, Bond, VisualizationMode } from "./types";
import { BOND_RADIUS, DOUBLE_BOND_OFFSET, getElementColor } from "./constants";

const CYLINDER_SEGMENTS = 8;
const UP = new THREE.Vector3(0, 1, 0);

/** Internal representation of a rendered bond cylinder */
interface BondCylinder {
  bond: Bond;
  offset: THREE.Vector3; // offset for double/triple
}

export class BondMeshManager {
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private geometry: THREE.CylinderGeometry;
  private material: THREE.MeshStandardMaterial;
  private atoms: Atom[] = [];
  private bonds: Bond[] = [];
  private cylinders: BondCylinder[] = [];
  private dummy = new THREE.Object3D();
  private colorAttr: THREE.InstancedBufferAttribute | null = null;
  private mode: VisualizationMode = "ball-stick";
  /** Opacity per cylinder for fade animations (1.0 = fully visible) */
  private opacities: number[] = [];
  /** Scale per cylinder for form/break animations (1.0 = full) */
  private scales: number[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Unit cylinder (height = 1, radius = 1); scaled per-instance
    this.geometry = new THREE.CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS);
    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.1,
      vertexColors: true,
      transparent: true,
      envMapIntensity: 1.2,
    });
  }

  /** Build bond instances from atoms + bond list */
  setBonds(atoms: Atom[], bonds: Bond[], mode: VisualizationMode = "ball-stick"): void {
    this.dispose();
    this.atoms = atoms;
    this.bonds = bonds;
    this.mode = mode;

    // Expand bonds into individual cylinders (double bonds = 2 cylinders, etc.)
    this.cylinders = [];
    for (const bond of bonds) {
      if (bond.order <= 1) {
        this.cylinders.push({ bond, offset: new THREE.Vector3(0, 0, 0) });
      } else {
        // Compute perpendicular offset direction
        const a1 = this.findAtom(bond.atom1);
        const a2 = this.findAtom(bond.atom2);
        if (!a1 || !a2) continue;
        const dir = new THREE.Vector3(a2.x - a1.x, a2.y - a1.y, a2.z - a1.z).normalize();
        const perp = new THREE.Vector3();
        if (Math.abs(dir.dot(UP)) > 0.99) {
          perp.crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize();
        } else {
          perp.crossVectors(dir, UP).normalize();
        }

        const count = Math.min(bond.order, 3);
        const offsets: THREE.Vector3[] = [];
        if (count === 2) {
          offsets.push(perp.clone().multiplyScalar(DOUBLE_BOND_OFFSET));
          offsets.push(perp.clone().multiplyScalar(-DOUBLE_BOND_OFFSET));
        } else if (count === 3) {
          offsets.push(new THREE.Vector3(0, 0, 0));
          offsets.push(perp.clone().multiplyScalar(DOUBLE_BOND_OFFSET * 1.2));
          offsets.push(perp.clone().multiplyScalar(-DOUBLE_BOND_OFFSET * 1.2));
        }
        for (const off of offsets) {
          this.cylinders.push({ bond, offset: off });
        }
      }
    }

    if (this.cylinders.length === 0) return;

    const count = this.cylinders.length;
    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.instancedMesh.name = "bonds";

    const colors = new Float32Array(count * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.instancedMesh.instanceColor = this.colorAttr;

    this.opacities = new Array(count).fill(1.0);
    this.scales = new Array(count).fill(1.0);

    this.updateTransforms();
    this.scene.add(this.instancedMesh);
  }

  /** Update bond positions after atoms have moved (animation) */
  updateFromAtoms(atoms: Atom[]): void {
    this.atoms = atoms;
    this.updateTransforms();
  }

  /** Set individual cylinder opacity (for bond-break animation) */
  setCylinderOpacity(bondIndex: number, opacity: number): void {
    // bondIndex maps to all cylinders belonging to that bond
    let idx = 0;
    for (let i = 0; i < this.cylinders.length; i++) {
      if (this.bonds.indexOf(this.cylinders[i].bond) === bondIndex) {
        this.opacities[idx] = opacity;
      }
      idx++;
    }
  }

  /** Set scale for a bond (for bond-form animation: 0 → 1) */
  setBondScale(atom1Id: number, atom2Id: number, scale: number): void {
    for (let i = 0; i < this.cylinders.length; i++) {
      const b = this.cylinders[i].bond;
      if (
        (b.atom1 === atom1Id && b.atom2 === atom2Id) ||
        (b.atom1 === atom2Id && b.atom2 === atom1Id)
      ) {
        this.scales[i] = Math.max(0, Math.min(1, scale));
      }
    }
    this.updateTransforms();
  }

  /** Set opacity for a specific bond pair */
  setBondOpacity(atom1Id: number, atom2Id: number, opacity: number): void {
    for (let i = 0; i < this.cylinders.length; i++) {
      const b = this.cylinders[i].bond;
      if (
        (b.atom1 === atom1Id && b.atom2 === atom2Id) ||
        (b.atom1 === atom2Id && b.atom2 === atom1Id)
      ) {
        this.opacities[i] = Math.max(0, Math.min(1, opacity));
      }
    }
    // We reflect opacity via color alpha channel trick – darken color
    this.updateTransforms();
  }

  /** Change visualization mode */
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
    this.colorAttr = null;
    this.cylinders = [];
    this.opacities = [];
    this.scales = [];
  }

  // ---- Private ----

  private findAtom(id: number): Atom | undefined {
    return this.atoms.find((a) => a.id === id);
  }

  private updateTransforms(): void {
    if (!this.instancedMesh || !this.colorAttr) return;

    const bondRadius = this.mode === "wireframe" ? BOND_RADIUS * 0.3 : BOND_RADIUS;

    for (let i = 0; i < this.cylinders.length; i++) {
      const { bond, offset } = this.cylinders[i];
      const a1 = this.findAtom(bond.atom1);
      const a2 = this.findAtom(bond.atom2);
      if (!a1 || !a2) continue;

      const start = new THREE.Vector3(a1.x, a1.y, a1.z).add(offset);
      const end = new THREE.Vector3(a2.x, a2.y, a2.z).add(offset);

      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dir = end.clone().sub(start);
      const length = dir.length() * this.scales[i];

      // Position at midpoint
      this.dummy.position.copy(mid);

      // Scale: radius for x/z, length for y
      this.dummy.scale.set(bondRadius, length, bondRadius);

      // Quaternion to rotate cylinder y-axis to bond direction
      const direction = dir.normalize();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(UP, direction);
      this.dummy.quaternion.copy(quat);

      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      // Blend color from both atoms, apply opacity
      const c1 = getElementColor(a1.element);
      const c2 = getElementColor(a2.element);
      const blended = new THREE.Color().lerpColors(c1, c2, 0.5);
      const op = this.opacities[i];
      // Darken to simulate opacity (instanced mesh doesn't support per-instance alpha natively)
      this.colorAttr.setXYZ(i, blended.r * op, blended.g * op, blended.b * op);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
