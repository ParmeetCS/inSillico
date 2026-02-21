/**
 * smiles-to-3d.ts — Client-side SMILES → 3D coordinate generator
 * ================================================================
 * Parses simple SMILES strings into MoleculeData (atoms + bonds + 3D coords)
 * without needing the Python ML backend.
 *
 * This is a lightweight heuristic parser — it supports:
 *   - Organic subset atoms: C, N, O, S, P, F, Cl, Br, I, H
 *   - Single, double, triple bonds
 *   - Branches via ( )
 *   - Ring closures via digits 0-9
 *   - Aromatic lowercase atoms: c, n, o, s
 *   - 3D layout via simple spring-embedding
 *
 * For production accuracy, the Python/RDKit backend is preferred.
 */

import type { MoleculeData, ReactionData, Atom, Bond, ConformerFrame } from "@/components/molecular/types";

// ─── Bond length constants (Angstroms) ─────────────
const BOND_LENGTH = 1.5;

// ─── Parse SMILES into atoms and bonds ─────────────
interface ParsedAtom {
    element: string;
    aromatic: boolean;
}

function parseSmiles(smiles: string): { atoms: ParsedAtom[]; bonds: { a: number; b: number; order: number }[] } {
    const atoms: ParsedAtom[] = [];
    const bonds: { a: number; b: number; order: number }[] = [];
    const stack: number[] = []; // branch stack
    const ringOpens: Map<number, number> = new Map(); // digit → atom index
    let current = -1;
    let nextBondOrder = 1;
    let i = 0;

    while (i < smiles.length) {
        const ch = smiles[i];

        // Branch open
        if (ch === "(") {
            stack.push(current);
            i++;
            continue;
        }

        // Branch close
        if (ch === ")") {
            current = stack.pop() ?? current;
            i++;
            continue;
        }

        // Bond order markers
        if (ch === "=") { nextBondOrder = 2; i++; continue; }
        if (ch === "#") { nextBondOrder = 3; i++; continue; }
        if (ch === "-") { nextBondOrder = 1; i++; continue; }
        if (ch === ":" || ch === "~" || ch === "/" || ch === "\\") { i++; continue; }
        if (ch === ".") { current = -1; i++; continue; } // disconnected

        // Ring closure digit
        if (ch >= "0" && ch <= "9") {
            const digit = parseInt(ch);
            if (ringOpens.has(digit)) {
                const openAtom = ringOpens.get(digit)!;
                ringOpens.delete(digit);
                bonds.push({ a: openAtom, b: current, order: nextBondOrder });
                nextBondOrder = 1;
            } else {
                ringOpens.set(digit, current);
            }
            i++;
            continue;
        }

        // Bracket atom [...]
        if (ch === "[") {
            const close = smiles.indexOf("]", i);
            if (close === -1) { i++; continue; }
            const bracket = smiles.substring(i + 1, close);
            // Extract element from bracket (skip charge, H count, isotope)
            let elem = "";
            let j = 0;
            // Skip isotope digits
            while (j < bracket.length && bracket[j] >= "0" && bracket[j] <= "9") j++;
            if (j < bracket.length) {
                elem += bracket[j].toUpperCase();
                j++;
                if (j < bracket.length && bracket[j] >= "a" && bracket[j] <= "z") {
                    elem += bracket[j];
                }
            }
            if (!elem) elem = "C";

            const idx = atoms.length;
            atoms.push({ element: elem, aromatic: false });
            if (current >= 0) {
                bonds.push({ a: current, b: idx, order: nextBondOrder });
                nextBondOrder = 1;
            }
            current = idx;
            i = close + 1;
            continue;
        }

        // Two-letter elements: Cl, Br
        if (ch === "C" && i + 1 < smiles.length && smiles[i + 1] === "l") {
            const idx = atoms.length;
            atoms.push({ element: "Cl", aromatic: false });
            if (current >= 0) { bonds.push({ a: current, b: idx, order: nextBondOrder }); nextBondOrder = 1; }
            current = idx;
            i += 2;
            continue;
        }
        if (ch === "B" && i + 1 < smiles.length && smiles[i + 1] === "r") {
            const idx = atoms.length;
            atoms.push({ element: "Br", aromatic: false });
            if (current >= 0) { bonds.push({ a: current, b: idx, order: nextBondOrder }); nextBondOrder = 1; }
            current = idx;
            i += 2;
            continue;
        }

        // Organic subset atoms
        const organic = "BCNOPSFIHcnops";
        if (organic.includes(ch)) {
            const isAromatic = ch >= "a" && ch <= "z";
            const element = ch.toUpperCase();
            const idx = atoms.length;
            atoms.push({ element: element === "C" ? "C" : element, aromatic: isAromatic });
            if (current >= 0) {
                const order = (isAromatic && atoms[current]?.aromatic) ? 1 : nextBondOrder;
                bonds.push({ a: current, b: idx, order });
                nextBondOrder = 1;
            }
            current = idx;
            i++;
            continue;
        }

        // Skip unknown chars
        i++;
    }

    return { atoms, bonds };
}

