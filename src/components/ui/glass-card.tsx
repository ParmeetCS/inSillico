"use client";

import { ReactNode } from "react";

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    glow?: "blue" | "green" | "purple" | "cyan" | "none";
    padding?: string;
    hover?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function GlassCard({
    children,
    className = "",
    glow = "none",
    padding = "24px",
    hover = true,
    onClick,
    style,
}: GlassCardProps) {
    const glowClass = glow !== "none" ? `glow-${glow}` : "";

    return (
        <div
            className={`glass ${glowClass} ${className}`}
            onClick={onClick}
            style={{
                padding,
                cursor: onClick ? "pointer" : "default",
                transition: hover ? "all 0.3s ease" : "none",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
