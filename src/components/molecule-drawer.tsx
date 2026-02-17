"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
    MousePointer2, Eraser, Hexagon, Trash2, Maximize2, Pencil,
} from "lucide-react";

/* ───────── Types ───────── */
interface DrawAtom { id: string; symbol: string; x: number; y: number; }
interface DrawBond { id: string; from: string; to: string; order: 1 | 2 | 3; }
type DrawTool = "select" | "erase" | "bond-single" | "bond-double" | "ring" | "chain";

interface Props {
    onSmilesChange?: (smiles: string) => void;
    onFormulaChange?: (formula: string) => void;
    onMWChange?: (mw: number) => void;
}

/* ───────── Constants ───────── */
const BOND_LEN = 56;
const HIT_R = 18;
const ATOM_R = 14;

const COLORS: Record<string, string> = {
    C: "#cbd5e1", N: "#3b82f6", O: "#ef4444", S: "#eab308", P: "#f97316",
    F: "#10b981", Cl: "#10b981", Br: "#a16207", I: "#8b5cf6", H: "#ffffff",
};
const MASSES: Record<string, number> = {
    H: 1.008, C: 12.011, N: 14.007, O: 15.999, S: 32.06, P: 30.974,
    F: 18.998, Cl: 35.45, Br: 79.904, I: 126.904,
};
const VALENCES: Record<string, number> = {
    H: 1, C: 4, N: 3, O: 2, S: 2, P: 3, F: 1, Cl: 1, Br: 1, I: 1,
};
const ELEMENTS = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"];

let _nid = 1;
const gid = () => `n${_nid++}`;

/* ───────── Chemistry helpers ───────── */
function bondCount(atomId: string, bonds: DrawBond[]) {
    let c = 0;
    for (const b of bonds) {
        if (b.from === atomId || b.to === atomId) c += b.order;
    }
    return c;
}

function implicitH(atom: DrawAtom, bonds: DrawBond[]) {
    const v = VALENCES[atom.symbol] ?? 4;
    return Math.max(0, v - bondCount(atom.id, bonds));
}

function calcFormula(atoms: DrawAtom[], bonds: DrawBond[]): string {
    if (!atoms.length) return "";
    const counts: Record<string, number> = {};
    for (const a of atoms) counts[a.symbol] = (counts[a.symbol] || 0) + 1;
    let hTotal = 0;
    for (const a of atoms) hTotal += implicitH(a, bonds);
    if (hTotal > 0) counts["H"] = (counts["H"] || 0) + hTotal;
    let f = "";
    if (counts["C"]) { f += "C" + (counts["C"] > 1 ? counts["C"] : ""); delete counts["C"]; }
    if (counts["H"]) { f += "H" + (counts["H"] > 1 ? counts["H"] : ""); delete counts["H"]; }
    for (const el of Object.keys(counts).sort()) f += el + (counts[el] > 1 ? counts[el] : "");
    return f;
}

function calcMW(atoms: DrawAtom[], bonds: DrawBond[]): number {
    let mw = 0;
    for (const a of atoms) mw += MASSES[a.symbol] ?? 12;
    for (const a of atoms) mw += implicitH(a, bonds) * MASSES["H"];
    return Math.round(mw * 100) / 100;
}

function isValid(atoms: DrawAtom[], bonds: DrawBond[]): boolean {
    if (!atoms.length) return false;
    for (const a of atoms) {
        if (bondCount(a.id, bonds) > (VALENCES[a.symbol] ?? 4)) return false;
    }
    return true;
}