// ─── Add implicit hydrogens ─────────────
function addHydrogens(
    atoms: ParsedAtom[],
    bonds: { a: number; b: number; order: number }[]
): { atoms: ParsedAtom[]; bonds: { a: number; b: number; order: number }[] } {
    // Compute valence for each atom
    const valence = new Array(atoms.length).fill(0);
    for (const b of bonds) {
        valence[b.a] += b.order;
        valence[b.b] += b.order;
    }

    const maxValence: Record<string, number> = {
        C: 4, N: 3, O: 2, S: 2, P: 3, F: 1, Cl: 1, Br: 1, I: 1, B: 3, H: 1,
    };

    const newAtoms = [...atoms];
    const newBonds = [...bonds];

    for (let i = 0; i < atoms.length; i++) {
        const elem = atoms[i].element;
        const maxV = maxValence[elem] ?? 4;
        // For aromatic atoms, add one less H
        const aromaAdj = atoms[i].aromatic ? 1 : 0;
        const hCount = Math.max(0, maxV - valence[i] - aromaAdj);

        for (let h = 0; h < hCount; h++) {
            const hIdx = newAtoms.length;
            newAtoms.push({ element: "H", aromatic: false });
            newBonds.push({ a: i, b: hIdx, order: 1 });
        }
    }

    return { atoms: newAtoms, bonds: newBonds };
}

// ─── 3D coordinate generation (force-directed layout) ─────────────
function generate3DCoords(
    atomCount: number,
    bonds: { a: number; b: number; order: number }[]
): { x: number; y: number; z: number }[] {
    // Initialize positions randomly on a sphere
    const pos: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < atomCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 1.5 + Math.random() * 2;
        pos.push({
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi),
        });
    }

    // Build adjacency for quick lookup
    const adj = new Set<string>();
    for (const b of bonds) {
        adj.add(`${b.a}-${b.b}`);
        adj.add(`${b.b}-${b.a}`);
    }

    // Force-directed iterations
    const iterations = 200;
    const idealDist = BOND_LENGTH;
    const repulsionStrength = 2.0;
    const attractionStrength = 0.5;
    const dt = 0.05;

    for (let iter = 0; iter < iterations; iter++) {
        const forces: { x: number; y: number; z: number }[] = pos.map(() => ({ x: 0, y: 0, z: 0 }));
        const cooling = 1 - iter / iterations;

        // Repulsion between all atom pairs
        for (let i = 0; i < atomCount; i++) {
            for (let j = i + 1; j < atomCount; j++) {
                const dx = pos[j].x - pos[i].x;
                const dy = pos[j].y - pos[i].y;
                const dz = pos[j].z - pos[i].z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
                const force = repulsionStrength / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                const fz = (dz / dist) * force;
                forces[i].x -= fx; forces[i].y -= fy; forces[i].z -= fz;
                forces[j].x += fx; forces[j].y += fy; forces[j].z += fz;
            }
        }

        // Attraction along bonds
        for (const b of bonds) {
            const dx = pos[b.b].x - pos[b.a].x;
            const dy = pos[b.b].y - pos[b.a].y;
            const dz = pos[b.b].z - pos[b.a].z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
            const force = attractionStrength * (dist - idealDist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            const fz = (dz / dist) * force;
            forces[b.a].x += fx; forces[b.a].y += fy; forces[b.a].z += fz;
            forces[b.b].x -= fx; forces[b.b].y -= fy; forces[b.b].z -= fz;
        }

        // Apply forces
        for (let i = 0; i < atomCount; i++) {
            pos[i].x += forces[i].x * dt * cooling;
            pos[i].y += forces[i].y * dt * cooling;
            pos[i].z += forces[i].z * dt * cooling;
        }
    }

    // Center the molecule
    let cx = 0, cy = 0, cz = 0;
    for (const p of pos) { cx += p.x; cy += p.y; cz += p.z; }
    cx /= atomCount; cy /= atomCount; cz /= atomCount;
    for (const p of pos) { p.x -= cx; p.y -= cy; p.z -= cz; }

    return pos;
}

// ─── Generate conformer frames (slight variations) ─────────────
function generateConformers(
    baseCoords: { x: number; y: number; z: number }[],
    count: number = 3
): ConformerFrame[] {
    const frames: ConformerFrame[] = [baseCoords.map(p => ({ ...p }))];

    for (let c = 1; c < count; c++) {
        const frame = baseCoords.map(p => ({
            x: p.x + (Math.random() - 0.5) * 0.3,
            y: p.y + (Math.random() - 0.5) * 0.3,
            z: p.z + (Math.random() - 0.5) * 0.3,
        }));
        frames.push(frame);
    }

    return frames;
}

// ═══════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════

/**
 * Generate 3D molecule data from a SMILES string.
 * Runs entirely client-side — no backend needed.
 */
