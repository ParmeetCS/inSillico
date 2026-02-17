-- =====================================================
-- Supabase Migration: Create prediction_results table
-- =====================================================
-- Run this SQL in your Supabase SQL editor:
-- https://supabase.com/dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS prediction_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    smiles TEXT NOT NULL,
    molecule_name TEXT DEFAULT 'Unknown',
    formula TEXT,
    molecular_weight REAL,
    properties JSONB NOT NULL,            -- The full ML properties object
    toxicity_screening JSONB,             -- hERG, Ames, Hepato sub-scores
    confidence REAL DEFAULT 0,
    runtime_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (open read/insert for anon for now)
ALTER TABLE prediction_results ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read results
CREATE POLICY "Allow public read" ON prediction_results
    FOR SELECT USING (true);

-- Allow anyone to insert results (via API route)
CREATE POLICY "Allow public insert" ON prediction_results
    FOR INSERT WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_prediction_results_created_at
    ON prediction_results (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_results_smiles
    ON prediction_results (smiles);
