/**
 * Next.js API Route — Save ML Prediction Results to Supabase
 * 
 * POST /api/predict/save
 * Body: {
 *   smiles: string,
 *   molecule_name?: string,
 *   formula?: string,
 *   molecular_weight?: number,
 *   properties: { logp, pka, solubility, tpsa, bioavailability, toxicity },
 *   toxicity_screening?: { herg_inhibition, ames_mutagenicity, hepatotoxicity },
 *   confidence?: number,
 *   runtime_ms?: number,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            smiles,
            molecule_name,
            formula,
            molecular_weight,
            properties,
            toxicity_screening,
            confidence,
            runtime_ms,
        } = body;

        if (!smiles || !properties) {
            return NextResponse.json(
                { error: "Missing required fields: 'smiles' and 'properties'" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Build the record to insert
        const record = {
            smiles,
            molecule_name: molecule_name || formula || "Unknown",
            formula: formula || null,
            molecular_weight: molecular_weight || null,
            properties: properties, // full properties object from ML server
            toxicity_screening: toxicity_screening || null,
            confidence: confidence || null,
            runtime_ms: runtime_ms || null,
            status: "completed",
            created_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("prediction_results")
            .insert(record)
            .select()
            .single();

        if (error) {
            console.error("Supabase insert error:", error);
            return NextResponse.json(
                { error: `Failed to save result: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            id: data.id,
            message: "Prediction result saved successfully",
        });

    } catch (error) {
        console.error("Save prediction error:", error);
        return NextResponse.json(
            { error: "Failed to save prediction result" },
            { status: 500 }
        );
    }
}
