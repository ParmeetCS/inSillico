"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface MoleculeSketcherProps {
    onSmilesChange?: (smiles: string) => void;
    initialSmiles?: string;
}

export default function MoleculeSketcher({
    onSmilesChange,
    initialSmiles,
}: MoleculeSketcherProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const ketcherRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const extractSmiles = useCallback(async () => {
        if (!ketcherRef.current) return;
        try {
            const smiles = await ketcherRef.current.getSmiles();
            if (smiles && onSmilesChange) {
                onSmilesChange(smiles);
            }
        } catch {
            // Empty structure or error — ignore
        }
    }, [onSmilesChange]);

    useEffect(() => {
        mountedRef.current = true;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        async function init() {
            if (!containerRef.current) return;

            try {
                // Dynamic imports — all in one Promise.all to avoid waterfall
                const [ketcherStandalone, ketcherReact, reactDom, react] = await Promise.all([
                    import("ketcher-standalone"),
                    import("ketcher-react"),
                    import("react-dom/client"),
                    import("react"),
                ]);

                if (!mountedRef.current || !containerRef.current) return;

                // Inject Ketcher CSS if not already loaded
                if (!document.getElementById("ketcher-css")) {
                    const link = document.createElement("link");
                    link.id = "ketcher-css";
                    link.rel = "stylesheet";
                    link.href = "/_next/static/css/ketcher-react.css";
                    // Fallback: try to load from node_modules via a blob URL
                    try {
                        // @ts-ignore
                        const cssModule = await import("ketcher-react/dist/index.css");
                        // If it works as a CSS module, great — otherwise we do nothing extra
                    } catch {
                        // CSS import failed — try inserting a blank style to avoid errors
                    }
                    document.head.appendChild(link);
                }

                const structServiceProvider = new ketcherStandalone.StandaloneStructServiceProvider();

                const root = reactDom.createRoot(containerRef.current);

                const EditorWrapper = () => {
                    return react.createElement(ketcherReact.Editor, {
                        staticResourcesUrl: "",
                        structServiceProvider,
                        onInit: (ketcher: any) => {
                            ketcherRef.current = ketcher;

                            if (initialSmiles) {
                                ketcher.setMolecule(initialSmiles).catch(() => { });
                            }

                            // Poll for changes every 2s
                            intervalId = setInterval(() => {
                                if (mountedRef.current) extractSmiles();
                            }, 2000);
                        },
                    } as any);
                };

                root.render(react.createElement(EditorWrapper));

                if (mountedRef.current) setLoading(false);
            } catch (err) {
                console.error("Ketcher init error:", err);
                if (mountedRef.current) {
                    setError("Failed to load molecule editor. You can still enter SMILES manually.");
                    setLoading(false);
                }
            }
        }

        init();

        return () => {
            mountedRef.current = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, [initialSmiles, extractSmiles]);

    return (
        <div style={{ position: "relative" }}>
            {loading && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(15, 23, 42, 0.9)",
                        borderRadius: 12,
                        zIndex: 10,
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <div
                            className="spin"
                            style={{
                                width: 32,
                                height: 32,
                                border: "3px solid var(--glass-border)",
                                borderTopColor: "var(--accent-blue)",
                                borderRadius: "50%",
                                margin: "0 auto 12px",
                            }}
                        />
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            Loading Molecule Editor...
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div
                    style={{
                        padding: "16px 20px",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: 12,
                        marginBottom: 12,
                        fontSize: "0.85rem",
                        color: "#f87171",
                    }}
                >
                    {error}
                </div>
            )}

            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: 450,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid var(--glass-border)",
                    background: "#1a2340",
                }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={extractSmiles}
                    style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                >
                    Extract SMILES
                </button>
            </div>
        </div>
    );
}
