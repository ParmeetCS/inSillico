"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FlaskConical, Mail, Lock, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        haptic("medium");
        setLoading(true);
        const { error } = await signIn(email, password);
        setLoading(false);
        if (error) {
            haptic("error");
            toast(error, "error");
        } else {
            haptic("success");
            toast("Welcome back!", "success");
            router.push("/dashboard");
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
            }}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{ width: "100%", maxWidth: 420 }}
            >
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                        <motion.div
                            whileHover={{ scale: 1.05, rotate: 5 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                width: 52,
                                height: 52,
                                borderRadius: 14,
                                background: "var(--gradient-accent)",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: 16,
                            }}
                        >
                            <FlaskConical size={26} color="white" />
                        </motion.div>
                    </Link>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-outfit), sans-serif", marginBottom: 8 }}>
                        Welcome Back
                    </h1>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Sign in to your InSilico account
                    </p>
                </div>

                {/* Form */}
                <div className="glass glow-blue" style={{ padding: 32, borderRadius: 16 }}>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
                                Email Address
                            </label>
                            <div style={{ position: "relative" }}>
                                <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                <input
                                    type="email"
                                    className="input"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    style={{ paddingLeft: 40 }}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
                                Password
                            </label>
                            <div style={{ position: "relative" }}>
                                <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{ paddingLeft: 40, paddingRight: 40 }}
                                    required
                                />
                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.85 }}
                                    onClick={() => { setShowPassword(!showPassword); haptic("light"); }}
                                    style={{
                                        position: "absolute",
                                        right: 12,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                    }}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </motion.button>
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            className="btn-primary"
                            disabled={loading}
                            whileHover={{ scale: loading ? 1 : 1.02 }}
                            whileTap={{ scale: loading ? 1 : 0.97 }}
                            style={{
                                width: "100%",
                                justifyContent: "center",
                                padding: "14px 24px",
                                fontSize: "0.95rem",
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? (
                                <>
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                        <Loader2 size={16} />
                                    </motion.div>
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </motion.button>
                    </form>

                    <div style={{ textAlign: "center", marginTop: 24 }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            Don&apos;t have an account?{" "}
                            <Link
                                href="/auth/signup"
                                style={{ color: "var(--accent-blue-light)", textDecoration: "none", fontWeight: 600 }}
                            >
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
