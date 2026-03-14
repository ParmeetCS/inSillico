import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Performance Optimizations ──
  experimental: {
    // Tree-shake heavy packages — only import what's actually used
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "recharts",
      "three",
    ],
  },

  // ── Image Optimization ──
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // ── Faster builds on Vercel ──
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
