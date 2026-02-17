"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { RotateCw, Maximize2, Minimize2, Loader2, AlertCircle } from "lucide-react";

/* ─── Fallback Aspirin SDF (V2000) only if nothing else is provided ─── */
const ASPIRIN_SDF = `
     RDKit          3D

 21 21  0  0  0  0  0  0  0  0999 V2000
    1.2124    0.7004    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    0.0003    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249   -1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124   -2.1001    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0003    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2125    0.7004    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2125    2.1005    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4249    2.8006    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.8006    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.6374    0.7004    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.6374    2.1005    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    4.8498    0.0003    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.1005    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    3.3623   -1.9376    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124   -3.1804    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.9375   -1.9376    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4249    3.8810    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -3.1624    2.2107    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -3.1624    3.3906    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    4.8498   -1.0200    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0
  2  3  1  0
  3  4  2  0
  4  5  1  0
  5  6  2  0
  6  1  1  0
  6  7  1  0
  7  8  1  0
  8  9  1  0
  8 10  2  0
  2 11  1  0
 11 12  2  0
 11 13  1  0
  1 14  1  0
  3 15  1  0
  4 16  1  0
  5 17  1  0
  9 18  1  0
  9 19  1  0
  9 20  1  0
 13 21  1  0
M  END
$$$$`;

