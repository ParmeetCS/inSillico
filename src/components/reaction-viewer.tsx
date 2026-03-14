"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface Atom {
    element: string;
    position: THREE.Vector3;
    color: number;
    radius: number;
}

interface Bond {
    from: number;
    to: number;
    order: number;
}

interface Molecule {
    atoms: Atom[];
    bonds: Bond[];
    name: string;
}

interface ReactionViewerProps {
    reactants: Molecule[];
    products: Molecule[];
    isPlaying: boolean;
    animationSpeed: number;
    visualizationMode: "ball-stick" | "space-filling" | "pathway";
    showTransition: boolean;
    onProgressUpdate?: (progress: number) => void;
}

const atomColors: Record<string, number> = {
    H: 0xffffff, // White
    C: 0x808080, // Gray
    N: 0x3b82f6, // Blue
    O: 0xef4444, // Red
    S: 0xfbbf24, // Yellow
    P: 0x8b5cf6, // Purple
    Cl: 0x10b981, // Green
    Br: 0xa52a2a, // Brown
    F: 0x06b6d4, // Cyan
    I: 0x6b21a8, // Dark purple
};

const atomRadii: Record<string, number> = {
    H: 0.35,
    C: 0.77,
    N: 0.70,
    O: 0.66,
    S: 1.04,
    P: 1.07,
    Cl: 0.99,
    Br: 1.14,
    F: 0.57,
    I: 1.33,
};

export default function ReactionViewer({
    reactants,
    products,
    isPlaying,
    animationSpeed,
    visualizationMode,
    showTransition,
    onProgressUpdate,
}: ReactionViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0f1e);
        sceneRef.current = scene;

        // Camera setup
        const w = containerRef.current.clientWidth || 1;
        const h = containerRef.current.clientHeight || 1;
        const camera = new THREE.PerspectiveCamera(
            60,
            w / h,
            0.1,
            1000
        );
        camera.position.z = 10;
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(5, 5, 5);
        scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-5, -5, -5);
        scene.add(directionalLight2);

        // Handle resize
        const handleResize = () => {
            if (!containerRef.current || !camera || !renderer) return;
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        window.addEventListener("resize", handleResize);

        // Animation loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            if (controls) controls.update();
            if (renderer && scene && camera) renderer.render(scene, camera);
        };
        animate();

        // Cleanup
        return () => {
            window.removeEventListener("resize", handleResize);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    // Create or update molecules
    useEffect(() => {
        if (!sceneRef.current) return;

        // Clear existing molecules
        const scene = sceneRef.current;
        while (scene.children.length > 3) {
            // Keep lights
            scene.remove(scene.children[3]);
        }

        // Position molecules
        const spacing = 6;
        const totalMolecules = reactants.length + (showTransition ? 1 : 0) + products.length;
        const startX = -(totalMolecules - 1) * spacing / 2;

        let currentX = startX;

        // Add reactants
        reactants.forEach((molecule, index) => {
            const moleculeGroup = createMoleculeGroup(molecule, visualizationMode);
            moleculeGroup.position.x = currentX;
            scene.add(moleculeGroup);
            currentX += spacing;
        });

        // Add transition state if enabled
        if (showTransition) {
            const transitionGroup = createTransitionState();
            transitionGroup.position.x = currentX;
            scene.add(transitionGroup);
            currentX += spacing;
        }

        // Add products
        products.forEach((molecule, index) => {
            const moleculeGroup = createMoleculeGroup(molecule, visualizationMode);
            moleculeGroup.position.x = currentX;
            scene.add(moleculeGroup);
            currentX += spacing;
        });
    }, [reactants, products, visualizationMode, showTransition]);

    // Handle animation
    useEffect(() => {
        if (!isPlaying) return;

        const interval = setInterval(() => {
            setProgress((prev) => {
                const newProgress = prev + 0.5 * animationSpeed;
                if (newProgress >= 100) return 0;
                return newProgress;
            });
        }, 50);

        return () => clearInterval(interval);
    }, [isPlaying, animationSpeed]);

    // Notify parent of progress changes outside of render
    useEffect(() => {
        if (onProgressUpdate) onProgressUpdate(progress);
    }, [progress, onProgressUpdate]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height: "100%",
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
            }}
        />
    );
}

