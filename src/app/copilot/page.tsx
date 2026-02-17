"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Send,
    Bot,
    User,
    Sparkles,
    Loader2,
    FlaskConical,
    Atom,
    Beaker,
    Shield,
    Lightbulb,
    Copy,
    Check,
    Trash2,
    ChevronDown,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";

/* ─── Types ─── */
interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

/* ─── Suggested Prompts ─── */
const suggestedPrompts = [
    {
        icon: Atom,
        label: "Find similar molecule",
        prompt: "Find me a molecule similar to Aspirin but with lower toxicity",
        color: "var(--accent-blue)",
    },
    {
        icon: Beaker,
        label: "Improve solubility",
        prompt: "Suggest modifications to improve the aqueous solubility of Ibuprofen (SMILES: CC(C)Cc1ccc(cc1)C(C)C(=O)O)",
        color: "var(--accent-cyan)",
    },
    {
        icon: Shield,
        label: "Toxicity analysis",
        prompt: "Analyze the toxicity profile of my most recent tested compounds and highlight any concerns",
        color: "var(--accent-green)",
    },
    {
        icon: Lightbulb,
        label: "Best bioavailability",
        prompt: "Which of my tested compounds has the best predicted bioavailability and why?",
        color: "var(--accent-purple)",
    },
];

/* ─── Markdown-light renderer ─── */
function renderMarkdown(text: string) {
    // Split into lines and process
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent = "";
    let codeLanguage = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                elements.push(
                    <pre
                        key={`code-${i}`}
                        style={{
                            background: "rgba(0,0,0,0.4)",
                            borderRadius: 8,
                            padding: "12px 16px",
                            overflowX: "auto",
                            fontSize: "0.82rem",
                            lineHeight: 1.6,
                            border: "1px solid var(--glass-border)",
                            margin: "8px 0",
                        }}
                    >
                        <code>{codeContent.trim()}</code>
                    </pre>
                );
                codeContent = "";
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
                codeLanguage = line.slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent += line + "\n";
            continue;
        }

        // Headers
        if (line.startsWith("### ")) {
            elements.push(
                <h3
                    key={i}
                    style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        margin: "16px 0 8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-outfit), sans-serif",
                    }}
                >
                    {processInline(line.slice(4))}
                </h3>
            );
        } else if (line.startsWith("## ")) {
            elements.push(
                <h2
                    key={i}
                    style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        margin: "16px 0 8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-outfit), sans-serif",
                    }}
                >
                    {processInline(line.slice(3))}
                </h2>
            );
        } else if (line.startsWith("# ")) {
            elements.push(
                <h1
                    key={i}
                    style={{
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        margin: "16px 0 8px",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-outfit), sans-serif",
                    }}
                >
                    {processInline(line.slice(2))}
                </h1>
            );
        }
        // Bullet points
        else if (line.match(/^[-*]\s/)) {
            elements.push(
                <div
                    key={i}
                    style={{
                        display: "flex",
                        gap: 8,
                        paddingLeft: 4,
                        margin: "4px 0",
                        lineHeight: 1.6,
                    }}
                >
                    <span style={{ color: "var(--accent-blue)", flexShrink: 0 }}>•</span>
                    <span>{processInline(line.slice(2))}</span>
                </div>
            );
        }
        // Numbered list
        else if (line.match(/^\d+\.\s/)) {
            const match = line.match(/^(\d+)\.\s(.*)$/);
            if (match) {
                elements.push(
                    <div
                        key={i}
                        style={{
                            display: "flex",
                            gap: 8,
                            paddingLeft: 4,
                            margin: "4px 0",
                            lineHeight: 1.6,
                        }}
                    >
                        <span style={{ color: "var(--accent-blue)", flexShrink: 0, fontWeight: 600 }}>{match[1]}.</span>
                        <span>{processInline(match[2])}</span>
                    </div>
                );
            }
        }
        // Table rows (basic support)
        else if (line.startsWith("|")) {
            const cells = line
                .split("|")
                .filter((c) => c.trim())
                .map((c) => c.trim());
            const isSeparator = cells.every((c) => /^[-:]+$/.test(c));
            if (!isSeparator) {
                elements.push(
                    <div
                        key={i}
                        style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
                            gap: 1,
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: i === 0 ? "6px 6px 0 0" : 0,
                            fontSize: "0.82rem",
                        }}
                    >
                        {cells.map((cell, j) => (
                            <div
                                key={j}
                                style={{
                                    padding: "6px 10px",
                                    background: "rgba(0,0,0,0.2)",
                                    fontWeight: i === 0 ? 600 : 400,
                                }}
                            >
                                {processInline(cell)}
                            </div>
                        ))}
                    </div>
                );
            }
        }
        // Empty line
        else if (line.trim() === "") {
            elements.push(<div key={i} style={{ height: 8 }} />);
        }
        // Regular paragraph
        else {
            elements.push(
                <p key={i} style={{ margin: "4px 0", lineHeight: 1.7 }}>
                    {processInline(line)}
                </p>
            );
        }
    }

    return elements;
}