declare global {
  interface Window {
    $3Dmol: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

/* ─── Convert SMILES → 3D SDF via external APIs ─── */
async function smilesToSDF(smiles: string): Promise<string | null> {
  const encoded = encodeURIComponent(smiles);

  // Strategy 1: PubChem — SMILES → CID → 3D SDF
  try {
    const cidRes = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/cids/JSON`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (cidRes.ok) {
      const cidData = await cidRes.json();
      const cid = cidData?.IdentifierList?.CID?.[0];
      if (cid) {
        const sdfRes = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (sdfRes.ok) {
          const sdf = await sdfRes.text();
          if (sdf && sdf.includes("V2000") || sdf.includes("V3000")) {
            console.log("[3D Viewer] Loaded 3D structure from PubChem");
            return sdf;
          }
        }
        // Fallback: 2D SDF from PubChem
        const sdf2dRes = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (sdf2dRes.ok) {
          const sdf2d = await sdf2dRes.text();
          if (sdf2d) {
            console.log("[3D Viewer] Loaded 2D structure from PubChem (3D unavailable)");
            return sdf2d;
          }
        }
      }
    }
  } catch (e) {
    console.warn("[3D Viewer] PubChem lookup failed:", e);
  }

  // Strategy 2: NCI CACTUS resolver
  try {
    const res = await fetch(
      `https://cactus.nci.nih.gov/chemical/structure/${encoded}/sdf?get3d=true`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const sdf = await res.text();
      if (sdf && sdf.length > 50) {
        console.log("[3D Viewer] Loaded 3D structure from NCI CACTUS");
        return sdf;
      }
    }
  } catch (e) {
    console.warn("[3D Viewer] NCI CACTUS lookup failed:", e);
  }

  return null;
}

interface Props {
  smiles?: string;
  sdfData?: string;
  width?: string;
  height?: string;
  spinning?: boolean;
  compact?: boolean;
}

export default function MoleculeViewer3D({
  smiles,
  sdfData,
  width = "100%",
  height = "100%",
  spinning: initialSpin = true,
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [libLoaded, setLibLoaded] = useState(false);
  const [spin, setSpin] = useState(initialSpin);
  const [resolvedSDF, setResolvedSDF] = useState<string | null>(sdfData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const prevSmiles = useRef<string | undefined>(undefined);

  /* Load 3Dmol.js from CDN */
  useEffect(() => {
    if (window.$3Dmol) {
      setLibLoaded(true);
      return;
    }
    const jq = document.createElement("script");
    jq.src = "https://code.jquery.com/jquery-3.7.1.min.js";
    jq.onload = () => {
      const s = document.createElement("script");
      s.src = "https://3dmol.org/build/3Dmol-min.js";
      s.onload = () => setLibLoaded(true);
      document.head.appendChild(s);
    };
    document.head.appendChild(jq);
  }, []);

  /* Resolve SMILES to SDF when smiles prop changes */
  const resolveSMILES = useCallback(async (smilesStr: string) => {
    setLoading(true);
    setError(null);
    console.log("[3D Viewer] Resolving SMILES:", smilesStr);

    const result = await smilesToSDF(smilesStr);
    if (result) {
      setResolvedSDF(result);
      setError(null);
    } else {
      setError("Could not generate 3D structure");
      // Use fallback aspirin only if no sdfData was explicitly provided
      if (!sdfData) {
        setResolvedSDF(ASPIRIN_SDF);
      }
    }
    setLoading(false);
  }, [sdfData]);

  useEffect(() => {
    // If explicit sdfData is given, use it directly
    if (sdfData) {
      setResolvedSDF(sdfData);
      return;
    }
    // If smiles changed, resolve it
    if (smiles && smiles !== prevSmiles.current) {
      prevSmiles.current = smiles;
      resolveSMILES(smiles);
    }
    // If neither provided, use aspirin fallback
    if (!smiles && !sdfData && !resolvedSDF) {
      setResolvedSDF(ASPIRIN_SDF);
    }
  }, [smiles, sdfData, resolveSMILES, resolvedSDF]);

  /* Initialize / update viewer */
  useEffect(() => {
    if (!libLoaded || !containerRef.current || !resolvedSDF) return;

    const el = containerRef.current;
    el.innerHTML = "";

    const viewer = window.$3Dmol.createViewer(el, {
      backgroundColor: "rgba(0,0,0,0)",
      antialias: true,
    });

    viewer.addModel(resolvedSDF, "sdf");
    viewer.setStyle({}, {
      stick: { radius: 0.14, colorscheme: "Jmol" },
      sphere: { scale: 0.28, colorscheme: "Jmol" },
    });
    viewer.zoomTo();
    viewer.zoom(1.15);
    if (spin) viewer.spin("y", 1);
    viewer.render();
    viewerRef.current = viewer;

    return () => { el.innerHTML = ""; };
  }, [libLoaded, resolvedSDF, spin]);

  const toggleSpin = () => {
    setSpin((s) => {
      const next = !s;
      viewerRef.current?.spin(next ? "y" : false, 1);
      return next;
    });
  };

  const resetView = () => {
    viewerRef.current?.zoomTo();
    viewerRef.current?.zoom(1.15);
    viewerRef.current?.render();
  };

  const toggleExpand = () => {
    setExpanded(prev => !prev);
    // Re-render viewer after transition to fill new size
    setTimeout(() => {
      viewerRef.current?.resize();
      viewerRef.current?.zoomTo();
      viewerRef.current?.zoom(1.15);
      viewerRef.current?.render();
    }, 50);
  };

  /* Escape key to close expanded */
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") toggleExpand(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const isLoading = !libLoaded || loading;

  const wrapperStyle: React.CSSProperties = expanded
    ? {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
        padding: 32, display: "flex", flexDirection: "column",
      }
    : {
        position: "relative", width, height,
        minHeight: compact ? 0 : 260,
      };

  return (
    <div style={wrapperStyle}>
      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(10,15,30,0.8)", borderRadius: 12, zIndex: 2, gap: 10,
        }}>
          <Loader2 size={28} className="spin" style={{ color: "var(--accent-cyan)" }} />
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {!libLoaded ? "Loading 3D engine..." : "Generating 3D structure..."}
          </span>
        </div>
      )}

      {/* Error badge */}
      {error && !loading && (
        <div style={{
          position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center",
          gap: 6, padding: "4px 10px", borderRadius: 8,
          background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
          fontSize: "0.7rem", color: "#f59e0b", zIndex: 3,
        }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* 3Dmol container */}
      <div
        ref={containerRef}
        style={{
          width: "100%", height: expanded ? undefined : "100%",
          flex: expanded ? 1 : undefined,
          borderRadius: 12,
          background: "radial-gradient(ellipse at center, rgba(20,30,60,0.8) 0%, rgba(8,12,28,0.95) 100%)",
          overflow: "hidden",
        }}
      />

      {/* Controls */}
      <div style={{
        position: "absolute", bottom: 10, right: 10, display: "flex", gap: 6, zIndex: 3,
      }}>
        <button
          onClick={toggleSpin}
          title={spin ? "Stop rotation" : "Start rotation"}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: spin ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)", color: "#cbd5e1",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          <RotateCw size={14} />
        </button>
        <button
          onClick={toggleExpand}
          title={expanded ? "Exit fullscreen" : "Expand to fullscreen"}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: expanded ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)", color: "#cbd5e1",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Expanded close hint */}
      {expanded && (
        <div style={{
          position: "absolute", top: 16, right: 16, zIndex: 4,
          padding: "6px 14px", borderRadius: 8,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          fontSize: "0.75rem", color: "#94a3b8", cursor: "pointer",
        }} onClick={toggleExpand}>
          Press Esc or click to close
        </div>
      )}
    </div>
  );
}