function createMoleculeGroup(molecule: Molecule, mode: string): THREE.Group {
    const group = new THREE.Group();

    // Create atoms
    molecule.atoms.forEach((atom, index) => {
        const radius = mode === "space-filling" ? atomRadii[atom.element] * 2 : atomRadii[atom.element];
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: atom.color,
            metalness: 0.3,
            roughness: 0.4,
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(atom.position);
        group.add(sphere);

        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(radius * 1.2, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: atom.color,
            transparent: true,
            opacity: 0.2,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(atom.position);
        group.add(glow);
    });

    // Create bonds (if not space-filling mode)
    if (mode !== "space-filling") {
        molecule.bonds.forEach((bond) => {
            const fromAtom = molecule.atoms[bond.from];
            const toAtom = molecule.atoms[bond.to];

            const direction = new THREE.Vector3()
                .subVectors(toAtom.position, fromAtom.position);
            const length = direction.length();
            direction.normalize();

            const bondGeometry = new THREE.CylinderGeometry(0.15, 0.15, length, 8);
            const bondMaterial = new THREE.MeshStandardMaterial({
                color: 0x888888,
                metalness: 0.5,
                roughness: 0.5,
            });

            for (let i = 0; i < bond.order; i++) {
                const bondMesh = new THREE.Mesh(bondGeometry, bondMaterial);
                bondMesh.position.copy(fromAtom.position);
                bondMesh.position.lerp(toAtom.position, 0.5);

                // Offset multiple bonds
                if (bond.order > 1) {
                    const offset = (i - (bond.order - 1) / 2) * 0.2;
                    bondMesh.position.x += offset;
                }

                bondMesh.lookAt(toAtom.position);
                bondMesh.rotateX(Math.PI / 2);
                group.add(bondMesh);
            }
        });
    }

    return group;
}

function createTransitionState(): THREE.Group {
    const group = new THREE.Group();

    // Create a visual representation of transition state
    const geometry = new THREE.TorusGeometry(1.5, 0.3, 16, 100);
    const material = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.3,
    });
    const torus = new THREE.Mesh(geometry, material);
    group.add(torus);

    // Add pulsing animation
    const scale = Math.sin(Date.now() * 0.003) * 0.1 + 1;
    torus.scale.set(scale, scale, scale);

    return group;
}

