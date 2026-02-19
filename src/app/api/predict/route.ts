/**
 * Next.js API Route — Proxy to ML Prediction Server
 * 
 * POST /api/predict
 * Body: { smiles: string, model_type?: "xgboost" | "random_forest" }
 * 
 * Forwards predictions from the Python Flask ML backend (port 5001)
 * running QSPR v2.0 Ensemble (RandomForest + XGBoost, Morgan FP ECFP4).
 */

import { NextRequest, NextResponse } from "next/server";

const ML_SERVER_URL = process.env.ML_BACKEND_URL || "http://localhost:5001";

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

        // Forward to ML server
        const response = await fetch(`${ML_SERVER_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ smiles, model_type }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: "ML server error" }));
            return NextResponse.json(err, { status: response.status });
        }

        const predictions = await response.json();
        return NextResponse.json(predictions);

    } catch (error) {
        console.error("ML Prediction error:", error);
        return NextResponse.json(
            { error: "Failed to connect to ML prediction server. Ensure the Python server is running on port 5001." },
            { status: 503 }
        );
    }
}