function generateSmiles(atoms: DrawAtom[], bonds: DrawBond[]): string {
    if (!atoms.length) return "";
    const adj = new Map<string, { to: string; order: number; bid: string }[]>();
    for (const a of atoms) adj.set(a.id, []);
    for (const b of bonds) {
        adj.get(b.from)!.push({ to: b.to, order: b.order, bid: b.id });
        adj.get(b.to)!.push({ to: b.from, order: b.order, bid: b.id });
    }
    // Find back edges (ring closures)
    const visited = new Set<string>();
    const treeEdges = new Set<string>();
    const backEdges = new Set<string>();
    function findRings(id: string, parentBid: string | null) {
        visited.add(id);
        for (const e of adj.get(id)!) {
            if (e.bid === parentBid) continue;
            if (visited.has(e.to)) { backEdges.add(e.bid); }
            else { treeEdges.add(e.bid); findRings(e.to, e.bid); }
        }
    }
    findRings(atoms[0].id, null);

    // Assign ring numbers and map to atoms
    let rn = 1;
    const ringNums = new Map<string, number>();
    const atomRings = new Map<string, { num: number; order: number }[]>();
    for (const bid of backEdges) {
        const b = bonds.find(x => x.id === bid)!;
        ringNums.set(bid, rn);
        for (const aid of [b.from, b.to]) {
            if (!atomRings.has(aid)) atomRings.set(aid, []);
            atomRings.get(aid)!.push({ num: rn, order: b.order });
        }
        rn++;
    }

    const sVisited = new Set<string>();
    const bondShown = new Set<number>();
    function dfs(id: string, fromBid: string | null): string {
        sVisited.add(id);
        const a = atoms.find(x => x.id === id)!;
        const organic = ["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"];
        let s = organic.includes(a.symbol) ? a.symbol : `[${a.symbol}]`;
        // Ring closures at this atom
        for (const rc of atomRings.get(id) || []) {
            if (!bondShown.has(rc.num) && rc.order === 2) s += "=";
            if (!bondShown.has(rc.num) && rc.order === 3) s += "#";
            bondShown.add(rc.num);
            s += rc.num >= 10 ? `%${rc.num}` : `${rc.num}`;
        }
        // Tree branches
        const branches: string[] = [];
        for (const e of adj.get(id)!) {
            if (e.bid === fromBid || sVisited.has(e.to) || backEdges.has(e.bid)) continue;
            const bs = e.order === 2 ? "=" : e.order === 3 ? "#" : "";
            branches.push(bs + dfs(e.to, e.bid));
        }
        if (branches.length <= 1) return s + (branches[0] || "");
        const main = branches.pop()!;
        for (const br of branches) s += `(${br})`;
        return s + main;
    }

    // Handle disconnected fragments
    const parts: string[] = [];
    for (const a of atoms) {
        if (!sVisited.has(a.id)) parts.push(dfs(a.id, null));
    }
    return parts.join(".");
}