// Helper function to parse simple SMILES and create basic molecule structure
export function parseSMILESToMolecule(smiles: string, name: string): Molecule {
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];

    // --- Known molecules ---
    if (smiles === "[H][H]" || smiles === "HH") {
        atoms.push(
            { element: "H", position: new THREE.Vector3(-0.5, 0, 0), color: atomColors.H, radius: atomRadii.H },
            { element: "H", position: new THREE.Vector3(0.5, 0, 0), color: atomColors.H, radius: atomRadii.H }
        );
        bonds.push({ from: 0, to: 1, order: 1 });
        return { atoms, bonds, name };
    }
    if (smiles === "O=O") {
        atoms.push(
            { element: "O", position: new THREE.Vector3(-0.6, 0, 0), color: atomColors.O, radius: atomRadii.O },
            { element: "O", position: new THREE.Vector3(0.6, 0, 0), color: atomColors.O, radius: atomRadii.O }
        );
        bonds.push({ from: 0, to: 1, order: 2 });
        return { atoms, bonds, name };
    }
    if (smiles === "O" || smiles === "[H]O[H]") {
        atoms.push(
            { element: "O", position: new THREE.Vector3(0, 0, 0), color: atomColors.O, radius: atomRadii.O },
            { element: "H", position: new THREE.Vector3(-0.8, 0.6, 0), color: atomColors.H, radius: atomRadii.H },
            { element: "H", position: new THREE.Vector3(0.8, 0.6, 0), color: atomColors.H, radius: atomRadii.H }
        );
        bonds.push({ from: 0, to: 1, order: 1 }, { from: 0, to: 2, order: 1 });
        return { atoms, bonds, name };
    }
    if (smiles === "O=C=O" || smiles === "CO2") {
        atoms.push(
            { element: "O", position: new THREE.Vector3(-1.2, 0, 0), color: atomColors.O, radius: atomRadii.O },
            { element: "C", position: new THREE.Vector3(0, 0, 0), color: atomColors.C, radius: atomRadii.C },
            { element: "O", position: new THREE.Vector3(1.2, 0, 0), color: atomColors.O, radius: atomRadii.O }
        );
        bonds.push({ from: 0, to: 1, order: 2 }, { from: 1, to: 2, order: 2 });
        return { atoms, bonds, name };
    }
    if (smiles === "[OH-]") {
        atoms.push(
            { element: "O", position: new THREE.Vector3(0, 0, 0), color: atomColors.O, radius: atomRadii.O },
            { element: "H", position: new THREE.Vector3(0.8, 0, 0), color: atomColors.H, radius: atomRadii.H }
        );
        bonds.push({ from: 0, to: 1, order: 1 });
        return { atoms, bonds, name };
    }

    // --- General SMILES parser for organic molecules ---
    // Tokenize: extract heavy atoms (Cl, Br, C, N, O, S, P, F) and bond symbols
    const tokens: { element: string; bondOrder: number }[] = [];
    let i = 0;
    let nextBond = 1;
    while (i < smiles.length) {
        const ch = smiles[i];
        // Handle bond order symbols
        if (ch === "=") { nextBond = 2; i++; continue; }
        if (ch === "#") { nextBond = 3; i++; continue; }
        // Skip branches, charges, ring digits, stereochemistry
        if ("()[]@+-.0123456789/\\%{}".includes(ch)) {
            i++;
            continue;
        }
        // Two-letter elements
        if (i + 1 < smiles.length) {
            const two = smiles.slice(i, i + 2);
            if (two === "Cl" || two === "Br") {
                tokens.push({ element: two, bondOrder: nextBond });
                nextBond = 1;
                i += 2;
                continue;
            }
        }
        // Single-letter heavy atoms (uppercase)
        if (/[A-Z]/.test(ch)) {
            // Check for lowercase after (like 'c' aromatic) - treat uppercase as element
            const el = ch;
            tokens.push({ element: el, bondOrder: nextBond });
            nextBond = 1;
            i++;
            continue;
        }
        // Aromatic lowercase atoms (c, n, o, s)
        if (/[cnos]/.test(ch)) {
            tokens.push({ element: ch.toUpperCase(), bondOrder: nextBond });
            nextBond = 1;
            i++;
            continue;
        }
        i++;
    }

    if (tokens.length === 0) {
        atoms.push({ element: "C", position: new THREE.Vector3(0, 0, 0), color: atomColors.C, radius: atomRadii.C });
        return { atoms, bonds, name };
    }

    // Lay atoms out in a zigzag chain with proper 3D coordinates
    const bondLen = 1.5;
    const zigAngle = Math.PI / 6; // 30° zigzag
    tokens.forEach((tok, idx) => {
        let x: number, y: number, z: number;
        if (tokens.length <= 3) {
            // Small molecules: spread linearly
            x = (idx - (tokens.length - 1) / 2) * bondLen;
            y = 0;
            z = 0;
        } else {
            // Larger molecules: zigzag layout in the xy plane
            x = idx * bondLen * Math.cos(zigAngle);
            y = (idx % 2 === 0 ? 0.5 : -0.5) * bondLen * Math.sin(zigAngle + 0.3);
            z = (idx % 3 === 0 ? 0.3 : idx % 3 === 1 ? -0.2 : 0) * 0.5; // slight depth
        }
        // Center the molecule
        const cx = ((tokens.length - 1) * bondLen * Math.cos(zigAngle)) / 2;
        x -= cx;

        const el = tok.element;
        atoms.push({
            element: el,
            position: new THREE.Vector3(x, y, z),
            color: atomColors[el] ?? 0x94a3b8,
            radius: atomRadii[el] ?? 0.6,
        });

        if (idx > 0) {
            bonds.push({ from: idx - 1, to: idx, order: tok.bondOrder });
        }
    });

    return { atoms, bonds, name };
}
