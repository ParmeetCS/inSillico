"use client";

import { useEffect, useRef } from "react";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

export default function BallpitBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Color palette - glossy molecular colors matching the reference
    const colors = [
      "#FFFFFF", // White
      "#aa5dea", // Purple
      "#4a4a4a", // Dark gray/black
      "#666ff5", // Blue
    ];

    // Create balls
    const ballCount = 30;
    const balls: Ball[] = [];
    
    for (let i = 0; i < ballCount; i++) {
      const radius = Math.random() * 25 + 20; // 20-45px radius
      balls.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Physics constants (from URL: gravity=0.01)
    const gravity = 0.01;
    const friction = 0.995;
    const bounce = 0.8;

    // Animation loop
    let animationFrameId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      balls.forEach((ball, index) => {
        // Apply gravity
        ball.vy += gravity;

        // Apply friction
        ball.vx *= friction;
        ball.vy *= friction;

        // Update position
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Wall collision
        if (ball.x + ball.radius > canvas.width) {
          ball.x = canvas.width - ball.radius;
          ball.vx *= -bounce;
        } else if (ball.x - ball.radius < 0) {
          ball.x = ball.radius;
          ball.vx *= -bounce;
        }

        if (ball.y + ball.radius > canvas.height) {
          ball.y = canvas.height - ball.radius;
          ball.vy *= -bounce;
        } else if (ball.y - ball.radius < 0) {
          ball.y = ball.radius;
          ball.vy *= -bounce;
        }

        // Ball-to-ball collision
        for (let j = index + 1; j < balls.length; j++) {
          const other = balls[j];
          const dx = other.x - ball.x;
          const dy = other.y - ball.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDist = ball.radius + other.radius;

          if (distance < minDist) {
            // Collision detected
            const angle = Math.atan2(dy, dx);
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);

            // Separate balls
            const overlap = minDist - distance;
            const separateX = (overlap * cos) / 2;
            const separateY = (overlap * sin) / 2;

            ball.x -= separateX;
            ball.y -= separateY;
            other.x += separateX;
            other.y += separateY;

            // Elastic collision
            const vx1 = ball.vx * cos + ball.vy * sin;
            const vy1 = ball.vy * cos - ball.vx * sin;
            const vx2 = other.vx * cos + other.vy * sin;
            const vy2 = other.vy * cos - other.vx * sin;

            ball.vx = (vx2 * cos - vy1 * sin) * bounce;
            ball.vy = (vy1 * cos + vx2 * sin) * bounce;
            other.vx = (vx1 * cos - vy2 * sin) * bounce;
            other.vy = (vy2 * cos + vx1 * sin) * bounce;
          }
        }

        // Draw ball with glossy 3D effect
        // Main sphere with gradient
        const gradient = ctx.createRadialGradient(
          ball.x - ball.radius * 0.3,
          ball.y - ball.radius * 0.3,
          ball.radius * 0.1,
          ball.x,
          ball.y,
          ball.radius
        );
        
        // Create glossy gradient based on ball color with transparency
        if (ball.color === "#FFFFFF") {
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.7)");
          gradient.addColorStop(0.3, "rgba(240, 240, 250, 0.6)");
          gradient.addColorStop(1, "rgba(200, 200, 220, 0.5)");
        } else if (ball.color === "#aa5dea") {
          gradient.addColorStop(0, "rgba(220, 180, 255, 0.7)");
          gradient.addColorStop(0.3, "rgba(170, 93, 234, 0.6)");
          gradient.addColorStop(1, "rgba(120, 60, 180, 0.5)");
        } else if (ball.color === "#4a4a4a") {
          gradient.addColorStop(0, "rgba(120, 120, 130, 0.7)");
          gradient.addColorStop(0.3, "rgba(74, 74, 74, 0.6)");
          gradient.addColorStop(1, "rgba(40, 40, 45, 0.5)");
        } else {
          gradient.addColorStop(0, "rgba(150, 160, 255, 0.7)");
          gradient.addColorStop(0.3, "rgba(102, 111, 245, 0.6)");
          gradient.addColorStop(1, "rgba(70, 80, 200, 0.5)");
        }

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Add white highlight for glossy effect
        const highlight = ctx.createRadialGradient(
          ball.x - ball.radius * 0.35,
          ball.y - ball.radius * 0.35,
          0,
          ball.x - ball.radius * 0.35,
          ball.y - ball.radius * 0.35,
          ball.radius * 0.5
        );
        highlight.addColorStop(0, "rgba(255, 255, 255, 0.5)");
        highlight.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
        highlight.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = highlight;
        ctx.fill();

        // Add subtle outer glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${ball.color}40`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
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
