// =============================================================================
// MolecularScene – Main React component wrapping the Three.js engine
// Orchestrates atoms, bonds, conformers, reactions, vibration, and video
// =============================================================================

"use client";

import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

import type { MolecularSceneProps, MoleculeData, ReactionData, VisualizationMode } from "./types";
import { AtomMeshManager } from "./AtomMesh";
import { BondMeshManager } from "./BondMesh";
import { ConformerAnimator } from "./ConformerAnimator";
import { ReactionAnimator } from "./ReactionAnimator";
import { VibrationEngine } from "./VibrationEngine";
import { VideoRecorder } from "./VideoRecorder";
import {
  DEFAULT_BACKGROUND,
  AMBIENT_INTENSITY,
  DIRECTIONAL_INTENSITY,
} from "./constants";

/** Public API exposed through ref */
export interface MolecularSceneHandle {
  /** Start video recording */
  startRecording: (onComplete?: (blob: Blob) => void) => void;
  /** Stop video recording */
  stopRecording: () => void;
  /** Download last recording */
  downloadRecording: (blob: Blob) => void;
  /** Reset camera to default position */
  resetCamera: () => void;
  /** Take a screenshot */
  takeScreenshot: () => string | null;
  /** Play the reaction animation */
  playReaction: () => void;
  /** Pause the reaction animation */
  pauseReaction: () => void;
  /** Reset the reaction animation */
  resetReaction: () => void;
  /** Seek reaction to progress (0–1) */
  seekReaction: (p: number) => void;
  /** Get underlying canvas element */
  getCanvas: () => HTMLCanvasElement | null;
}

