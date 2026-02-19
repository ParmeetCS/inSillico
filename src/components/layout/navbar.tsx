"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    FlaskConical,
    LayoutDashboard,
    FolderOpen,
    Atom,
    Activity,
    FileBarChart,
    Plus,
    Bell,
    LogOut,
    User,
    Menu,
    X,
    Coins,
    Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderOpen },
    { href: "/molecules/new", label: "Molecules", icon: Atom },
    { href: "/reactions", label: "Reaction Lab", icon: FlaskConical },
    { href: "/simulations", label: "Simulations", icon: Activity },
    { href: "/results", label: "Results", icon: FileBarChart },
    { href: "/copilot", label: "AI Copilot", icon: Sparkles },
];

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, loading, signOut } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const isAuthPage = pathname?.startsWith("/auth");

    const handleSignOut = async () => {
        haptic("medium");
        await signOut();
        toast("Signed out successfully", "info");
        router.push("/");
    };

    if (isAuthPage) return null;

    return (
        <header
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "var(--header-height)",
                zIndex: 50,
                background: "rgba(2, 6, 23, 0.85)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderBottom: "1px solid var(--glass-border)",
            }}
        >
            <nav
                style={{
                    maxWidth: 1400,
                    margin: "0 auto",
                    padding: "0 24px",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                {/* Logo */}
                <Link
                    href="/"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        textDecoration: "none",
                        color: "var(--text-primary)",
                    }}
                >
                    <div
                        style={{
                            width: 110,
                            height: 130,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                        }}
                    >
                        <Image
                            src="/insilico-logo.png"
                            alt="InSilico"
                            width={110}
                            height={130}
                            style={{ objectFit: "contain" }}
                            priority
                        />
                    </div>
                </Link>

                {/* Desktop Nav Links */}
                {user && (
                    <div
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                        className="desktop-nav"
                    >
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                            const Icon = link.icon;
                            return (
                                <motion.div key={link.href} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                                    <Link
                                        href={link.href}
                                        onClick={() => haptic("selection")}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            padding: "8px 14px",
                                            borderRadius: 10,
                                            fontSize: "0.85rem",
                                            fontWeight: 500,
                                            textDecoration: "none",
                                            color: isActive ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                            background: isActive ? "rgba(59, 130, 246, 0.1)" : "transparent",
                                            transition: "all 0.2s ease",
                                        }}
                                    >
                                        <Icon size={16} />
                                        {link.label}
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Right Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {user ? (
                        <>
                            {/* Credits Badge */}
                            {profile && (
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "6px 12px",
                                        borderRadius: 10,
                                        background: "rgba(59, 130, 246, 0.08)",
                                        border: "1px solid rgba(59, 130, 246, 0.2)",
                                        fontSize: "0.8rem",
                                        fontWeight: 600,
                                        color: "var(--accent-blue-light)",
                                    }}
                                    className="desktop-nav"
                                >
                                    <Coins size={14} />
                                    {profile.credits} credits
                                </div>
                            )}

                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Link
                                    href="/molecules/new"
                                    className="btn-primary desktop-nav"
                                    onClick={() => haptic("medium")}
                                >
                                    <Plus size={16} />
                                    New Simulation
                                </Link>
                            </motion.div>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 10,
                                    background: "transparent",
                                    border: "1px solid var(--glass-border)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.2s ease",
                                }}
                                aria-label="Notifications"
                            >
                                <Bell size={18} />
                            </motion.button>

                            {/* User Avatar / Menu */}
                            <div style={{ position: "relative" }}>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => { setUserMenuOpen(!userMenuOpen); haptic("light"); }}
                                    style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: "50%",
                                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover` : "var(--gradient-accent)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: userMenuOpen ? "2px solid var(--accent-blue)" : "2px solid transparent",
                                        cursor: "pointer",
                                        transition: "border 0.2s ease",
                                    }}
                                >
                                    {!profile?.avatar_url && (
                                        <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "white" }}>
                                            {profile?.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U"}
                                        </span>
                                    )}
                                </motion.button>

                                {/* Dropdown */}
                                {userMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        style={{
                                            position: "absolute",
                                            top: "calc(100% + 8px)",
                                            right: 0,
                                            width: 220,
                                            background: "rgba(10, 15, 30, 0.95)",
                                            backdropFilter: "blur(16px)",
                                            border: "1px solid var(--glass-border)",
                                            borderRadius: 12,
                                            overflow: "hidden",
                                            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                        }}
                                    >
                                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--glass-border)" }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                                {profile?.full_name || "User"}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                                                {user.email}
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                                                <Coins size={12} style={{ color: "var(--accent-blue)" }} />
                                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-blue-light)" }}>
                                                    {profile?.credits ?? 0} credits remaining
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleSignOut}
                                            style={{
                                                width: "100%",
                                                padding: "12px 16px",
                                                background: "none",
                                                border: "none",
                                                color: "#ef4444",
                                                fontSize: "0.85rem",
                                                fontWeight: 500,
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                transition: "background 0.2s ease",
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                                        >
                                            <LogOut size={16} />
                                            Sign Out
                                        </button>
                                    </motion.div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {!loading && (
                                <>
                                    <Link
                                        href="/auth/login"
                                        className="btn-secondary desktop-nav"
                                        style={{ fontSize: "0.85rem" }}
                                    >
                                        Sign In
                                    </Link>
                                    <Link href="/auth/signup" className="btn-primary desktop-nav">
                                        Get Started
                                    </Link>
                                </>
                            )}
                        </>
                    )}

                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        style={{
                            display: "none",
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: "transparent",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        className="mobile-nav-toggle"
                        aria-label="Toggle navigation"
                    >
                        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </nav>

            {/* Mobile Nav Overlay */}
            {mobileOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "var(--header-height)",
                        left: 0,
                        right: 0,
                        background: "rgba(2, 6, 23, 0.95)",
                        backdropFilter: "blur(20px)",
                        padding: 16,
                        borderBottom: "1px solid var(--glass-border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                    }}
                >
                    {user ? (
                        <>
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={() => { setMobileOpen(false); haptic("selection"); }}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "12px 16px",
                                            borderRadius: 10,
                                            fontSize: "0.9rem",
                                            fontWeight: 500,
                                            textDecoration: "none",
                                            color: isActive ? "var(--accent-blue-light)" : "var(--text-secondary)",
                                            background: isActive ? "rgba(59, 130, 246, 0.1)" : "transparent",
                                        }}
                                    >
                                        <Icon size={18} />
                                        {link.label}
                                    </Link>
                                );
                            })}
                            <Link
                                href="/molecules/new"
                                className="btn-primary"
                                onClick={() => setMobileOpen(false)}
                                style={{ marginTop: 8, justifyContent: "center" }}
                            >
                                <Plus size={16} />
                                New Simulation
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/auth/login"
                                className="btn-secondary"
                                onClick={() => setMobileOpen(false)}
                                style={{ justifyContent: "center" }}
                            >
                                Sign In
                            </Link>
                            <Link
                                href="/auth/signup"
                                className="btn-primary"
                                onClick={() => setMobileOpen(false)}
                                style={{ justifyContent: "center" }}
                            >
                                Get Started
                            </Link>
                        </>
                    )}
                </div>
            )}

            <style jsx global>{`
        @media (max-width: 768px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-nav-toggle {
            display: flex !important;
          }
        }
      `}</style>
        </header>
    );
}
