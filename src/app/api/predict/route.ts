/**
 * Next.js API Route — Proxy to ML Prediction Server
 * 
 * POST /api/predict
 * Body: { smiles: string, model_type?: "xgboost" | "random_forest" }
 * 
 * Forwards predictions from the Python Flask ML backend (port 5001)
 * running QSPR v2.0 Ensemble (RandomForest + XGBoost, Morgan FP ECFP4).
 * 
 * Fallback: Uses client-side mock predictor if backend is unreachable.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateMockPrediction } from "@/lib/ml-mock";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "http://localhost:5001";

export async function POST(req: NextRequest) {
    let smiles = "";

    try {
        const body = await req.json();
        smiles = body.smiles;
        const { model_type = "xgboost" } = body;

        if (!smiles) {
            return NextResponse.json(
                { error: "Missing 'smiles' in request body" },
                { status: 400 }
            );
        }

        // Try to fetch from ML server with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

        try {
            const response = await fetch(`${ML_SERVER_URL}/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ smiles, model_type }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                // If the server returns an error (but is reachable), try to parse it
                // If it's a 500/404, we might also want to fallback to mock for demo purposes?
                // For now, let's respect the server's error unless it's a severe failure.
                if (response.status >= 500) {
                    throw new Error(`ML Server Error: ${response.statusText}`);
                }
                const err = await response.json().catch(() => ({ error: "ML server error" }));
                return NextResponse.json(err, { status: response.status });
            }

            const predictions = await response.json();
            return NextResponse.json(predictions);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            // Fallback to mock service
            console.warn("ML Server unreachable or timed out. Using mock fallback.", fetchError);
            const mockData = generateMockPrediction(smiles);
            return NextResponse.json(mockData);
        }

    } catch (error) {
        console.error("API Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
