// =============================================================================
// Molecular Visualization Engine – Type Definitions
// =============================================================================

/** A single atom in 3D space */
export interface Atom {
  id: number;
  element: string;
  x: number;
  y: number;
  z: number;
  /** Optional charge for electrostatic display */
  charge?: number;
  /** Optional label override */
  label?: string;
}

/** A bond connecting two atoms */
export interface Bond {
  atom1: number; // id of first atom
  atom2: number; // id of second atom
  order: number; // 1 = single, 2 = double, 3 = triple
}

/** A conformer frame – ordered list of {x,y,z} matching atom order */
export type ConformerFrame = { x: number; y: number; z: number }[];

/** Complete molecule data for rendering */
export interface MoleculeData {
  atoms: Atom[];
  bonds: Bond[];
  conformers?: ConformerFrame[];
  name?: string;
  smiles?: string;
}

/** Bond change descriptor for reaction animations */
export interface BondChange {
  type: "form" | "break";
  atom1: number; // atom id
  atom2: number; // atom id
  order?: number;
}

/** Reaction data for the reaction animation system */
export interface ReactionData {
  before: MoleculeData;
  after: MoleculeData;
  bondChanges: BondChange[];
  /** Optional transition state geometry */
  transitionState?: MoleculeData;
}

/** Visualization mode selector */
export type VisualizationMode = "ball-stick" | "space-filling" | "wireframe";

/** Animation playback state */
export interface AnimationState {
  isPlaying: boolean;
  speed: number;
  progress: number;       // 0–1
  currentFrame: number;
  totalFrames: number;
}

/** Temperature / vibration configuration */
export interface VibrationConfig {
  enabled: boolean;
  temperature: number;    // Kelvin conceptual
  baseAmplitude: number;  // Angstroms
  frequencyRange: [number, number]; // Hz range
}

/** Video recording state */
export interface RecordingState {
  isRecording: boolean;
  duration: number;       // seconds recorded
  blob: Blob | null;
}

/** Scene configuration */
export interface SceneConfig {
  background: string;
  ambientIntensity: number;
  directionalIntensity: number;
  bloomEnabled: boolean;
  bloomStrength: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  dampingEnabled: boolean;
  showLabels: boolean;
  visualizationMode: VisualizationMode;
}

/** Props for the main MolecularScene component */
export interface MolecularSceneProps {
  /** Molecule to render */
  molecule?: MoleculeData | null;
  /** Reaction to animate */
  reaction?: ReactionData | null;
  /** Visualization mode */
  mode?: VisualizationMode;
  /** Auto rotate */
  autoRotate?: boolean;
  /** Show atom labels */
  showLabels?: boolean;
  /** Temperature for vibration (0 = off) */
  temperature?: number;
  /** Animation speed multiplier */
  animationSpeed?: number;
  /** Whether animation is playing */
  isPlaying?: boolean;
  /** Callback for progress updates */
  onProgressChange?: (progress: number) => void;
  /** Callback when recording state changes */
  onRecordingChange?: (state: RecordingState) => void;
  /** CSS class override */
  className?: string;
  /** Inline style override */
  style?: React.CSSProperties;
  /** Width */
  width?: number | string;
  /** Height */
  height?: number | string;
}
