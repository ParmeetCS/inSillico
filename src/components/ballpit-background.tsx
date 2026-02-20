"use client";

import { useEffect, useRef } from "react";

/* ──────────────────────────────────────────────
   Molecule / Atom Floating Background
   ──────────────────────────────────────────────
   Themed for InSilico Formulator:
   - Atom-like particles with electron rings
   - Floating hexagon rings (benzene)
   - Molecular bonds connecting nearby atoms
   - Continuous random drifting, no gravity
   ────────────────────────────────────────────── */

interface Atom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  opacity: number;
  type: "atom" | "molecule" | "helix" | "ring";
  rotation: number;
  rotationSpeed: number;
  pulsePhase: number;
  pulseSpeed: number;
  orbitRadius: number;
  orbitSpeed: number;
}

export default function BallpitBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // ─── Palette (matches InSilico dark navy theme) ───
    const palette = [
      { color: "rgba(59,130,246,0.5)", glow: "rgba(59,130,246,0.15)" },   // Blue
      { color: "rgba(139,92,246,0.5)", glow: "rgba(139,92,246,0.15)" },   // Purple
      { color: "rgba(6,182,212,0.4)", glow: "rgba(6,182,212,0.12)" },     // Cyan
      { color: "rgba(16,185,129,0.35)", glow: "rgba(16,185,129,0.1)" },   // Green
      { color: "rgba(96,165,250,0.3)", glow: "rgba(96,165,250,0.1)" },    // Light blue
      { color: "rgba(167,139,250,0.3)", glow: "rgba(167,139,250,0.1)" },  // Light purple
    ];

    const types: Atom["type"][] = ["atom", "atom", "atom", "molecule", "molecule", "ring", "helix"];

    // ─── Create particles ───
    const count = Math.min(45, Math.floor((W * H) / 30000));
    const atoms: Atom[] = [];

    for (let i = 0; i < count; i++) {
      const p = palette[Math.floor(Math.random() * palette.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      const baseRadius = type === "ring" ? Math.random() * 14 + 10
        : type === "molecule" ? Math.random() * 8 + 5
          : type === "helix" ? Math.random() * 10 + 6
            : Math.random() * 6 + 3;

      atoms.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: baseRadius,
        color: p.color,
        glowColor: p.glow,
        opacity: Math.random() * 0.4 + 0.2,
        type,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.012,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.008,
        orbitRadius: Math.random() * 8 + 4,
        orbitSpeed: Math.random() * 0.015 + 0.005,
      });
    }

    // ─── Bond distance & style ───
    const bondMaxDist = 160;

    // ─── Draw functions ───

    function drawAtom(ctx: CanvasRenderingContext2D, a: Atom, time: number) {
      const pulse = 1 + Math.sin(a.pulsePhase + time * a.pulseSpeed) * 0.15;
      const r = a.radius * pulse;

      // Outer glow
      const glow = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r * 3.5);
      glow.addColorStop(0, a.glowColor);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Core sphere
      const grad = ctx.createRadialGradient(
        a.x - r * 0.3, a.y - r * 0.3, r * 0.1,
        a.x, a.y, r
      );
      grad.addColorStop(0, a.color.replace(/[\d.]+\)$/, "0.9)"));
      grad.addColorStop(0.6, a.color);
      grad.addColorStop(1, a.color.replace(/[\d.]+\)$/, "0.15)"));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight
      const spec = ctx.createRadialGradient(
        a.x - r * 0.35, a.y - r * 0.35, 0,
        a.x - r * 0.35, a.y - r * 0.35, r * 0.6
      );
      spec.addColorStop(0, "rgba(255,255,255,0.35)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Electron orbit ring
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation + time * a.orbitSpeed);
      ctx.scale(1, 0.35);
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.25)");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r + a.orbitRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Orbiting electron dot
      const elAngle = time * a.orbitSpeed * 3;
      const ex = Math.cos(elAngle) * (r + a.orbitRadius);
      const ey = Math.sin(elAngle) * (r + a.orbitRadius);
      ctx.fillStyle = a.color.replace(/[\d.]+\)$/, "0.8)");
      ctx.beginPath();
      ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawMolecule(ctx: CanvasRenderingContext2D, a: Atom, time: number) {
      const pulse = 1 + Math.sin(a.pulsePhase + time * a.pulseSpeed) * 0.1;
      const r = a.radius * pulse;

      // Draw double-atom molecule (like O₂ or N₂)
      const offset = r * 1.6;
      const angle = a.rotation + time * a.rotationSpeed;
      const dx = Math.cos(angle) * offset;
      const dy = Math.sin(angle) * offset;

      // Bond line between atoms
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.3)");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x - dx, a.y - dy);
      ctx.lineTo(a.x + dx, a.y + dy);
      ctx.stroke();

      // Second bond line (double bond)
      const perpX = Math.cos(angle + Math.PI / 2) * 3;
      const perpY = Math.sin(angle + Math.PI / 2) * 3;
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.15)");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x - dx + perpX, a.y - dy + perpY);
      ctx.lineTo(a.x + dx + perpX, a.y + dy + perpY);
      ctx.stroke();

      // Two atom spheres
      for (const sign of [-1, 1]) {
        const cx = a.x + dx * sign;
        const cy = a.y + dy * sign;

        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
        glow.addColorStop(0, a.glowColor);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(
          cx - r * 0.25, cy - r * 0.25, r * 0.1,
          cx, cy, r
        );
        grad.addColorStop(0, a.color.replace(/[\d.]+\)$/, "0.8)"));
        grad.addColorStop(1, a.color.replace(/[\d.]+\)$/, "0.2)"));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawHexRing(ctx: CanvasRenderingContext2D, a: Atom, time: number) {
      // Benzene ring
      const pulse = 1 + Math.sin(a.pulsePhase + time * a.pulseSpeed) * 0.08;
      const r = a.radius * pulse;
      const angle = a.rotation + time * a.rotationSpeed;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(angle);

      // Outer hexagon
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.35)");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ha = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(ha) * r;
        const py = Math.sin(ha) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner hexagon (double bond representation)
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.18)");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ha = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(ha) * r * 0.6;
        const py = Math.sin(ha) * r * 0.6;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Vertex atoms
      for (let i = 0; i < 6; i++) {
        const ha = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(ha) * r;
        const py = Math.sin(ha) * r;

        const vGrad = ctx.createRadialGradient(px, py, 0, px, py, 3);
        vGrad.addColorStop(0, a.color.replace(/[\d.]+\)$/, "0.7)"));
        vGrad.addColorStop(1, a.color.replace(/[\d.]+\)$/, "0.1)"));
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center glow
      const cGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
      cGlow.addColorStop(0, a.glowColor);
      cGlow.addColorStop(1, "transparent");
      ctx.fillStyle = cGlow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function drawHelixSegment(ctx: CanvasRenderingContext2D, a: Atom, time: number) {
      const r = a.radius;
      const angle = a.rotation + time * a.rotationSpeed;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(angle);

      // Draw a small double-helix fragment
      const segments = 8;
      const length = r * 3;
      const amplitude = r * 0.8;

      for (const strand of [1, -1]) {
        ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, `${0.25 + strand * 0.05})`);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const sx = (t - 0.5) * length;
          const sy = Math.sin((t * Math.PI * 2) + time * a.pulseSpeed * 2) * amplitude * strand;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Cross rungs
      ctx.strokeStyle = a.color.replace(/[\d.]+\)$/, "0.12)");
      ctx.lineWidth = 1;
      for (let i = 1; i < segments; i += 2) {
        const t = i / segments;
        const sx = (t - 0.5) * length;
        const sy1 = Math.sin((t * Math.PI * 2) + time * a.pulseSpeed * 2) * amplitude;
        const sy2 = -sy1;
        ctx.beginPath();
        ctx.moveTo(sx, sy1);
        ctx.lineTo(sx, sy2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ─── Animation loop ───
    let frameId: number;
    let time = 0;

    const animate = () => {
      time++;
      ctx.clearRect(0, 0, W, H);

      // Draw bonds between nearby atoms
      ctx.lineCap = "round";
      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a = atoms[i];
          const b = atoms[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bondMaxDist) {
            const alpha = (1 - dist / bondMaxDist) * 0.12;
            ctx.strokeStyle = `rgba(100,150,255,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw & update each atom
      atoms.forEach((a) => {
        // Slight random wandering force
        a.vx += (Math.random() - 0.5) * 0.015;
        a.vy += (Math.random() - 0.5) * 0.015;

        // Dampen to keep speed reasonable
        const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        const maxSpeed = 0.6;
        if (speed > maxSpeed) {
          a.vx = (a.vx / speed) * maxSpeed;
          a.vy = (a.vy / speed) * maxSpeed;
        }

        // Update position
        a.x += a.vx;
        a.y += a.vy;

        // Wrap around edges smoothly
        const margin = 60;
        if (a.x < -margin) a.x = W + margin;
        if (a.x > W + margin) a.x = -margin;
        if (a.y < -margin) a.y = H + margin;
        if (a.y > H + margin) a.y = -margin;

        // Rotate
        a.rotation += a.rotationSpeed;

        // Draw based on type
        ctx.globalAlpha = a.opacity;
        switch (a.type) {
          case "atom":
            drawAtom(ctx, a, time);
            break;
          case "molecule":
            drawMolecule(ctx, a, time);
            break;
          case "ring":
            drawHexRing(ctx, a, time);
            break;
          case "helix":
            drawHelixSegment(ctx, a, time);
            break;
        }
        ctx.globalAlpha = 1;
      });

      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
