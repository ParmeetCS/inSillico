// =============================================================================
// Molecular Visualization Engine – Constants & Color Schemes
// Jmol standard coloring · Covalent radii · van der Waals radii
// =============================================================================

import * as THREE from "three";

// --------------- Jmol Element Colors ----------------------------------------
export const ELEMENT_COLORS: Record<string, string> = {
  H:  "#FFFFFF",
  He: "#D9FFFF",
  Li: "#CC80FF",
  Be: "#C2FF00",
  B:  "#FFB5B5",
  C:  "#909090",
  N:  "#3050F8",
  O:  "#FF0D0D",
  F:  "#90E050",
  Ne: "#B3E3F5",
  Na: "#AB5CF2",
  Mg: "#8AFF00",
  Al: "#BFA6A6",
  Si: "#F0C8A0",
  P:  "#FF8000",
  S:  "#FFFF30",
  Cl: "#1FF01F",
  Ar: "#80D1E3",
  K:  "#8F40D4",
  Ca: "#3DFF00",
  Fe: "#E06633",
  Cu: "#C88033",
  Zn: "#7D80B0",
  Br: "#A62929",
  I:  "#940094",
  Pt: "#D0D0E0",
  Au: "#FFD123",
  Pd: "#006985",
  Ag: "#C0C0C0",
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
export const BALL_STICK_SCALE = 0.35;
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
export const BOND_RADIUS = 0.08;
/** Double bond offset distance */
export const DOUBLE_BOND_OFFSET = 0.12;

// --------------- Scene Defaults ---------------------------------------------
export const DEFAULT_BACKGROUND = "#0a0e1a";
export const AMBIENT_INTENSITY = 0.4;
export const DIRECTIONAL_INTENSITY = 0.9;
export const GLOW_COLOR = new THREE.Color("#3b82f6");
export const GLOW_INTENSITY = 0.15;

// --------------- Animation Defaults -----------------------------------------
export const DEFAULT_ANIMATION_SPEED = 1.0;
export const CONFORMER_FRAME_DURATION = 2000; // ms per frame
export const REACTION_DURATION = 3000;         // ms for full reaction
export const VIBRATION_BASE_AMPLITUDE = 0.02;  // Angstroms
export const VIBRATION_FREQ_RANGE: [number, number] = [2, 8]; // Hz
