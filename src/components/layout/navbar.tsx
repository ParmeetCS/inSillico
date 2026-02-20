"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    FlaskConical,
    LayoutDashboard,
    FolderOpen,
    Atom,
    Activity,
    FileBarChart,
    Plus,
    LogOut,
    Menu,
    X,
    Coins,
    Sparkles,
    ChevronDown,
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
    const [scrolled, setScrolled] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isAuthPage = pathname?.startsWith("/auth");

    // Track scroll to add background intensity
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        haptic("medium");
        setUserMenuOpen(false);
        await signOut();
        toast("Signed out successfully", "info");
        router.push("/");
    };

    if (isAuthPage) return null;

    return (
<<<<<<< HEAD
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
                            width: 320,
                            height: 70,
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                        }}
                    >
                        <Image
                            src="/insilico-navbar-logo.svg"
                            alt="InSilico"
                            width={320}
                            height={70}
                            style={{ objectFit: "contain" }}
                            priority
                        />
                    </div>
                </Link>
=======
        <>
            <header className={`navbar-header ${scrolled ? "navbar-scrolled" : ""}`}>
                {/* Animated top glow line */}
                <div className="navbar-glow-line" />
>>>>>>> 16ebbbfa46c389a16af5c73efe6c81a860fda2ed

                <nav className="navbar-inner">
                    {/* Logo */}
                    <Link href="/" className="navbar-logo-link" onClick={() => haptic("light")}>
                        <motion.div
                            className="navbar-logo-container"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <div className="navbar-logo-glow" />
                            <Image
                                src="/insilico-logo-new.png"
                                alt="InSilico"
                                width={40}
                                height={40}
                                className="navbar-logo-img"
                                priority
                            />
                        </motion.div>
                        <div className="navbar-brand">
                            <span className="navbar-brand-name">InSilico</span>
                            <span className="navbar-brand-tag">Formulator</span>
                        </div>
                    </Link>

                    {/* Desktop Nav Links */}
                    {user && (
                        <div className="navbar-links desktop-nav">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                                const Icon = link.icon;
                                return (
                                    <motion.div key={link.href} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
                                        <Link
                                            href={link.href}
                                            onClick={() => haptic("selection")}
                                            className={`navbar-link ${isActive ? "navbar-link-active" : ""}`}
                                        >
                                            <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                                            <span>{link.label}</span>
                                            {isActive && (
                                                <motion.div
                                                    className="navbar-link-indicator"
                                                    layoutId="navIndicator"
                                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                                />
                                            )}
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}

                    {/* Right Actions */}
                    <div className="navbar-actions">
                        {user ? (
                            <>
                                {/* Credits Badge */}
                                {profile && (
                                    <motion.div
                                        className="navbar-credits desktop-nav"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <div className="navbar-credits-icon">
                                            <Coins size={13} />
                                        </div>
                                        <span className="navbar-credits-value">{profile.credits}</span>
                                        <span className="navbar-credits-label">credits</span>
                                    </motion.div>
                                )}

                                {/* New Simulation CTA */}
                                <motion.div whileHover={{ scale: 1.05, y: -1 }} whileTap={{ scale: 0.95 }}>
                                    <Link
                                        href="/molecules/new"
                                        className="navbar-cta desktop-nav"
                                        onClick={() => haptic("medium")}
                                    >
                                        <Plus size={15} strokeWidth={2.5} />
                                        <span>New Sim</span>
                                    </Link>
                                </motion.div>

                                {/* User Avatar / Menu */}
                                <div ref={dropdownRef} style={{ position: "relative" }}>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => { setUserMenuOpen(!userMenuOpen); haptic("light"); }}
                                        className={`navbar-avatar ${userMenuOpen ? "navbar-avatar-active" : ""}`}
                                    >
                                        {profile?.avatar_url ? (
                                            <Image src={profile.avatar_url} alt="Avatar" width={34} height={34} className="navbar-avatar-img" />
                                        ) : (
                                            <span className="navbar-avatar-letter">
                                                {profile?.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U"}
                                            </span>
                                        )}
                                        <ChevronDown
                                            size={12}
                                            className="navbar-avatar-chevron"
                                            style={{ transform: userMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                                        />
                                    </motion.button>

                                    {/* Dropdown */}
                                    <AnimatePresence>
                                        {userMenuOpen && (
                                            <motion.div
                                                className="navbar-dropdown"
                                                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                            >
                                                <div className="navbar-dropdown-header">
                                                    <div className="navbar-dropdown-avatar-row">
                                                        <div className="navbar-dropdown-mini-avatar">
                                                            {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                                                        </div>
                                                        <div>
                                                            <div className="navbar-dropdown-name">
                                                                {profile?.full_name || "User"}
                                                            </div>
                                                            <div className="navbar-dropdown-email">
                                                                {user.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="navbar-dropdown-credits">
                                                        <Coins size={13} />
                                                        <span>{profile?.credits ?? 0} credits remaining</span>
                                                    </div>
                                                </div>
                                                <div className="navbar-dropdown-divider" />
                                                <button
                                                    onClick={handleSignOut}
                                                    className="navbar-dropdown-signout"
                                                >
                                                    <LogOut size={15} />
                                                    Sign Out
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </>
                        ) : (
                            <>
                                {!loading && (
                                    <div className="navbar-auth-buttons desktop-nav">
                                        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                                            <Link href="/auth/login" className="navbar-signin">
                                                Sign In
                                            </Link>
                                        </motion.div>
                                        <motion.div whileHover={{ scale: 1.05, y: -1 }} whileTap={{ scale: 0.95 }}>
                                            <Link href="/auth/signup" className="navbar-getstarted">
                                                <Sparkles size={14} />
                                                Get Started
                                            </Link>
                                        </motion.div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Mobile hamburger */}
                        <motion.button
                            onClick={() => { setMobileOpen(!mobileOpen); haptic("light"); }}
                            className="mobile-nav-toggle"
                            aria-label="Toggle navigation"
                            whileTap={{ scale: 0.9 }}
                        >
                            <AnimatePresence mode="wait">
                                {mobileOpen ? (
                                    <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                                        <X size={20} />
                                    </motion.div>
                                ) : (
                                    <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                                        <Menu size={20} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    </div>
                </nav>
            </header>

            {/* Mobile Nav Overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            className="mobile-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                        />
                        {/* Panel */}
                        <motion.div
                            className="mobile-panel"
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", stiffness: 400, damping: 40 }}
                        >
                            <div className="mobile-panel-header">
                                <Image
                                    src="/insilico-logo-new.png"
                                    alt="InSilico"
                                    width={32}
                                    height={32}
                                    className="navbar-logo-img"
                                />
                                <span className="navbar-brand-name" style={{ fontSize: "1.1rem" }}>InSilico</span>
                            </div>
                            <div className="mobile-panel-links">
                                {user ? (
                                    <>
                                        {navLinks.map((link, i) => {
                                            const isActive = pathname === link.href;
                                            const Icon = link.icon;
                                            return (
                                                <motion.div
                                                    key={link.href}
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.05 }}
                                                >
                                                    <Link
                                                        href={link.href}
                                                        onClick={() => { setMobileOpen(false); haptic("selection"); }}
                                                        className={`mobile-link ${isActive ? "mobile-link-active" : ""}`}
                                                    >
                                                        <Icon size={18} />
                                                        {link.label}
                                                    </Link>
                                                </motion.div>
                                            );
                                        })}
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.4 }}
                                        >
                                            <Link
                                                href="/molecules/new"
                                                className="navbar-cta"
                                                onClick={() => setMobileOpen(false)}
                                                style={{ marginTop: 12, justifyContent: "center", width: "100%" }}
                                            >
                                                <Plus size={16} />
                                                New Simulation
                                            </Link>
                                        </motion.div>
                                    </>
                                ) : (
                                    <>
                                        <Link
                                            href="/auth/login"
                                            className="navbar-signin"
                                            onClick={() => setMobileOpen(false)}
                                            style={{ justifyContent: "center", width: "100%" }}
                                        >
                                            Sign In
                                        </Link>
                                        <Link
                                            href="/auth/signup"
                                            className="navbar-getstarted"
                                            onClick={() => setMobileOpen(false)}
                                            style={{ justifyContent: "center", width: "100%", marginTop: 8 }}
                                        >
                                            <Sparkles size={14} />
                                            Get Started
                                        </Link>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <style jsx global>{`
                /* ========== NAVBAR STYLES ========== */

                .navbar-header {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 64px;
                    z-index: 50;
                    background: rgba(2, 6, 23, 0.6);
                    backdrop-filter: blur(24px) saturate(1.8);
                    -webkit-backdrop-filter: blur(24px) saturate(1.8);
                    border-bottom: 1px solid rgba(148, 163, 184, 0.06);
                    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .navbar-scrolled {
                    background: rgba(2, 6, 23, 0.92);
                    border-bottom-color: rgba(148, 163, 184, 0.12);
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3), 0 0 40px rgba(59, 130, 246, 0.04);
                }

                .navbar-glow-line {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(
                        90deg,
                        transparent 0%,
                        rgba(59, 130, 246, 0.4) 20%,
                        rgba(139, 92, 246, 0.6) 50%,
                        rgba(59, 130, 246, 0.4) 80%,
                        transparent 100%
                    );
                    opacity: 0.7;
                }

                .navbar-inner {
                    max-width: 1400px;
                    margin: 0 auto;
                    padding: 0 24px;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                }

                /* Logo */
                .navbar-logo-link {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    text-decoration: none;
                    color: var(--text-primary);
                    flex-shrink: 0;
                }

                .navbar-logo-container {
                    position: relative;
                    width: 42px;
                    height: 42px;
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(139, 92, 246, 0.25);
                    box-shadow: 0 0 20px rgba(139, 92, 246, 0.12), inset 0 0 12px rgba(59, 130, 246, 0.06);
                }

                .navbar-logo-glow {
                    position: absolute;
                    inset: -2px;
                    border-radius: 14px;
                    background: conic-gradient(
                        from 0deg,
                        transparent 0%,
                        rgba(59, 130, 246, 0.3) 25%,
                        transparent 50%,
                        rgba(139, 92, 246, 0.3) 75%,
                        transparent 100%
                    );
                    animation: logo-rotate 8s linear infinite;
                    opacity: 0.5;
                    z-index: -1;
                }

                @keyframes logo-rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .navbar-logo-img {
                    width: 34px;
                    height: 34px;
                    object-fit: contain;
                    border-radius: 8px;
                }

                .navbar-brand {
                    display: flex;
                    flex-direction: column;
                    line-height: 1.15;
                }

                .navbar-brand-name {
                    font-size: 1.15rem;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                    background: linear-gradient(135deg, #f1f5f9, #94a3b8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .navbar-brand-tag {
                    font-size: 0.6rem;
                    font-weight: 500;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    color: var(--accent-purple);
                    opacity: 0.8;
                }

                /* Nav Links */
                .navbar-links {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    margin: 0 auto;
                    padding: 0 8px;
                }

                .navbar-link {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 7px 13px;
                    border-radius: 10px;
                    font-size: 0.82rem;
                    font-weight: 500;
                    text-decoration: none;
                    color: var(--text-muted);
                    transition: all 0.2s ease;
                    white-space: nowrap;
                }

                .navbar-link:hover {
                    color: var(--text-secondary);
                    background: rgba(148, 163, 184, 0.06);
                }

                .navbar-link-active {
                    color: var(--accent-blue-light) !important;
                    background: rgba(59, 130, 246, 0.1) !important;
                }

                .navbar-link-indicator {
                    position: absolute;
                    bottom: -1px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 16px;
                    height: 2px;
                    border-radius: 2px;
                    background: var(--gradient-accent);
                    box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
                }

                /* Right Actions */
                .navbar-actions {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-shrink: 0;
                }

                /* Credits */
                .navbar-credits {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 12px;
                    border-radius: 20px;
                    background: rgba(59, 130, 246, 0.06);
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    cursor: default;
                    transition: all 0.2s ease;
                }

                .navbar-credits:hover {
                    background: rgba(59, 130, 246, 0.1);
                    border-color: rgba(59, 130, 246, 0.25);
                }

                .navbar-credits-icon {
                    color: var(--accent-blue);
                    display: flex;
                    align-items: center;
                }

                .navbar-credits-value {
                    font-size: 0.78rem;
                    font-weight: 700;
                    color: var(--accent-blue-light);
                }

                .navbar-credits-label {
                    font-size: 0.72rem;
                    font-weight: 500;
                    color: var(--text-muted);
                }

                /* CTA Button */
                .navbar-cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 7px 16px;
                    border-radius: 10px;
                    font-size: 0.82rem;
                    font-weight: 600;
                    text-decoration: none;
                    color: white;
                    background: var(--gradient-accent);
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 12px rgba(59, 130, 246, 0.25);
                    white-space: nowrap;
                }

                .navbar-cta:hover {
                    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                }

                /* Avatar */
                .navbar-avatar {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px;
                    border-radius: 22px;
                    background: transparent;
                    border: 2px solid rgba(148, 163, 184, 0.12);
                    cursor: pointer;
                    transition: all 0.25s ease;
                }

                .navbar-avatar:hover,
                .navbar-avatar-active {
                    border-color: rgba(139, 92, 246, 0.5);
                    box-shadow: 0 0 16px rgba(139, 92, 246, 0.15);
                }

                .navbar-avatar-img {
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .navbar-avatar-letter {
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    background: var(--gradient-accent);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.75rem;
                    color: white;
                }

                .navbar-avatar-chevron {
                    color: var(--text-muted);
                    transition: transform 0.25s ease;
                    margin-right: 2px;
                }

                /* Dropdown */
                .navbar-dropdown {
                    position: absolute;
                    top: calc(100% + 10px);
                    right: 0;
                    width: 240px;
                    background: rgba(10, 15, 30, 0.97);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    border-radius: 14px;
                    overflow: hidden;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 1px rgba(139, 92, 246, 0.2);
                }

                .navbar-dropdown-header {
                    padding: 16px;
                }

                .navbar-dropdown-avatar-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .navbar-dropdown-mini-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: var(--gradient-accent);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.85rem;
                    color: white;
                    flex-shrink: 0;
                }

                .navbar-dropdown-name {
                    font-weight: 600;
                    font-size: 0.88rem;
                    color: var(--text-primary);
                }

                .navbar-dropdown-email {
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-top: 1px;
                    max-width: 170px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .navbar-dropdown-credits {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border-radius: 8px;
                    background: rgba(59, 130, 246, 0.08);
                    border: 1px solid rgba(59, 130, 246, 0.12);
                }

                .navbar-dropdown-credits svg {
                    color: var(--accent-blue);
                }

                .navbar-dropdown-credits span {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--accent-blue-light);
                }

                .navbar-dropdown-divider {
                    height: 1px;
                    background: rgba(148, 163, 184, 0.08);
                }

                .navbar-dropdown-signout {
                    width: 100%;
                    padding: 12px 16px;
                    background: none;
                    border: none;
                    color: #ef4444;
                    font-size: 0.84rem;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: background 0.2s ease;
                }

                .navbar-dropdown-signout:hover {
                    background: rgba(239, 68, 68, 0.08);
                }

                /* Auth Buttons (Logged Out) */
                .navbar-auth-buttons {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .navbar-signin {
                    display: inline-flex;
                    align-items: center;
                    padding: 7px 18px;
                    border-radius: 10px;
                    font-size: 0.84rem;
                    font-weight: 500;
                    text-decoration: none;
                    color: var(--text-secondary);
                    background: transparent;
                    border: 1px solid rgba(148, 163, 184, 0.12);
                    transition: all 0.25s ease;
                }

                .navbar-signin:hover {
                    color: var(--text-primary);
                    border-color: rgba(148, 163, 184, 0.25);
                    background: rgba(148, 163, 184, 0.06);
                }

                .navbar-getstarted {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 7px 20px;
                    border-radius: 10px;
                    font-size: 0.84rem;
                    font-weight: 600;
                    text-decoration: none;
                    color: white;
                    background: var(--gradient-accent);
                    border: none;
                    box-shadow: 0 2px 16px rgba(59, 130, 246, 0.3);
                    transition: all 0.3s ease;
                }

                .navbar-getstarted:hover {
                    box-shadow: 0 4px 24px rgba(59, 130, 246, 0.45);
                    transform: translateY(-1px);
                }

                /* Mobile Toggle */
                .mobile-nav-toggle {
                    display: none;
                    width: 38px;
                    height: 38px;
                    border-radius: 10px;
                    background: rgba(148, 163, 184, 0.06);
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    color: var(--text-secondary);
                    cursor: pointer;
                    align-items: center;
                    justify-content: center;
                }

                /* Mobile Panel */
                .mobile-backdrop {
                    display: none;
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 60;
                }

                .mobile-panel {
                    display: none;
                    position: fixed;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    width: 300px;
                    max-width: 85vw;
                    background: rgba(5, 10, 25, 0.98);
                    backdrop-filter: blur(24px);
                    border-left: 1px solid rgba(148, 163, 184, 0.08);
                    z-index: 70;
                    overflow-y: auto;
                }

                .mobile-panel-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 20px 20px 16px;
                    border-bottom: 1px solid rgba(148, 163, 184, 0.06);
                }

                .mobile-panel-links {
                    padding: 12px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .mobile-link {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 14px;
                    border-radius: 10px;
                    font-size: 0.92rem;
                    font-weight: 500;
                    text-decoration: none;
                    color: var(--text-secondary);
                    transition: all 0.2s ease;
                }

                .mobile-link:hover {
                    background: rgba(148, 163, 184, 0.06);
                    color: var(--text-primary);
                }

                .mobile-link-active {
                    color: var(--accent-blue-light) !important;
                    background: rgba(59, 130, 246, 0.1) !important;
                }

                /* Responsive */
                @media (max-width: 900px) {
                    .desktop-nav {
                        display: none !important;
                    }
                    .mobile-nav-toggle {
                        display: flex !important;
                    }
                    .mobile-backdrop,
                    .mobile-panel {
                        display: block;
                    }
                }

                @media (max-width: 1100px) {
                    .navbar-link span {
                        display: none;
                    }
                    .navbar-link {
                        padding: 7px 10px;
                    }
                    .navbar-credits-label {
                        display: none;
                    }
                }
            `}</style>
        </>
    );
}