export function smilesToMoleculeData(smiles: string): MoleculeData {
    const parsed = parseSmiles(smiles);
    const { atoms: allAtoms, bonds: allBonds } = addHydrogens(parsed.atoms, parsed.bonds);

    const coords = generate3DCoords(allAtoms.length, allBonds);

    const atoms: Atom[] = allAtoms.map((a, i) => ({
        id: i,
        element: a.element,
        x: coords[i].x,
        y: coords[i].y,
        z: coords[i].z,
    }));

    const bonds: Bond[] = allBonds.map(b => ({
        atom1: b.a,
        atom2: b.b,
        order: b.order,
    }));

    const conformers = generateConformers(coords, 3);

    return { atoms, bonds, conformers, smiles, name: smiles };
}

/**
 * Generate reaction data from reactant and product SMILES.
 * Runs entirely client-side.
 * Aligns before/after geometries and pads atom counts for smooth morphing.
 */
export function smilesToReactionData(
    reactantSmiles: string,
    productSmiles: string,
    bondChanges: { type: "form" | "break"; atom1: number; atom2: number }[] = []
): ReactionData {
    const before = smilesToMoleculeData(reactantSmiles);
    const after = smilesToMoleculeData(productSmiles);

    // ── Align the product geometry to the reactant ──────────────────────
    // Center both molecules at origin
    const centerOf = (atoms: Atom[]) => {
        let cx = 0, cy = 0, cz = 0;
        for (const a of atoms) { cx += a.x; cy += a.y; cz += a.z; }
        const n = atoms.length || 1;
        return { x: cx / n, y: cy / n, z: cz / n };
    };

    const cBefore = centerOf(before.atoms);
    const cAfter = centerOf(after.atoms);

    // Shift both to a common origin
    for (const a of before.atoms) {
        a.x -= cBefore.x; a.y -= cBefore.y; a.z -= cBefore.z;
    }
    for (const a of after.atoms) {
        a.x -= cAfter.x; a.y -= cAfter.y; a.z -= cAfter.z;
    }

    // Scale product to match reactant's bounding radius for visual consistency
    const radiusOf = (atoms: Atom[]) => {
        let maxR = 0;
        for (const a of atoms) {
            const r = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
            if (r > maxR) maxR = r;
        }
        return maxR || 1;
    };

    const rBefore = radiusOf(before.atoms);
    const rAfter = radiusOf(after.atoms);
    if (rAfter > 0.01) {
        const scaleFactor = rBefore / rAfter;
        // Only scale if appreciably different (>20% mismatch)
        if (Math.abs(scaleFactor - 1) > 0.2) {
            const blend = 0.5 + 0.5 * scaleFactor; // partial scale toward reactant size
            for (const a of after.atoms) {
                a.x *= blend; a.y *= blend; a.z *= blend;
            }
        }
    }

    // ── Pad shorter atom list so both have equal length ─────────────────
    // Extra atoms are placed at center (scale 0) so they smoothly appear/disappear
    const maxAtoms = Math.max(before.atoms.length, after.atoms.length);

    while (before.atoms.length < maxAtoms) {
        const idx = before.atoms.length;
        // Place ghost atoms near the center of the molecule
        const nearestAfter = after.atoms[idx] || after.atoms[after.atoms.length - 1];
        before.atoms.push({
            id: idx,
            element: nearestAfter?.element ?? "H",
            x: 0, y: 0, z: 0,
        });
    }

    while (after.atoms.length < maxAtoms) {
        const idx = after.atoms.length;
        const nearestBefore = before.atoms[idx] || before.atoms[before.atoms.length - 1];
        after.atoms.push({
            id: idx,
            element: nearestBefore?.element ?? "H",
            x: 0, y: 0, z: 0,
        });
    }

    // Ensure atom IDs are sequential
    for (let i = 0; i < before.atoms.length; i++) before.atoms[i].id = i;
    for (let i = 0; i < after.atoms.length; i++) after.atoms[i].id = i;

    // Update conformers for before molecule (used for camera fitting)
    if (before.conformers) {
        while (before.conformers[0] && before.conformers[0].length < maxAtoms) {
            before.conformers[0].push({ x: 0, y: 0, z: 0 });
        }
    }

    // ── Generate transition state as a perturbed midpoint ───────────────
    const tsAtoms: Atom[] = [];
    for (let i = 0; i < maxAtoms; i++) {
        const a = before.atoms[i];
        const b = after.atoms[i];
        tsAtoms.push({
            id: i,
            element: a.element,
            x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 0.3,
            y: (a.y + b.y) / 2 + (Math.random() - 0.5) * 0.3,
            z: (a.z + b.z) / 2 + (Math.random() - 0.5) * 0.3,
        });
    }

    const transitionState: MoleculeData = {
        atoms: tsAtoms,
        bonds: [...before.bonds],
        smiles: `${reactantSmiles} → ${productSmiles}`,
    };

    return {
        before,
        after,
        bondChanges: bondChanges.map(bc => ({ ...bc, order: 1 })),
        transitionState,
    };
}
