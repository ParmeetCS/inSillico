// =============================================================================
// Molecular Visualization Engine – Constants & Color Schemes
// Jmol standard coloring · Covalent radii · van der Waals radii
// =============================================================================

import * as THREE from "three";

// --------------- Jmol Element Colors ----------------------------------------
export const ELEMENT_COLORS: Record<string, string> = {
  H:  "#666666",
  He: "#7FC8D8",
  Li: "#9B50E0",
  Be: "#80B300",
  B:  "#E08080",
  C:  "#333333",
  N:  "#2040D0",
  O:  "#CC0000",
  F:  "#50A030",
  Ne: "#6CA8C8",
  Na: "#7B30C0",
  Mg: "#55AA00",
  Al: "#8A7070",
  Si: "#C09060",
  P:  "#CC6600",
  S:  "#C8C800",
  Cl: "#10B010",
  Ar: "#509898",
  K:  "#6620A0",
  Ca: "#28CC00",
  Fe: "#B04020",
  Cu: "#A06020",
  Zn: "#505080",
  Br: "#801818",
  I:  "#6A006A",
  Pt: "#909098",
  Au: "#D4A800",
  Pd: "#004560",
  Ag: "#888888",
};

export function getElementColor(element: string): THREE.Color {
  const hex = ELEMENT_COLORS[element] ?? "#FF69B4"; // hot pink for unknowns
  return new THREE.Color(hex);
}

// --------------- Covalent Radii (Angstroms) ---------------------------------
export const COVALENT_RADII: Record<string, number> = {
  H:  0.31,
  He: 0.28,
  Li: 1.28,
  Be: 0.96,
  B:  0.84,
  C:  0.76,
  N:  0.71,
  O:  0.66,
  F:  0.57,
  Ne: 0.58,
  Na: 1.66,
  Mg: 1.41,
  Al: 1.21,
  Si: 1.11,
  P:  1.07,
  S:  1.05,
  Cl: 1.02,
  Ar: 1.06,
  K:  2.03,
  Ca: 1.76,
  Fe: 1.32,
  Cu: 1.32,
  Zn: 1.22,
  Br: 1.20,
  I:  1.39,
  Pt: 1.36,
  Au: 1.36,
  Pd: 1.39,
  Ag: 1.45,
};

// --------------- Van der Waals Radii (for space-filling) --------------------
export const VDW_RADII: Record<string, number> = {
  H:  1.20,
  He: 1.40,
  Li: 1.82,
  Be: 1.53,
  B:  1.92,
  C:  1.70,
  N:  1.55,
  O:  1.52,
  F:  1.47,
  Ne: 1.54,
  Na: 2.27,
  Mg: 1.73,
  Al: 1.84,
  Si: 2.10,
  P:  1.80,
  S:  1.80,
  Cl: 1.75,
  Ar: 1.88,
  K:  2.75,
  Ca: 2.31,
  Fe: 2.04,
  Cu: 1.40,
  Zn: 1.39,
  Br: 1.85,
  I:  1.98,
  Pt: 1.75,
  Au: 1.66,
  Pd: 1.63,
  Ag: 1.72,
};

/** Ball-and-stick display radius scaling */
export const BALL_STICK_SCALE = 0.45;
/** Space-filling display radius scaling */
export const SPACE_FILL_SCALE = 1.0;

export function getAtomRadius(
  element: string,
  mode: "ball-stick" | "space-filling" | "wireframe" = "ball-stick"
): number {
  if (mode === "space-filling") {
    return (VDW_RADII[element] ?? 1.7) * SPACE_FILL_SCALE;
  }
  if (mode === "wireframe") {
    return (COVALENT_RADII[element] ?? 0.76) * 0.15;
  }
  return (COVALENT_RADII[element] ?? 0.76) * BALL_STICK_SCALE;
}

/** Bond cylinder radius */
export const BOND_RADIUS = 0.12;
/** Double bond offset distance */
export const DOUBLE_BOND_OFFSET = 0.16;

// --------------- Scene Defaults ---------------------------------------------
export const DEFAULT_BACKGROUND = "#ffffff";
export const AMBIENT_INTENSITY = 0.8;
export const DIRECTIONAL_INTENSITY = 1.2;
export const GLOW_COLOR = new THREE.Color("#4a90d9");
export const GLOW_INTENSITY = 0.12;

// --------------- Animation Defaults -----------------------------------------
export const DEFAULT_ANIMATION_SPEED = 1.0;
export const CONFORMER_FRAME_DURATION = 2000; // ms per frame
export const REACTION_DURATION = 3000;         // ms for full reaction
export const VIBRATION_BASE_AMPLITUDE = 0.02;  // Angstroms
export const VIBRATION_FREQ_RANGE: [number, number] = [2, 8]; // Hz
