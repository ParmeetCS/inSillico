/**
 * Haptic Feedback Utility
 * Provides tactile feedback through vibration API + visual micro-interactions
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "warning" | "selection";

const patterns: Record<HapticPattern, number[]> = {
    light: [10],
    medium: [20],
    heavy: [40],
    success: [10, 50, 20],
    error: [30, 50, 30, 50, 30],
    warning: [20, 50, 20],
    selection: [5],
};

export function haptic(pattern: HapticPattern = "light") {
    // Vibration API (mobile devices)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(patterns[pattern]);
    }
}

// Spring animation configs for framer-motion
export const springs = {
    snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
    bouncy: { type: "spring" as const, stiffness: 300, damping: 20 },
    gentle: { type: "spring" as const, stiffness: 200, damping: 25 },
    wobbly: { type: "spring" as const, stiffness: 180, damping: 12 },
};

// Hover scale presets  
export const hoverScale = {
    subtle: { scale: 1.02, transition: springs.snappy },
    medium: { scale: 1.05, transition: springs.snappy },
    large: { scale: 1.08, transition: springs.bouncy },
};

// Tap/press presets
export const tapScale = {
    light: { scale: 0.98 },
    medium: { scale: 0.95 },
    heavy: { scale: 0.92 },
};

// Page transition variants
export const pageTransition = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

// Stagger children
export const staggerContainer = {
    animate: {
        transition: { staggerChildren: 0.06 },
    },
};

export const staggerItem = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};
