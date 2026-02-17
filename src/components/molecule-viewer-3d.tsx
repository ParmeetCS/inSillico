"use client";

import { useRef, useEffect, useState } from "react";
import { RotateCw, Maximize2, Camera } from "lucide-react";

/* ─── Aspirin SDF (V2000) for demo ─── */
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

interface Props {
  sdfData?: string;
  width?: string;
  height?: string;
  spinning?: boolean;
}

export default function MoleculeViewer3D({
  sdfData = ASPIRIN_SDF,
  width = "100%",
  height = "100%",
  spinning: initialSpin = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loaded, setLoaded] = useState(false);
  const [spin, setSpin] = useState(initialSpin);

  /* Load 3Dmol.js from CDN */
  useEffect(() => {
    if (window.$3Dmol) {
      setLoaded(true);
      return;
    }
    const jq = document.createElement("script");
    jq.src = "https://code.jquery.com/jquery-3.7.1.min.js";
    jq.onload = () => {
      const s = document.createElement("script");
      s.src = "https://3dmol.org/build/3Dmol-min.js";
      s.onload = () => setLoaded(true);
      document.head.appendChild(s);
    };
    document.head.appendChild(jq);
  }, []);

  /* Initialize viewer */
  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    const el = containerRef.current;
    el.innerHTML = "";

    const viewer = window.$3Dmol.createViewer(el, {
      backgroundColor: "rgba(0,0,0,0)",
      antialias: true,
    });

    viewer.addModel(sdfData, "sdf");
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
  }, [loaded, sdfData, spin]);

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

  return (
    <div style={{ position: "relative", width, height, minHeight: 260 }}>
      {/* Loading overlay */}
      {!loaded && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(10,15,30,0.6)",
          borderRadius: 12, zIndex: 2,
        }}>
          <div className="spin" style={{ color: "var(--accent-cyan)" }}>
            <RotateCw size={24} />
          </div>
        </div>
      )}

      {/* 3Dmol container */}
      <div
        ref={containerRef}
        style={{
          width: "100%", height: "100%", borderRadius: 12,
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
          onClick={resetView}
          title="Reset view"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)", color: "#cbd5e1",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