/* ───────── Component ───────── */
export default function MoleculeDrawer({ onSmilesChange, onFormulaChange, onMWChange }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [atoms, setAtoms] = useState<DrawAtom[]>([]);
    const [bonds, setBonds] = useState<DrawBond[]>([]);
    const [tool, setTool] = useState<DrawTool>("bond-single");
    const [element, setElement] = useState("C");
    const [bondStart, setBondStart] = useState<string | null>(null);
    const [dragAtom, setDragAtom] = useState<string | null>(null);

    // Refs for mousemove without re-render
    const hoverRef = useRef<string | null>(null);
    const mpRef = useRef<{ x: number; y: number } | null>(null);
    const rafRef = useRef<number>(0);
    const atomsRef = useRef(atoms);
    const bondsRef = useRef(bonds);
    const bondStartRef = useRef(bondStart);
    const toolRef = useRef(tool);
    const elementRef = useRef(element);
    atomsRef.current = atoms;
    bondsRef.current = bonds;
    bondStartRef.current = bondStart;
    toolRef.current = tool;
    elementRef.current = element;

    /* ── Hit detection ── */
    const findAtom = useCallback((x: number, y: number): DrawAtom | null => {
        for (const a of atomsRef.current) {
            const dx = a.x - x, dy = a.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < HIT_R) return a;
        }
        return null;
    }, []);

    const findBond = useCallback((x: number, y: number): DrawBond | null => {
        for (const b of bondsRef.current) {
            const a1 = atomsRef.current.find(a => a.id === b.from);
            const a2 = atomsRef.current.find(a => a.id === b.to);
            if (!a1 || !a2) continue;
            const t = Math.max(0, Math.min(1,
                ((x - a1.x) * (a2.x - a1.x) + (y - a1.y) * (a2.y - a1.y)) /
                ((a2.x - a1.x) ** 2 + (a2.y - a1.y) ** 2)));
            const px = a1.x + t * (a2.x - a1.x);
            const py = a1.y + t * (a2.y - a1.y);
            if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 10) return b;
        }
        return null;
    }, []);

    /* ── Snap new atom position to 30° angles ── */
    const snapPos = useCallback((sx: number, sy: number, mx: number, my: number) => {
        const angle = Math.atan2(my - sy, mx - sx);
        const snapped = Math.round(angle / (Math.PI / 6)) * (Math.PI / 6);
        return { x: Math.round(sx + BOND_LEN * Math.cos(snapped)), y: Math.round(sy + BOND_LEN * Math.sin(snapped)) };
    }, []);

    /* ── Canvas rendering ── */
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Grid dots
        ctx.fillStyle = "rgba(59,130,246,0.08)";
        for (let x = 0; x < w; x += 30) for (let y = 0; y < h; y += 30) {
            ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }

        const as = atomsRef.current;
        const bs = bondsRef.current;

        // Draw bonds
        for (const bond of bs) {
            const a1 = as.find(a => a.id === bond.from);
            const a2 = as.find(a => a.id === bond.to);
            if (!a1 || !a2) continue;
            const dx = a2.x - a1.x, dy = a2.y - a1.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len, ny = dx / len;
            ctx.strokeStyle = "rgba(148,163,184,0.6)";
            ctx.lineWidth = 2;
            if (bond.order === 1) {
                ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
            } else if (bond.order === 2) {
                const off = 3;
                ctx.beginPath(); ctx.moveTo(a1.x + nx * off, a1.y + ny * off); ctx.lineTo(a2.x + nx * off, a2.y + ny * off); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(a1.x - nx * off, a1.y - ny * off); ctx.lineTo(a2.x - nx * off, a2.y - ny * off); ctx.stroke();
            } else {
                ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
                const off = 4;
                ctx.beginPath(); ctx.moveTo(a1.x + nx * off, a1.y + ny * off); ctx.lineTo(a2.x + nx * off, a2.y + ny * off); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(a1.x - nx * off, a1.y - ny * off); ctx.lineTo(a2.x - nx * off, a2.y - ny * off); ctx.stroke();
            }
        }

        // Preview bond
        if (bondStartRef.current && mpRef.current && (toolRef.current === "bond-single" || toolRef.current === "bond-double")) {
            const sa = as.find(a => a.id === bondStartRef.current);
            if (sa) {
                const target = findAtom(mpRef.current.x, mpRef.current.y);
                const tx = target ? target.x : snapPos(sa.x, sa.y, mpRef.current.x, mpRef.current.y).x;
                const ty = target ? target.y : snapPos(sa.x, sa.y, mpRef.current.x, mpRef.current.y).y;
                ctx.strokeStyle = "rgba(59,130,246,0.4)";
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(tx, ty); ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw atoms
        for (const atom of as) {
            const isHovered = hoverRef.current === atom.id;
            const isStart = bondStartRef.current === atom.id;
            const col = COLORS[atom.symbol] || "#cbd5e1";

            // Halo
            if (isHovered || isStart) {
                ctx.fillStyle = isStart ? "rgba(59,130,246,0.2)" : "rgba(148,163,184,0.1)";
                ctx.beginPath(); ctx.arc(atom.x, atom.y, ATOM_R + 6, 0, Math.PI * 2); ctx.fill();
                if (isStart) {
                    ctx.strokeStyle = "rgba(59,130,246,0.5)"; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(atom.x, atom.y, ATOM_R + 6, 0, Math.PI * 2); ctx.stroke();
                }
            }

            // Background circle for non-C atoms or if it's C with label visible
            if (atom.symbol !== "C" || as.length === 1) {
                ctx.fillStyle = "rgba(10,15,30,0.95)";
                ctx.beginPath(); ctx.arc(atom.x, atom.y, ATOM_R, 0, Math.PI * 2); ctx.fill();
                ctx.font = "bold 13px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = col;
                ctx.fillText(atom.symbol, atom.x, atom.y + 1);
            } else {
                // For carbon, draw a small dot
                ctx.fillStyle = "rgba(148,163,184,0.3)";
                ctx.beginPath(); ctx.arc(atom.x, atom.y, 3, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }, [findAtom, snapPos]);

    /* ── Sizing ── */
    useEffect(() => {
        const resize = () => {
            const canvas = canvasRef.current;
            const cont = containerRef.current;
            if (!canvas || !cont) return;
            const dpr = window.devicePixelRatio || 1;
            const w = cont.clientWidth;
            const h = 420;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            render();
        };
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [render]);

    /* ── Re-render on data change + notify parent ── */
    useEffect(() => { render(); }, [atoms, bonds, bondStart, render]);
    useEffect(() => {
        onSmilesChange?.(generateSmiles(atoms, bonds));
        onFormulaChange?.(calcFormula(atoms, bonds));
        onMWChange?.(calcMW(atoms, bonds));
    }, [atoms, bonds, onSmilesChange, onFormulaChange, onMWChange]);

    /* ── Existing bond lookup ── */
    const existingBond = (a: string, b: string) =>
        bonds.find(x => (x.from === a && x.to === b) || (x.from === b && x.to === a));

    /* ── Mouse handlers ── */
    const getPos = (e: React.MouseEvent) => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const pos = getPos(e);
        const hitAtom = findAtom(pos.x, pos.y);

        if (tool === "select") {
            if (hitAtom) setDragAtom(hitAtom.id);
            return;
        }

        if (tool === "erase") {
            if (hitAtom) {
                setAtoms(prev => prev.filter(a => a.id !== hitAtom.id));
                setBonds(prev => prev.filter(b => b.from !== hitAtom.id && b.to !== hitAtom.id));
            } else {
                const hitBond = findBond(pos.x, pos.y);
                if (hitBond) setBonds(prev => prev.filter(b => b.id !== hitBond.id));
            }
            return;
        }

        if (tool === "ring") {
            const cx = hitAtom ? hitAtom.x : pos.x;
            const cy = hitAtom ? hitAtom.y - BOND_LEN : pos.y;
            const ringAtoms: DrawAtom[] = [];
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI) / 3 - Math.PI / 2;
                ringAtoms.push({
                    id: gid(), symbol: "C",
                    x: Math.round(cx + BOND_LEN * Math.cos(angle)),
                    y: Math.round(cy + BOND_LEN * Math.sin(angle)),
                });
            }
            const ringBonds: DrawBond[] = [];
            for (let i = 0; i < 6; i++) {
                ringBonds.push({
                    id: gid(), from: ringAtoms[i].id, to: ringAtoms[(i + 1) % 6].id,
                    order: (i % 2 === 0) ? 2 : 1,
                });
            }
            // If clicked on existing atom, merge first ring atom with it
            if (hitAtom) {
                const first = ringAtoms[0];
                // Offset ring so first atom is at hitAtom position
                const dx = hitAtom.x - first.x, dy = hitAtom.y - first.y;
                ringAtoms.forEach(a => { a.x += dx; a.y += dy; });
                ringAtoms[0] = { ...hitAtom };
                ringBonds.forEach(b => { if (b.from === first.id) b.from = hitAtom.id; if (b.to === first.id) b.to = hitAtom.id; });
                setAtoms(prev => [...prev, ...ringAtoms.slice(1)]);
            } else {
                setAtoms(prev => [...prev, ...ringAtoms]);
            }
            setBonds(prev => [...prev, ...ringBonds]);
            return;
        }

        if (tool === "chain") {
            if (hitAtom) {
                setBondStart(hitAtom.id);
            } else {
                const newAtom: DrawAtom = { id: gid(), symbol: element, x: Math.round(pos.x), y: Math.round(pos.y) };
                setAtoms(prev => [...prev, newAtom]);
                setBondStart(newAtom.id);
            }
            return;
        }

        // Bond tools
        if (tool === "bond-single" || tool === "bond-double") {
            const order = tool === "bond-double" ? 2 : 1;
            if (bondStart) {
                if (hitAtom) {
                    if (hitAtom.id === bondStart) { setBondStart(null); return; }
                    const eb = existingBond(bondStart, hitAtom.id);
                    if (eb) {
                        setBonds(prev => prev.map(b => b.id === eb.id ? { ...b, order: Math.min(3, b.order + 1) as 1 | 2 | 3 } : b));
                    } else {
                        setBonds(prev => [...prev, { id: gid(), from: bondStart, to: hitAtom.id, order: order as 1 | 2 }]);
                    }
                    setBondStart(hitAtom.id);
                } else {
                    const sa = atoms.find(a => a.id === bondStart);
                    if (!sa) return;
                    const sp = snapPos(sa.x, sa.y, pos.x, pos.y);
                    const newAtom: DrawAtom = { id: gid(), symbol: element, x: sp.x, y: sp.y };
                    setAtoms(prev => [...prev, newAtom]);
                    setBonds(prev => [...prev, { id: gid(), from: bondStart, to: newAtom.id, order: order as 1 | 2 }]);
                    setBondStart(newAtom.id);
                }
            } else {
                if (hitAtom) {
                    setBondStart(hitAtom.id);
                } else {
                    const newAtom: DrawAtom = { id: gid(), symbol: element, x: Math.round(pos.x), y: Math.round(pos.y) };
                    setAtoms(prev => [...prev, newAtom]);
                    setBondStart(newAtom.id);
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const pos = getPos(e);
        mpRef.current = pos;
        const hit = findAtom(pos.x, pos.y);
        hoverRef.current = hit?.id ?? null;

        if (tool === "select" && dragAtom) {
            setAtoms(prev => prev.map(a => a.id === dragAtom ? { ...a, x: Math.round(pos.x), y: Math.round(pos.y) } : a));
            return;
        }

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => render());
    };

    const handleMouseUp = () => { setDragAtom(null); };

    const handleMouseLeave = () => {
        mpRef.current = null;
        hoverRef.current = null;
        setDragAtom(null);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => render());
    };

    /* ── Actions ── */
    const handleClear = () => { setAtoms([]); setBonds([]); setBondStart(null); };
    const handleCenter = () => {
        if (!atoms.length) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr, ch = canvas.height / dpr;
        const minX = Math.min(...atoms.map(a => a.x));
        const maxX = Math.max(...atoms.map(a => a.x));
        const minY = Math.min(...atoms.map(a => a.y));
        const maxY = Math.max(...atoms.map(a => a.y));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const dx = cw / 2 - cx, dy = ch / 2 - cy;
        setAtoms(prev => prev.map(a => ({ ...a, x: Math.round(a.x + dx), y: Math.round(a.y + dy) })));
    };

    const selectTool = (t: DrawTool) => { setTool(t); setBondStart(null); };
    const selectElement = (el: string) => {
        setElement(el);
        // If select tool is active, don't switch tool
        if (tool === "select" || tool === "erase" || tool === "ring") return;
    };

    const formula = calcFormula(atoms, bonds);
    const mw = calcMW(atoms, bonds);
    const valid = isValid(atoms, bonds);

    const tools: { key: DrawTool; icon: React.ReactNode; label: string }[] = [
        { key: "select", icon: <MousePointer2 size={16} />, label: "Select" },
        { key: "erase", icon: <Eraser size={16} />, label: "Erase" },
        { key: "bond-single", icon: <span style={{ fontSize: 18, fontWeight: 300, lineHeight: 1 }}>╲</span>, label: "Single" },
        { key: "bond-double", icon: <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>=</span>, label: "Double" },
        { key: "ring", icon: <Hexagon size={16} />, label: "Ring" },
        { key: "chain", icon: <span style={{ fontSize: 16, lineHeight: 1 }}>∿</span>, label: "Chain" },
    ];

    return (
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--glass-border)", background: "rgba(10,15,30,0.95)" }}>
            {/* Header */}
            <div style={{
                padding: "10px 16px", display: "flex", alignItems: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))",
                borderBottom: "1px solid rgba(59,130,246,0.2)",
            }}>
                <Pencil size={16} style={{ color: "var(--accent-blue)" }} />
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-blue-light)" }}>2D Sketcher</span>
            </div>

            {/* Toolbar */}
            <div style={{
                padding: "8px 12px", display: "flex", alignItems: "center", gap: 4,
                borderBottom: "1px solid var(--glass-border)", flexWrap: "wrap",
            }}>
                {tools.map(t => (
                    <button key={t.key} title={t.label} onClick={() => selectTool(t.key)} style={{
                        width: 34, height: 34, borderRadius: 8, border: "1px solid",
                        borderColor: tool === t.key ? "var(--accent-blue)" : "transparent",
                        background: tool === t.key ? "rgba(59,130,246,0.15)" : "transparent",
                        color: tool === t.key ? "var(--accent-blue-light)" : "var(--text-secondary)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", transition: "all 0.15s ease",
                    }}>
                        {t.icon}
                    </button>
                ))}

                <div style={{ width: 1, height: 24, background: "var(--glass-border)", margin: "0 6px" }} />

                {ELEMENTS.map(el => (
                    <button key={el} onClick={() => selectElement(el)} style={{
                        minWidth: 28, height: 30, borderRadius: 6, border: "1px solid",
                        borderColor: element === el ? COLORS[el] + "66" : "transparent",
                        background: element === el ? (COLORS[el] || "#cbd5e1") + "18" : "transparent",
                        color: element === el ? COLORS[el] : "var(--text-muted)",
                        fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                        padding: "0 4px", transition: "all 0.15s ease",
                    }}>
                        {el}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                <button onClick={handleClear} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                    borderRadius: 8, border: "1px solid var(--glass-border)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                }}>
                    <Trash2 size={12} /> Clear
                </button>
                <button onClick={handleCenter} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                    borderRadius: 8, border: "1px solid var(--glass-border)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                }}>
                    <Maximize2 size={12} /> Center
                </button>
            </div>

            {/* Canvas */}
            <div ref={containerRef} style={{ position: "relative" }}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        display: "block", width: "100%",
                        cursor: tool === "select" ? "default" : tool === "erase" ? "crosshair" : "crosshair",
                        background: "#0a0f1e",
                    }}
                />
            </div>

            {/* Status bar */}
            <div style={{
                padding: "8px 16px", display: "flex", alignItems: "center", gap: 24,
                borderTop: "1px solid var(--glass-border)", fontSize: "0.8rem",
            }}>
                <div>
                    <span style={{ color: "var(--text-muted)" }}>Formula: </span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{formula || "—"}</span>
                </div>
                <div>
                    <span style={{ color: "var(--text-muted)" }}>MW: </span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        {atoms.length ? `${mw} g/mol` : "—"}
                    </span>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: atoms.length === 0 ? "var(--text-muted)" : valid ? "#10b981" : "#ef4444",
                    }} />
                    <span style={{
                        fontWeight: 600,
                        color: atoms.length === 0 ? "var(--text-muted)" : valid ? "#10b981" : "#ef4444",
                    }}>
                        {atoms.length === 0 ? "Empty Canvas" : valid ? "Valid Structure" : "Invalid Valence"}
                    </span>
                </div>
            </div>
        </div>
    );
}
