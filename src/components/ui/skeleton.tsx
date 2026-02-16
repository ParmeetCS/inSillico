"use client";

import { motion } from "framer-motion";

export function Skeleton({ width = "100%", height = 20, borderRadius = 8 }: { width?: string | number; height?: number; borderRadius?: number }) {
    return (
        <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
                width,
                height,
                borderRadius,
                background: "linear-gradient(90deg, rgba(148,163,184,0.08) 0%, rgba(148,163,184,0.15) 50%, rgba(148,163,184,0.08) 100%)",
                backgroundSize: "200% 100%",
            }}
        />
    );
}

export function CardSkeleton() {
    return (
        <div className="glass" style={{ padding: 24 }}>
            <Skeleton width={120} height={14} />
            <div style={{ marginTop: 16 }}>
                <Skeleton width={80} height={32} />
            </div>
            <div style={{ marginTop: 12 }}>
                <Skeleton width={100} height={12} />
            </div>
        </div>
    );
}

export function TableRowSkeleton() {
    return (
        <tr>
            <td style={{ padding: 16 }}><Skeleton width={80} height={14} /></td>
            <td style={{ padding: 16 }}><Skeleton width={160} height={14} /></td>
            <td style={{ padding: 16 }}><Skeleton width={80} height={22} borderRadius={12} /></td>
            <td style={{ padding: 16 }}><Skeleton width={50} height={14} /></td>
            <td style={{ padding: 16 }}><Skeleton width={60} height={14} /></td>
        </tr>
    );
}
