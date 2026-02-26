/**
 * Next.js API Route — Proxy to ML Prediction Server
 * 
 * POST /api/predict
 * Body: { smiles: string, model_type?: "xgboost" | "random_forest" }
 * 
 * Forwards predictions from the Python Flask ML backend (Render deployment)
 * running QSPR v2.0 Ensemble (RandomForest + XGBoost, Morgan FP ECFP4).
 * 
 * No mock fallback — all predictions come from the real ML backend.
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "https://insillico.onrender.com";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { smiles, model_type = "xgboost" } = body;

        if (!smiles) {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Render free tier can cold-start in ~30–60s — use generous timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

        try {
            const response = await fetch(`${ML_SERVER_URL}/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles, model_type }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: `ML server error (${response.status})` }));
                return NextResponse.json(err, { status: response.status });
            }

            const predictions = await response.json();
            return NextResponse.json(predictions);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            const isAbort = fetchError instanceof DOMException && fetchError.name === "AbortError";
            console.error("ML Server error:", fetchError);
            return NextResponse.json(
                {
                    error: isAbort
                        ? "ML server timed out. The server may be waking up from sleep — please try again in 30 seconds."
                        : "ML server is unreachable. Please ensure the backend is running.",
                },
                { status: 503 }
            );
        }

    } catch (error) {
        console.error("API Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