const MolecularScene = forwardRef<MolecularSceneHandle, MolecularSceneProps>(
  function MolecularScene(props, ref) {
    const {
      molecule,
      reaction,
      mode = "ball-stick",
      autoRotate = false,
      showLabels = false,
      temperature = 0,
      animationSpeed = 1.0,
      isPlaying = false,
      onProgressChange,
      onRecordingChange,
      className,
      style,
      width = "100%",
      height = 400,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Three.js core
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const composerRef = useRef<EffectComposer | null>(null);

    // Engine modules
    const atomMgrRef = useRef<AtomMeshManager | null>(null);
    const bondMgrRef = useRef<BondMeshManager | null>(null);
    const conformerAnimRef = useRef<ConformerAnimator | null>(null);
    const reactionAnimRef = useRef<ReactionAnimator | null>(null);
    const vibrationRef = useRef<VibrationEngine | null>(null);
    const videoRecRef = useRef<VideoRecorder | null>(null);

    // Animation frame
    const rafRef = useRef<number>(0);
    const clockRef = useRef<THREE.Clock>(new THREE.Clock());

    // ---- Initialize Three.js scene ----
    useEffect(() => {
      if (!containerRef.current) return;

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true, // needed for video export + screenshot
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(DEFAULT_BACKGROUND);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      container.appendChild(renderer.domElement);
      canvasRef.current = renderer.domElement;
      rendererRef.current = renderer;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(DEFAULT_BACKGROUND);
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
      camera.position.set(0, 0, 15);
      cameraRef.current = camera;

      // Lights
      const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_INTENSITY);
      directional.position.set(5, 10, 7);
      directional.castShadow = true;
      scene.add(directional);

      const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
      fillLight.position.set(-5, -3, -5);
      scene.add(fillLight);

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 1.0;
      controls.minDistance = 3;
      controls.maxDistance = 100;
      controlsRef.current = controls;

      // Post-processing (bloom)
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.3,   // strength
        0.4,   // radius
        0.85   // threshold
      );
      composer.addPass(bloom);
      composerRef.current = composer;

      // Engine modules
      atomMgrRef.current = new AtomMeshManager(scene);
      bondMgrRef.current = new BondMeshManager(scene);
      conformerAnimRef.current = new ConformerAnimator();
      reactionAnimRef.current = new ReactionAnimator(atomMgrRef.current, bondMgrRef.current);
      vibrationRef.current = new VibrationEngine();
      videoRecRef.current = new VideoRecorder();
      videoRecRef.current.setCanvas(renderer.domElement);

      // Clock
      clockRef.current = new THREE.Clock();

      // Resize observer
      const observer = new ResizeObserver(() => {
        if (!containerRef.current || !renderer || !camera || !composer) return;
        const nw = containerRef.current.clientWidth;
        const nh = containerRef.current.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
        composer.setSize(nw, nh);
      });
      observer.observe(container);

      // Animation loop
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const now = performance.now();
        const elapsed = clockRef.current.getElapsedTime();

        // Update controls
        controls.update();

        // Conformer animation
        if (conformerAnimRef.current?.hasAnimation()) {
          const frame = conformerAnimRef.current.update(now);
          if (frame && atomMgrRef.current) {
            atomMgrRef.current.updatePositions(frame);
            // Update bonds too
            if (bondMgrRef.current && molecule) {
              const updatedAtoms = molecule.atoms.map((a, i) => ({
                ...a,
                x: frame[i]?.x ?? a.x,
                y: frame[i]?.y ?? a.y,
                z: frame[i]?.z ?? a.z,
              }));
              bondMgrRef.current.updateFromAtoms(updatedAtoms);
            }
            onProgressChange?.(conformerAnimRef.current.getProgress());
          }
        }

        // Reaction animation
        if (reactionAnimRef.current) {
          const updated = reactionAnimRef.current.update(now);
          if (updated) {
            onProgressChange?.(reactionAnimRef.current.getProgress());
          }
        }

        // Vibration
        if (vibrationRef.current?.isEnabled() && atomMgrRef.current) {
          const offsets = vibrationRef.current.getOffsets(elapsed);
          if (offsets.length > 0) {
            atomMgrRef.current.applyVibration(offsets);
          }
        }

        // Render with post-processing
        composer.render();
      };
      animate();

      // Cleanup
      return () => {
        cancelAnimationFrame(rafRef.current);
        observer.disconnect();
        controls.dispose();
        atomMgrRef.current?.dispose();
        bondMgrRef.current?.dispose();
        videoRecRef.current?.dispose();
        renderer.dispose();
        composer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Molecule data updates ----
    useEffect(() => {
      if (!atomMgrRef.current || !bondMgrRef.current) return;
      if (!molecule) {
        atomMgrRef.current.setAtoms([]);
        bondMgrRef.current.setBonds([], []);
        return;
      }

      atomMgrRef.current.setAtoms(molecule.atoms, mode);
      bondMgrRef.current.setBonds(molecule.atoms, molecule.bonds, mode);

      // Conformers
      if (molecule.conformers && molecule.conformers.length >= 2 && conformerAnimRef.current) {
        conformerAnimRef.current.setConformers(molecule.conformers);
      }

      // Vibration
      if (vibrationRef.current) {
        vibrationRef.current.init(molecule.atoms.length);
      }

      // Auto-fit camera
      fitCamera(molecule.atoms);
    }, [molecule, mode]);

    // ---- Reaction data updates ----
    useEffect(() => {
      if (!reaction || !reactionAnimRef.current) return;
      reactionAnimRef.current.setReaction(reaction);
      reactionAnimRef.current.setLooping(true);
    }, [reaction]);

    // ---- Playing state ----
    useEffect(() => {
      if (conformerAnimRef.current?.hasAnimation()) {
        if (isPlaying) conformerAnimRef.current.play();
        else conformerAnimRef.current.pause();
      }
    }, [isPlaying]);

    // ---- Animation speed ----
    useEffect(() => {
      conformerAnimRef.current?.setSpeed(animationSpeed);
      reactionAnimRef.current?.setSpeed(animationSpeed);
    }, [animationSpeed]);

    // ---- Auto-rotate ----
    useEffect(() => {
      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate;
        controlsRef.current.autoRotateSpeed = 2.0;
      }
    }, [autoRotate]);

    // ---- Temperature / vibration ----
    useEffect(() => {
      if (!vibrationRef.current) return;
      if (temperature > 0) {
        vibrationRef.current.setTemperature(temperature);
        vibrationRef.current.enable();
      } else {
        vibrationRef.current.disable();
      }
    }, [temperature]);

    // ---- Visualization mode ----
    useEffect(() => {
      atomMgrRef.current?.setMode(mode);
      bondMgrRef.current?.setMode(mode);
    }, [mode]);

    // ---- Camera fitting ----
    const fitCamera = useCallback(
      (atoms: { x: number; y: number; z: number }[]) => {
        if (!cameraRef.current || !controlsRef.current || atoms.length === 0) return;
        const center = new THREE.Vector3();
        let maxR = 0;
        for (const a of atoms) {
          center.add(new THREE.Vector3(a.x, a.y, a.z));
        }
        center.divideScalar(atoms.length);
        for (const a of atoms) {
          const d = new THREE.Vector3(a.x, a.y, a.z).distanceTo(center);
          if (d > maxR) maxR = d;
        }
        const dist = Math.max(maxR * 2.5, 8);
        cameraRef.current.position.set(center.x, center.y, center.z + dist);
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      },
      []
    );

    // ---- Imperative handle (ref API) ----
    useImperativeHandle(
      ref,
      () => ({
        startRecording: (onComplete) => {
          videoRecRef.current?.start((blob) => {
            onComplete?.(blob);
            onRecordingChange?.({ isRecording: false, duration: 0, blob });
          });
          onRecordingChange?.({ isRecording: true, duration: 0, blob: null });
        },
        stopRecording: () => {
          videoRecRef.current?.stop();
        },
        downloadRecording: (blob: Blob) => {
          VideoRecorder.download(blob);
        },
        resetCamera: () => {
          if (molecule) fitCamera(molecule.atoms);
          else if (reaction) fitCamera(reaction.before.atoms);
        },
        takeScreenshot: () => {
          if (!rendererRef.current) return null;
          return rendererRef.current.domElement.toDataURL("image/png");
        },
        playReaction: () => {
          reactionAnimRef.current?.play();
        },
        pauseReaction: () => {
          reactionAnimRef.current?.pause();
        },
        resetReaction: () => {
          reactionAnimRef.current?.reset();
        },
        seekReaction: (p: number) => {
          reactionAnimRef.current?.seek(p);
        },
        getCanvas: () => canvasRef.current,
      }),
      [molecule, reaction, fitCamera, onRecordingChange]
    );

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width,
          height,
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          ...style,
        }}
      />
    );
  }
);

export default MolecularScene;