/* ─── Inline markdown: bold, italic, code, links ─── */
function processInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    // Order: bold, inline code, italic
    const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
            // Bold
            parts.push(
                <strong key={match.index} style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {match[2]}
                </strong>
            );
        } else if (match[3]) {
            // Inline code
            parts.push(
                <code
                    key={match.index}
                    style={{
                        background: "rgba(59,130,246,0.15)",
                        color: "var(--accent-blue-light)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: "0.85em",
                        fontFamily: "monospace",
                    }}
                >
                    {match[4]}
                </code>
            );
        } else if (match[5]) {
            // Italic
            parts.push(
                <em key={match.index} style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>
                    {match[6]}
                </em>
            );
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

/* ─── Main Page Component ─── */
export default function CopilotPage() {
    const { user, profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auth guard
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, authLoading, router]);

    // Auto-resize textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
    };

    // Send message
    const sendMessage = async (content?: string) => {
        const messageText = content || input.trim();
        if (!messageText || isLoading) return;

        haptic("medium");

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: "user",
            content: messageText,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        if (inputRef.current) {
            inputRef.current.style.height = "auto";
        }
        setIsLoading(true);

        try {
            const allMessages = [...messages, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const res = await fetch("/api/copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: allMessages,
                    userId: user?.id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to get response");
            }

            const assistantMessage: Message = {
                id: `asst-${Date.now()}`,
                role: "assistant",
                content: data.reply,
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
            haptic("light");
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Something went wrong";
            toast(errorMsg, "error");

            const errorMessage: Message = {
                id: `err-${Date.now()}`,
                role: "assistant",
                content: `⚠️ ${errorMsg}. Please try again.`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // Keyboard submit
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Copy message
    const copyMessage = (id: string, content: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        haptic("light");
        toast("Copied to clipboard", "info");
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Clear chat
    const clearChat = () => {
        setMessages([]);
        haptic("medium");
        toast("Chat cleared", "info");
    };

    if (authLoading) {
        return (
            <div className="page-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
                <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--accent-blue)" }} />
            </div>
        );
    }

    return (
        <div
            className="page-container"
            style={{
                display: "flex",
                flexDirection: "column",
                height: "calc(100vh - var(--header-height))",
                paddingBottom: 0,
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingBottom: 16,
                    flexShrink: 0,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: "var(--gradient-accent)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 0 24px rgba(59,130,246,0.3)",
                        }}
                    >
                        <Sparkles size={22} color="white" />
                    </div>
                    <div>
                        <h1
                            style={{
                                fontSize: "1.3rem",
                                fontWeight: 700,
                                fontFamily: "var(--font-outfit), sans-serif",
                                letterSpacing: "-0.02em",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            AI Drug Discovery Copilot
                            <span
                                style={{
                                    fontSize: "0.65rem",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    background: "rgba(139,92,246,0.15)",
                                    color: "var(--accent-purple)",
                                    fontWeight: 600,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                }}
                            >
                                Beta
                            </span>
                        </h1>
                        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Your AI-powered pharmaceutical research assistant
                        </p>
                    </div>
                </div>

                {messages.length > 0 && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={clearChat}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 14px",
                            borderRadius: 10,
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.2)",
                            color: "var(--accent-red)",
                            fontSize: "0.82rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                        }}
                    >
                        <Trash2 size={14} />
                        Clear
                    </motion.button>
                )}
            </div>

            {/* Chat Area */}
            <div
                ref={chatContainerRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    paddingRight: 4,
                    marginBottom: 16,
                }}
            >
                {messages.length === 0 ? (
                    /* ─── Empty State ─── */
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            gap: 32,
                            opacity: 0.95,
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            style={{ textAlign: "center" }}
                        >
                            <div
                                style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: 24,
                                    background: "var(--gradient-accent)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    margin: "0 auto 20px",
                                    boxShadow: "0 0 40px rgba(59,130,246,0.3), 0 0 80px rgba(139,92,246,0.15)",
                                }}
                            >
                                <Bot size={40} color="white" />
                            </div>
                            <h2
                                style={{
                                    fontSize: "1.4rem",
                                    fontWeight: 700,
                                    fontFamily: "var(--font-outfit), sans-serif",
                                    marginBottom: 8,
                                }}
                            >
                                How can I help with your research?
                            </h2>
                            <p
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.9rem",
                                    maxWidth: 480,
                                    lineHeight: 1.6,
                                }}
                            >
                                Ask me about molecular properties, drug-likeness, toxicity, solubility optimization, or explore your compound library.
                            </p>
                        </motion.div>

                        {/* Suggested Prompts */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                                gap: 12,
                                width: "100%",
                                maxWidth: 640,
                            }}
                        >
                            {suggestedPrompts.map((prompt, idx) => {
                                const Icon = prompt.icon;
                                return (
                                    <motion.button
                                        key={idx}
                                        whileHover={{ scale: 1.02, borderColor: prompt.color }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => sendMessage(prompt.prompt)}
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: 12,
                                            padding: "14px 16px",
                                            borderRadius: 14,
                                            background: "var(--glass-bg)",
                                            border: "1px solid var(--glass-border)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            color: "var(--text-primary)",
                                            transition: "all 0.2s ease",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 10,
                                                background: `${prompt.color}15`,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <Icon size={17} style={{ color: prompt.color }} />
                                        </div>
                                        <div>
                                            <div
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: "0.82rem",
                                                    marginBottom: 4,
                                                }}
                                            >
                                                {prompt.label}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--text-muted)",
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                {prompt.prompt.length > 60
                                                    ? prompt.prompt.slice(0, 60) + "..."
                                                    : prompt.prompt}
                                            </div>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </div>
                ) : (
                    /* ─── Messages ─── */
                    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 16 }}>
                        <AnimatePresence>
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                    style={{
                                        display: "flex",
                                        gap: 12,
                                        alignItems: "flex-start",
                                        maxWidth: msg.role === "user" ? "85%" : "100%",
                                        marginLeft: msg.role === "user" ? "auto" : 0,
                                    }}
                                >
                                    {msg.role === "assistant" && (
                                        <div
                                            style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 10,
                                                background: "var(--gradient-accent)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                marginTop: 2,
                                            }}
                                        >
                                            <Bot size={18} color="white" />
                                        </div>
                                    )}

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                padding: msg.role === "user" ? "12px 16px" : "16px 20px",
                                                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                                                background:
                                                    msg.role === "user"
                                                        ? "rgba(59,130,246,0.15)"
                                                        : "var(--glass-bg)",
                                                border: `1px solid ${msg.role === "user" ? "rgba(59,130,246,0.25)" : "var(--glass-border)"}`,
                                                fontSize: "0.88rem",
                                                lineHeight: 1.7,
                                                color: "var(--text-primary)",
                                            }}
                                        >
                                            {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                                        </div>

                                        {/* Message actions */}
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                marginTop: 6,
                                                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontSize: "0.7rem",
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                            {msg.role === "assistant" && (
                                                <button
                                                    onClick={() => copyMessage(msg.id, msg.content)}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4,
                                                        padding: "3px 8px",
                                                        borderRadius: 6,
                                                        background: "transparent",
                                                        border: "1px solid transparent",
                                                        color: "var(--text-muted)",
                                                        fontSize: "0.7rem",
                                                        cursor: "pointer",
                                                        transition: "all 0.2s ease",
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                                                        e.currentTarget.style.borderColor = "var(--glass-border)";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = "transparent";
                                                        e.currentTarget.style.borderColor = "transparent";
                                                    }}
                                                >
                                                    {copiedId === msg.id ? (
                                                        <>
                                                            <Check size={11} /> Copied
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={11} /> Copy
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {msg.role === "user" && (
                                        <div
                                            style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 10,
                                                background: "rgba(59,130,246,0.2)",
                                                border: "1px solid rgba(59,130,246,0.3)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                marginTop: 2,
                                            }}
                                        >
                                            <User size={16} style={{ color: "var(--accent-blue-light)" }} />
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Typing indicator */}
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                            >
                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 10,
                                        background: "var(--gradient-accent)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                    }}
                                >
                                    <Bot size={18} color="white" />
                                </div>
                                <div
                                    style={{
                                        padding: "16px 20px",
                                        borderRadius: "4px 16px 16px 16px",
                                        background: "var(--glass-bg)",
                                        border: "1px solid var(--glass-border)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                        {[0, 1, 2].map((i) => (
                                            <motion.div
                                                key={i}
                                                animate={{
                                                    y: [0, -6, 0],
                                                    opacity: [0.4, 1, 0.4],
                                                }}
                                                transition={{
                                                    duration: 0.8,
                                                    repeat: Infinity,
                                                    delay: i * 0.15,
                                                }}
                                                style={{
                                                    width: 7,
                                                    height: 7,
                                                    borderRadius: "50%",
                                                    background: "var(--accent-blue)",
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: "0.82rem",
                                            color: "var(--text-muted)",
                                            marginLeft: 4,
                                        }}
                                    >
                                        Analyzing...
                                    </span>
                                </div>
                            </motion.div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div
                style={{
                    flexShrink: 0,
                    paddingTop: 8,
                    paddingBottom: 20,
                    borderTop: "1px solid var(--glass-border)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-end",
                        background: "var(--glass-bg)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: 16,
                        padding: "8px 8px 8px 16px",
                        transition: "border-color 0.3s ease",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--glass-border)")}
                >
                    <FlaskConical
                        size={18}
                        style={{
                            color: "var(--text-muted)",
                            flexShrink: 0,
                            marginBottom: 10,
                        }}
                    />
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about molecules, properties, drug design..."
                        rows={1}
                        style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "var(--text-primary)",
                            fontSize: "0.9rem",
                            lineHeight: 1.5,
                            resize: "none",
                            fontFamily: "inherit",
                            maxHeight: 150,
                            paddingTop: 6,
                            paddingBottom: 6,
                        }}
                        disabled={isLoading}
                    />
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || isLoading}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: input.trim() && !isLoading ? "var(--gradient-accent)" : "rgba(255,255,255,0.05)",
                            border: "none",
                            cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "background 0.2s ease",
                        }}
                    >
                        {isLoading ? (
                            <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
                        ) : (
                            <Send size={18} color={input.trim() ? "white" : "var(--text-muted)"} />
                        )}
                    </motion.button>
                </div>
                <p
                    style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        textAlign: "center",
                        marginTop: 8,
                        opacity: 0.7,
                    }}
                >
                    InSilico Copilot can make mistakes. Always verify critical pharmaceutical data independently.
                </p>
            </div>
        </div>
    );
}
