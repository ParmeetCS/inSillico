"use client";

import { useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { haptic } from "@/lib/haptics";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

const toastConfig: Record<ToastType, { icon: typeof CheckCircle2; color: string; bg: string }> = {
    success: { icon: CheckCircle2, color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" },
    error: { icon: XCircle, color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
    warning: { icon: AlertTriangle, color: "#f97316", bg: "rgba(249, 115, 22, 0.12)" },
    info: { icon: Info, color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
};

let globalAddToast: ((message: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = "info") {
    if (globalAddToast) globalAddToast(message, type);
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now().toString();
        haptic(type === "success" ? "success" : type === "error" ? "error" : "light");
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    globalAddToast = addToast;

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <>
            {children}
            <div
                style={{
                    position: "fixed",
                    top: 88,
                    right: 20,
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    pointerEvents: "none",
                }}
            >
                <AnimatePresence>
                    {toasts.map((t) => {
                        const config = toastConfig[t.type];
                        const Icon = config.icon;
                        return (
                            <motion.div
                                key={t.id}
                                initial={{ opacity: 0, x: 80, scale: 0.9 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 80, scale: 0.9 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                style={{
                                    background: "rgba(10, 15, 30, 0.95)",
                                    backdropFilter: "blur(16px)",
                                    border: `1px solid ${config.color}40`,
                                    borderRadius: 12,
                                    padding: "12px 16px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    minWidth: 280,
                                    maxWidth: 400,
                                    pointerEvents: "auto",
                                    boxShadow: `0 4px 20px ${config.color}15`,
                                }}
                            >
                                <Icon size={18} style={{ color: config.color, flexShrink: 0 }} />
                                <span style={{ fontSize: "0.85rem", color: "#f1f5f9", flex: 1 }}>{t.message}</span>
                                <button
                                    onClick={() => removeToast(t.id)}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: "#64748b",
                                        cursor: "pointer",
                                        padding: 2,
                                        flexShrink: 0,
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </>
    );
}
