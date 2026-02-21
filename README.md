<p align="center">
 <img width="70" height="70" alt="Gemini_Generated_Image_iphpouiphpouiphp" src="https://github.com/user-attachments/assets/f7977034-cdde-482d-ace0-fab91bdc7ada" />


</p>

<h1 align="center">🧬 InSilico Formulator</h1>

<p align="center">
  <strong>AI-Powered In-Silico Drug Formulation, Network Pharmacology & Physicochemical Prediction Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-ml-models">ML Models</a> •
  <a href="#-network-pharmacology">Network Pharmacology</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-available-scripts">Scripts</a> •
  <a href="#-team">Team</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1-black?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" />
  <img src="https://img.shields.io/badge/Three.js-3D_Engine-000000?logo=threedotjs" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase" />
  <img src="https://img.shields.io/badge/Python-ML%20Backend-3776ab?logo=python" />
  <img src="https://img.shields.io/badge/QSPR-v2.0_Ensemble-ff6600" />
  <img src="https://img.shields.io/badge/ADMET-v4.0_Domain--Aware-e11d48" />
  <img src="https://img.shields.io/badge/RDKit-ECFP6_2094-005571" />
  <img src="https://img.shields.io/badge/ChEMBL_34-Target_Prediction-2563eb" />
  <img src="https://img.shields.io/badge/STRING_DB-PPI_Network-8b5cf6" />
  <img src="https://img.shields.io/badge/Open_Targets-Disease_Mapping-ef4444" />
  <img src="https://img.shields.io/badge/Cerebras-AI_Copilot-8b5cf6" />
  <img src="https://img.shields.io/badge/PersonaPlex-Voice_AI-22c55e" />
  <img src="https://img.shields.io/badge/Docker-Railway-0db7ed?logo=docker" />
</p>

---

## 🎯 Problem Statement

Drug discovery is one of the slowest, most expensive pipelines in healthcare — taking **10–15 years** and costing **$2.6 billion+** per approved drug. Early-stage researchers lack access to fast, intelligent tools that can predict molecular properties, flag ADMET risks, and suggest lead optimizations — all in one place.

**InSilico Formulator** solves this by putting an AI-powered drug formulation lab directly in the browser — combining ML-based property prediction, interactive 3D molecular visualization, a reaction animation engine, and a context-aware AI copilot that reasons like a senior medicinal chemist.

---

## ✨ Features

### 🔬 Molecular Property Prediction (QSPR v2.0 + ADMET v4.0)
- Predict **Aqueous Solubility (logS)**, **Lipophilicity (logD)**, **Blood-Brain Barrier Penetration**, and **Clinical Toxicity** from any SMILES input
- **QSPR v2.0 Ensemble Engine**: **RandomForest + XGBoost** with Optuna-tuned hyperparameters, trained on MoleculeNet benchmarks (ESOL, Lipophilicity, BBBP, ClinTox)
- **ADMET v4.0 Domain-Aware Prediction System** — 17 ADMET endpoints with applicability domain awareness, prodrug detection, and metabolism-informed bioavailability:
  - **2094-dimensional hybrid features**: ECFP6 (radius 3, 2048 bits) + 26 physicochemical + 8 topological + 12 functional group descriptors
  - **Applicability domain**: 5-method composite (Tanimoto 30%, Mahalanobis 25%, Isolation Forest 20%, PCA 15%, Leverage 10%) — flags out-of-domain molecules with calibrated uncertainty inflation
  - **Prodrug detection**: 11 SMARTS patterns (phosphoramidate, ester, carbamate, protide, etc.) + ML classifier trained on DrugBank labels
  - **Metabolism-aware**: CYP450 inhibition (2D6/3A4/2C9), P-gp substrate prediction, plasma protein binding, first-pass bioavailability estimation ($F = f_a \times f_g \times f_h$)
  - **Ensemble routing**: MW/TPSA/functional-group classification routes molecules to specialized models (small oral drugs, large antivirals, prodrugs)
  - **Stratified validation**: MW/TPSA-binned evaluation, calibration curves, uncertainty quantification
  - Overcomes failures in: high MW compounds (>500 Da), nucleoside analogues, phosphoramidate prodrugs, large antivirals (e.g., Remdesivir), high TPSA molecules (>150 Å²)
- Drug-likeness assessment: Lipinski Rule-of-Five, Veber rules, Ghose filter + structural alert screening (PAINS/Brenk)
- **QSPR Dataset Lookup** — query training datasets for experimentally measured values by SMILES or compound name
- Each property classified as `optimal` / `moderate` / `poor` with color-coded insights
- **Mock fallback** — predictions and descriptors work even without the ML server via client-side mock data

### 🧪 Multiple Molecule Input Methods
| Method | Description |
|--------|-------------|
| **SMILES String** | Paste any valid SMILES notation |
| **2D Structure Drawing** | Interactive canvas — atom palette (C, N, O, S, P, halogens), bond tools, ring & chain builders |
| **Ketcher Editor** | Professional-grade EPAM Ketcher molecule editor with SMILES import/export |
| **File Upload** | Batch molecular input support |

### ⚗️ Reaction Lab (Three.js 3D Engine)
- Full **Three.js-powered molecular visualization engine** with custom rendering pipeline
- **3 visualization modes**: Ball-and-Stick, Space-Filling, Wireframe
- **Reaction animations** — watch bonds form and break in real-time with smooth morphing transitions
- **Conformer animation** — play through multi-conformer frames with interpolation
- **Thermal vibration simulation** — temperature-responsive atom motion (0–5000 K)
- **Preset reactions**: Dehydration, Fischer Esterification, and more with one-click load
- **Video recording** — capture WebM recordings of animations and download directly
- **Auto-rotation**, zoom, pan via OrbitControls
- 3D geometry from RDKit backend (`/generate-3d`) with MMFF94 optimization, or client-side `smiles-to-3d.ts` fallback

### 📊 Rich Visualization Suite
| Component | Technology | What It Does |
|-----------|-----------|-------------|
| **3D Molecule Viewer** | 3Dmol.js | Interactive rendering — rotate, zoom, fullscreen, spin |
| **Three.js Molecular Scene** | Three.js | Custom engine — ball-stick, space-filling, wireframe, reactions, conformers |
| **Radar Property Chart** | Plotly.js | LogP, MW, HBD, HBA, TPSA, RotBonds at a glance |
| **Drug-Likeness Gauge** | Framer Motion | Animated Lipinski Rule-of-Five pass/fail dial |
| **Toxicity Gauges** | Plotly.js | Per-endpoint safety visualizations |
| **Solubility Curve** | Plotly.js | pH-dependent solubility profile |
| **Ballpit Background** | Three.js | Interactive 3D particle background on the landing page |

### ⚔️ Model Comparison & QSPR Dataset Access
- Side-by-side **Ensemble vs Legacy** prediction comparison
- Radar chart overlay with per-property **winner indicators** (🏆)
- Compare multiple compounds across all predicted properties
- **Live dataset lookup** — query experimentally measured values by SMILES or compound name across 8,862 training compounds

### 🤖 AI Copilot
- Conversational AI assistant with deep **medicinal chemistry, ADMET, SAR, and PK/PD** expertise
- **Context-aware** — automatically ingests your compound library, simulations & prediction results via RAG context builder
- **Function calling**: runs live predictions, compares molecules, and queries QSPR datasets mid-conversation
- **Analytical reasoning**: identifies patterns, flags red flags, spots structure-property relationships
- Powered by **Cerebras AI (llama3.1-8b)** — ultra-fast inference
- Markdown-rendered responses with suggested follow-up prompts
- **Per-compound AI summary** — one-click 2–3 sentence analysis on any molecule card

### 🕸️ Network Pharmacology (Real-Data Pipeline)
A complete **systems pharmacology** module that maps a single SMILES string through the full drug-target-pathway-disease axis — powered entirely by real biomedical databases, not mock data.

#### 3-Tier Target Prediction Pipeline

| Tier | Source | Method | Details |
|------|--------|--------|---------|
| **Tier 1 — ChEMBL Live API** | ChEMBL 34 (EBI) | Structure similarity search (Tanimoto ≥ 70%) + bioactivity lookup (pChEMBL ≥ 5.0) | Queries 2.4M compounds / 15.5M activities in real-time; SEA-inspired scoring: `confidence = similarity × (pChEMBL / 10)` |
| **Tier 2 — Local Reference DB** | ~120 FDA-approved drugs / ~200 target interactions | Morgan FP (ECFP4, 2048-bit) Tanimoto similarity | Pre-built reference DB sourced from ChEMBL/DrugBank; sigmoid probability with potency weighting |
| **Tier 3 — SMARTS Pharmacophore** | Published SAR literature | Hand-curated SMARTS substructure patterns | Offline fallback when Tiers 1 & 2 return few results; covers kinase hinge binders, GPCR motifs, enzyme inhibitor scaffolds |

#### External APIs Queried (All Free, No API Key Required)

| API | Version | Usage |
|-----|---------|-------|
| **ChEMBL** | 34 | Compound similarity + bioactivity for target prediction |
| **STRING DB** | 11.5 | Protein-protein interaction network construction (species 9606 / human) |
| **Reactome** | — | Pathway enrichment analysis |
| **KEGG** | — | Pathway enrichment analysis |
| **Open Targets Platform** | GraphQL | Gene → disease association mapping with therapeutic area grouping |

#### Pipeline Modules

| Module | What It Does |
|--------|-------------|
| `target_prediction.py` | Orchestrates the 3-tier pipeline; deduplicates, ranks, and returns targets with prediction source metadata |
| `chembl_client.py` | ChEMBL REST API client with batch target resolution and caching |
| `similarity_engine.py` | Local Morgan FP similarity engine using SEA (Similarity Ensemble Approach) method |
| `ppi_network.py` | STRING DB graph builder with centrality metrics, community detection, and hub gene identification; 70+ curated fallback interactions |
| `pathway_enrichment.py` | Fisher's exact test with Benjamini-Hochberg FDR correction; 24 curated pathway fallbacks |
| `disease_mapping.py` | Open Targets GraphQL client; 33 curated disease fallbacks; grouped by therapeutic area |

#### Animated Pipeline Stepper (Frontend)
When analysis runs, a **4-step animated pipeline visualization** shows real-time progress:

1. 🔵 **Target Prediction** — "Querying ChEMBL API, running Morgan fingerprint similarity & SMARTS pharmacophore matching…"
2. 🟣 **PPI Network Construction** — "Building protein-protein interaction network from STRING DB…"
3. 🟢 **Pathway Enrichment** — "Enriching pathways via Reactome & KEGG databases…"
4. 🔴 **Disease Mapping** — "Mapping disease associations from Open Targets platform…"

Each step card transitions through `waiting → running → complete` with:
- Framer Motion spring animations and sliding progress bars
- Live result counts (e.g., "17 targets identified", "35 PPI edges")
- Per-step timing display (e.g., "12.4s")
- **Prediction Tier Breakdown** panel showing ChEMBL / Similarity / Pharmacophore hit counts
- Overall progress bar with gradient fill

#### Results Exploration (5 Tabs)

| Tab | Content |
|-----|---------|
| **Targets** | Full target table with gene name, protein name, UniProt ID, target class, probability bar, and prediction source |
| **PPI Network** | Interactive force-directed SVG graph (drug targets = blue, hub genes = amber, interactors = indigo) with node click |
| **Pathways** | Ranked pathway list with p-values, FDR, gene count badges, source (KEGG/Reactome) |
| **Diseases** | Disease table with therapeutic area pills, score bars, associated gene badges |
| **Topology** | Network metrics: density, connected components, hub genes by degree, degree centrality distribution |

#### Verified Results (Aspirin — `CC(=O)Oc1ccccc1C(=O)O`)
| Metric | Count |
|--------|-------|
| Predicted Targets | 17 (ChEMBL: 6, Pharmacophore: 11) |
| PPI Network | 17 nodes, 35 edges |
| Enriched Pathways | 59 |
| Disease Associations | 25 |

### 🎙️ PersonaPlex Voice AI Assistant
- **Floating draggable orb** on every page — tap to speak naturally
- **PersonaPlex pipeline**: Browser ASR → Cerebras AI (with function calling) → Microsoft Edge Neural TTS
- Optional **NVIDIA Riva** ASR/TTS for enterprise-grade accuracy (falls back to browser APIs)
- **5 voice tools**: `run_prediction`, `get_descriptors`, `get_drug_likeness`, `compare_molecules`, `query_qspr_dataset`
- 4 animated states: Idle 🔵 → Listening 🔴 → Processing 🟣 → Speaking 🟢
- Voice-optimized responses — conversational, natural, no jargon dumps
- Transcript history with message bubbles
- Quick suggestion chips for instant queries

### 📋 Reports & Export
- **PDF reports** with molecule info, predicted properties, toxicity screening, drug-likeness scores
- **CSV export** for data analysis pipelines
- Configurable sections — toggle structures, curves, metadata
- Shareable report links with copy-to-clipboard

### 🔐 Authentication & Credit System
- Supabase email/password auth with user profiles
- **Credit-based simulation system** — each run costs credits based on selected properties
- **Real-time credit deduction** — credits are deducted directly from the `profiles` table on simulation submission and the UI refreshes immediately
- Protected routes — dashboard, simulations, molecules pages require login
- **Row-Level Security (RLS)** — users can only access their own data

### 💎 UI/UX Design
- **Glassmorphism design system** — dark navy theme with frosted-glass cards and gradient accents
- **Framer Motion animations** — page transitions, stagger effects, hover/tap micro-interactions
- **Skeleton loading states** for all async data fetches
- **Haptic feedback** patterns (light, medium, heavy, success, error)
- **Toast notifications** with auto-dismiss
- **Lottie animations** — hero section and flask animation assets
- **Inter + Outfit** Google Fonts typography
- **Interactive 3D ballpit background** on the landing page

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 16** | React framework (App Router, Turbopack) |
| **React 19** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Utility-first styling |
| **Three.js** | Custom 3D molecular visualization engine |
| **Framer Motion** | Animations & transitions |
| **Recharts** | Dashboard charts |
| **Plotly.js** | Scientific visualizations |
| **3Dmol.js** | Quick 3D molecule rendering |
| **Ketcher** | Molecular structure editor |
| **Lottie React** | JSON-based animations |
| **jsPDF** | Client-side PDF generation |
| **Lucide React** | Icon system |

### Backend & AI
| Technology | Purpose |
|-----------|---------|
| **Supabase** | Auth, PostgreSQL database, RLS |
| **Flask** | Python ML API server (port 5001) |
| **RDKit** | Morgan fingerprints (ECFP4/ECFP6) + physicochemical descriptors + 3D conformer generation |
| **XGBoost** | Gradient boosting ensemble member |
| **scikit-learn** | RandomForest ensemble member, preprocessing |
| **Optuna** | Bayesian hyperparameter tuning |
| **NetworkX** | Graph construction & analysis (PPI networks, centrality, community detection) |
| **SciPy** | Statistical tests (hypergeometric / Fisher's exact, FDR correction) |
| **ChEMBL REST API** | Live compound similarity search + bioactivity data for target prediction |
| **STRING DB API** | Protein-protein interaction data (human, score ≥ 0.4) |
| **Reactome + KEGG APIs** | Pathway enrichment analysis |
| **Open Targets GraphQL** | Gene-disease association mapping |
| **Cerebras AI** | LLM reasoning engine (llama3.1-8b) |
| **Edge TTS** | Microsoft Edge Neural text-to-speech |
| **NVIDIA Riva** | Enterprise ASR/TTS (optional, browser fallback) |
| **PersonaPlex** | Voice AI session pipeline |
| **python-dotenv** | Auto-loads `.env.local` for API keys |

### DevOps & Deployment
| Technology | Purpose |
|-----------|---------|
| **Docker** | ML backend containerization |
| **Railway** | ML server cloud deployment |
| **Vercel** | Frontend deployment (Next.js) |
| **Gunicorn** | Production WSGI server (2 workers, 120s timeout) |
| **Concurrently** | Runs Next.js + Flask in parallel during dev |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                    │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ Molecule   │  │ Simulation│  │ AI Copilot  │  │ PersonaPlex    │  │
│  │ Input      │  │ Config    │  │ Chat        │  │ Voice Orb      │  │
│  │ (SMILES /  │  │ (Props,   │  │ (Function   │  │ ASR → AI → TTS │  │
│  │  Draw /    │  │  Solvent, │  │  Calling)   │  │ Edge TTS /     │  │
│  │  Ketcher)  │  │  T, P)    │  │             │  │ Riva fallback  │  │
│  └──────┬─────┘  └─────┬─────┘  └──────┬──────┘  └──────┬─────────┘ │
│         │              │               │                │           │
│  ┌──────┴───────────────────────────────────────────────────────────┐ │
│  │  Reaction Lab (Three.js) + Network Pharmacology Pipeline UI     │ │
│  │  AtomMesh · BondMesh · ConformerAnimator · ReactionAnimator      │ │
│  │  VibrationEngine · VideoRecorder · smiles-to-3d (client)         │ │
│  │  Animated Pipeline Stepper (Framer Motion) · NetworkGraph (SVG)  │ │
│  └──────┬───────────────────────────────────────────────────────────┘ │
│         │                                                             │
│  ┌──────▼──────────────────────────────────────────────────────────┐ │
│  │                    Next.js API Routes                           │ │
│  │  /api/predict   /api/predict/compare   /api/copilot             │ │
│  │  /api/predict/save   /api/descriptors  /api/copilot/summary     │ │
│  │  /api/network-pharmacology  (targets | ppi | pathways | diseases)│ │
│  └──────────┬──────────────────────────────────────┬───────────────┘ │
└─────────────┼──────────────────────────────────────┼────────────────┘
              │                                      │
   ┌──────────▼──────────────┐         ┌─────────────▼───────────┐
   │  Flask ML + Voice       │         │   Cerebras AI           │
   │  Server v2.3            │         │   (llama3.1-8b)         │
   │  (Port 5001)            │         │                         │
   │                         │         │  Function calling +     │
   │  ┌───────────────────┐  │         │  QSPR dataset context   │
   │  │ ECFP6 + ECFP4 FPs │  │         │  injection              │
   │  │ 2094 / 2056 dims  │  │         └─────────────────────────┘
   │  │ Drug-likeness +   │  │
   │  │ PAINS/Brenk       │  │
   │  └───────┬───────────┘  │
   │  ┌───────▼───────────┐  │
   │  │ ADMET v4.0         │  │
   │  │ 17 ADMET endpoints │  │
   │  │ Applicability Dom. │  │
   │  │ Prodrug Detection  │  │
   │  │ Metabolism-Aware   │  │
   │  │ Ensemble Routing   │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ QSPR v2.0 (legacy) │  │
   │  │ RF + XGB (8 models)│  │
   │  │ + 4 legacy DT      │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ Network Pharmacol. │  │
   │  │ ┌─ ChEMBL API     │  │
   │  │ ├─ Morgan FP Sim.  │  │
   │  │ ├─ SMARTS Pharm.   │  │
   │  │ ├─ STRING DB (PPI) │  │
   │  │ ├─ Reactome/KEGG   │  │
   │  │ └─ Open Targets    │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ 3D Geometry Engine │  │
   │  │ /generate-3d       │  │
   │  │ /generate-reaction │  │
   │  │ MMFF94 + conformer │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ PersonaPlex Voice  │  │
   │  │ Session Manager +  │  │
   │  │ Cerebras Bridge    │  │
   │  │ + Edge TTS / Riva  │  │
   │  └───────────────────┘  │
   │  ┌───────────────────┐  │
   │  │ QSPR Dataset      │  │
   │  │ Lookup Service     │  │
   │  │ (8,862 compounds) │  │
   │  └───────────────────┘  │
   └──────────────────────────┘
              │
   ┌──────────▼──────────┐
   │     Supabase        │
   │  ┌───────────────┐  │
   │  │ Auth (JWT)     │  │
   │  │ profiles       │  │
   │  │ projects       │  │
   │  │ molecules      │  │
   │  │ simulations    │  │
   │  │ predictions    │  │
   │  │ (RLS enabled)  │  │
   │  └───────────────┘  │
   └─────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10 with **RDKit** (`conda install -c conda-forge rdkit` or `pip install rdkit`)
- **Supabase** project ([supabase.com](https://supabase.com))

### 1. Clone & Install

```bash
git clone https://github.com/your-username/insilico-formulator.git
cd insilico-formulator

# Frontend dependencies
npm install

# Python ML dependencies
pip install -r ml/requirements.txt
```

### 2. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AI Copilot — Cerebras AI
CEREBRAS_API_KEY=your-cerebras-api-key
CEREBRAS_MODEL=llama3.1-8b            # default model

# ML Backend
ML_BACKEND_URL=http://localhost:5001   # Flask ML server URL

# (Optional) AI Copilot fallback — OpenRouter API Key
GEMINI_API_KEY=your-openrouter-api-key

# (Optional) NVIDIA Riva — enterprise ASR/TTS
RIVA_API_URL=https://your-riva-endpoint
RIVA_API_KEY=your-riva-api-key
RIVA_TTS_VOICE=English-US.Female-1
RIVA_USE_SSL=true
```

> **Note:** The Python ML server automatically reads `.env.local` via `python-dotenv`. All API keys defined there (including `CEREBRAS_API_KEY`) are loaded at startup. No manual `export` is required.

### 3. Database Setup

Your Supabase project needs these tables (with RLS enabled):

```sql
-- User profiles with credits
profiles (id UUID, full_name TEXT, role TEXT, credits INT, avatar_url TEXT)

-- Research organization
projects (id UUID, user_id UUID, name TEXT, description TEXT, created_at TIMESTAMPTZ)
molecules (id UUID, user_id UUID, project_id UUID, name TEXT, smiles TEXT, formula TEXT, molecular_weight FLOAT)

-- Computation results
simulations (id UUID, user_id UUID, molecule_id UUID, status TEXT, config_json JSONB, result_json JSONB, compute_cost INT)
prediction_results (id UUID, smiles TEXT, molecule_name TEXT, formula TEXT, molecular_weight REAL,
                    properties JSONB, toxicity_screening JSONB, confidence REAL, runtime_ms INT,
                    status TEXT, created_at TIMESTAMPTZ)
```

> A ready-to-run migration script is included at `supabase_migration_prediction_results.sql`.

### 4. Run

```bash
# Start both Next.js + ML server (recommended)
npm run dev:all

# Or separately:
npm run dev          # Next.js → http://localhost:3000
python ml/server.py  # Flask ML → http://localhost:5001
```

Visit **[http://localhost:3000](http://localhost:3000)** 🎉

---

## 🎮 Demo

### Built-in Demo Mode
Navigate to `/simulations/demo` for a pre-loaded **Aspirin** simulation that works even without the ML server — perfect for quick demos and judging sessions.

### Reaction Lab
Navigate to `/reactions` for the interactive Three.js 3D reaction visualization lab — load preset reactions, adjust temperature, toggle visualization modes, and record video.

### Network Pharmacology
Navigate to `/network-pharmacology` to run a full **systems pharmacology pipeline** — select a molecule from your library (or paste a SMILES), watch the animated 4-step pipeline (targets → PPI → pathways → diseases), then explore results across 5 interactive tabs including a force-directed PPI network graph.

### Sample SMILES to Try
| Compound | SMILES |
|----------|--------|
| Aspirin | `CC(=O)Oc1ccccc1C(=O)O` |
| Ibuprofen | `CC(C)Cc1ccc(cc1)C(C)C(=O)O` |
| Caffeine | `Cn1c(=O)c2c(ncn2C)n(C)c1=O` |
| Paracetamol | `CC(=O)Nc1ccc(O)cc1` |
| Metformin | `CN(C)C(=N)NC(=N)N` |
| Ethanol | `CCO` |
| Water | `O` |

---

## 📡 API Reference

### ML + Voice + 3D + Network Pharmacology API (Flask — Port 5001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — engine version, loaded models |
| `GET` | `/models` | List available models & capabilities |
| `POST` | `/predict` | Full QSPR ensemble property prediction from SMILES |
| `POST` | `/descriptors` | Raw molecular descriptor computation (ECFP4 + physicochemical) |
| `POST` | `/drug-likeness` | Lipinski, Veber, Ghose assessment + PAINS/Brenk alerts |
| `POST` | `/admet/predict` | **ADMET v4** — predict all endpoints with domain awareness, prodrug detection & metabolism |
| `POST` | `/admet/predict/:endpoint` | **ADMET v4** — single endpoint prediction (e.g., `/admet/predict/logp`) |
| `POST` | `/admet/classify` | Classify molecule into chemical space (MW/TPSA class, prodrug status, routing) |
| `GET` | `/admet/models` | List ADMET v4 capabilities and registered endpoints |
| `POST` | `/generate-3d` | Generate 3D coordinates + conformers for Three.js viewer (RDKit + MMFF94) |
| `POST` | `/generate-reaction-3d` | Generate reaction 3D geometries with atom padding for morphing |
| `POST` | `/qspr/lookup` | Look up a molecule in training datasets by SMILES or name |
| `GET` | `/qspr/stats` | Training dataset statistics (sizes, ranges, distributions) |
| `POST` | `/network/targets` | Predict protein targets for a SMILES (3-tier pipeline) |
| `POST` | `/network/ppi` | Build PPI network from gene list (STRING DB) |
| `POST` | `/network/pathways` | Pathway enrichment from gene list (Reactome + KEGG) |
| `POST` | `/network/diseases` | Disease mapping from gene list (Open Targets) |
| `POST` | `/network/full-analysis` | Complete pipeline: targets → PPI → pathways → diseases |
| `POST` | `/voice/session` | Create a PersonaPlex voice session |
| `GET` | `/voice/session/:id` | Get voice session status |
| `DELETE` | `/voice/session/:id` | Delete / end a voice session |
| `POST` | `/voice/process` | Process a voice query (ASR → Cerebras → tools → response) |
| `POST` | `/voice/tts` | Text-to-speech via Edge TTS or Riva |
| `GET` | `/voice/status` | Voice subsystem status (Cerebras, Riva, Edge TTS) |

### Next.js API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/predict` | Proxy to ML server with model type selection |
| `POST` | `/api/predict/compare` | Ensemble vs legacy side-by-side comparison |
| `POST` | `/api/predict/save` | Persist results to Supabase |
| `POST` | `/api/descriptors` | Proxy to ML descriptors endpoint (mock fallback) |
| `POST` | `/api/copilot` | AI chat with context-aware function calling |
| `POST` | `/api/copilot/summary` | Short 2–3 sentence compound analysis |
| `POST` | `/api/network-pharmacology` | Proxy to NP endpoints (action: `full` / `targets` / `ppi` / `pathways` / `diseases`; 120s timeout; mock fallback) |

### Example Requests

```bash
# Predict properties (QSPR ensemble)
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# Generate 3D coordinates for Three.js viewer
curl -X POST http://localhost:5001/generate-3d \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CCO", "num_conformers": 5}'

# Generate reaction 3D geometries
curl -X POST http://localhost:5001/generate-reaction-3d \
  -H "Content-Type: application/json" \
  -d '{"reactant_smiles": "CCO", "product_smiles": "C=C", "bond_changes": [{"type": "break", "atom1": 3, "atom2": 6}]}'

# Look up measured values from training data
curl -X POST http://localhost:5001/qspr/lookup \
  -H "Content-Type: application/json" \
  -d '{"name": "Caffeine"}'

# Drug-likeness assessment
curl -X POST http://localhost:5001/drug-likeness \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# Dataset statistics
curl http://localhost:5001/qspr/stats

# ADMET v4 — predict all endpoints for a molecule
curl -X POST http://localhost:5001/admet/predict \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# ADMET v4 — single endpoint prediction
curl -X POST http://localhost:5001/admet/predict/logp \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# ADMET v4 — classify molecule into chemical space
curl -X POST http://localhost:5001/admet/classify \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# ADMET v4 — list available endpoints
curl http://localhost:5001/admet/models

# Network Pharmacology — predict targets
curl -X POST http://localhost:5001/network/targets \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'

# Network Pharmacology — build PPI network
curl -X POST http://localhost:5001/network/ppi \
  -H "Content-Type: application/json" \
  -d '{"genes": ["PTGS1", "PTGS2", "MAPK1", "AHR", "PPARG"]}'

# Network Pharmacology — pathway enrichment
curl -X POST http://localhost:5001/network/pathways \
  -H "Content-Type: application/json" \
  -d '{"genes": ["PTGS1", "PTGS2", "MAPK1", "AHR", "PPARG"]}'

# Network Pharmacology — full analysis (all steps)
curl -X POST http://localhost:5001/network/full-analysis \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CC(=O)Oc1ccccc1C(=O)O"}'
```

---

## 🧠 ML Models

### QSPR Engine v2.0

The prediction engine uses a **weighted ensemble** of RandomForest and XGBoost, with weights determined by cross-validation performance. Legacy Decision Tree + XGBoost v1 models are available as fallbacks.

### ADMET Engine v4.0 (Domain-Aware)

A comprehensive **domain-aware ADMET prediction system** that overcomes failures in high MW compounds, nucleoside analogues, phosphoramidate prodrugs, and large antivirals. Runs alongside QSPR v2 with full backward compatibility.

#### ADMET Endpoints (17 total)

| Category | Endpoint | Task | Description |
|----------|----------|------|-------------|
| **Absorption** | `solubility` | Regression | Aqueous Solubility (logS) |
| | `caco2` | Regression | Caco-2 Cell Permeability |
| | `pgp_substrate` | Classification | P-glycoprotein Substrate |
| | `oral_bioavailability` | Classification | Oral Bioavailability ≥30% |
| **Distribution** | `logp` | Regression | Lipophilicity (logP/logD) |
| | `bbbp` | Classification | Blood-Brain Barrier Penetration |
| | `ppb` | Regression | Plasma Protein Binding |
| | `vdss` | Regression | Volume of Distribution |
| **Metabolism** | `cyp2d6_inhibitor` | Classification | CYP2D6 Inhibition |
| | `cyp3a4_inhibitor` | Classification | CYP3A4 Inhibition |
| | `cyp2c9_inhibitor` | Classification | CYP2C9 Inhibition |
| | `half_life` | Regression | Human Half-Life |
| **Excretion** | `clearance` | Regression | Total Clearance |
| **Toxicity** | `toxicity` | Classification | Clinical Trial Toxicity |
| | `herg` | Classification | hERG Channel Inhibition |
| | `ames` | Classification | Ames Mutagenicity |
| | `dili` | Classification | Drug-Induced Liver Injury |

#### ADMET Feature Engineering (2,094 dimensions)

| Feature Type | Count | Details |
|-------------|-------|---------|
| **Morgan Fingerprints (ECFP6)** | 2,048 | Radius 3, captures larger substructural neighborhoods than ECFP4 |
| **Physicochemical Descriptors** | 26 | MW, TPSA, LogP, HBD, HBA, RotBonds + LabuteASA, PEOE_VSA, BalabanJ, Chi0n, Kappa1-3, etc. |
| **Topological Descriptors** | 8 | BertzCT, HallKierAlpha, Ipc, NumAliphaticRings, NumSaturatedRings, etc. |
| **Functional Group Indicators** | 12 | Phosphoramidate, ester, carbamate, amide, sulfonamide, nucleoside_core, phosphate, etc. |

#### ADMET Architecture

| Component | Configuration |
|-----------|---------------|
| **RandomForest** | 1,000 estimators, sqrt features, class_weight=balanced |
| **XGBoost** | 600 estimators, max_depth=8, lr=0.02, subsample=0.85 |
| **Ensemble** | Weighted average with domain-aware uncertainty inflation |
| **Applicability Domain** | 5-method composite: Tanimoto (30%) + Mahalanobis (25%) + Isolation Forest (20%) + PCA (15%) + Leverage (10%) |
| **Prodrug Detection** | 11 SMARTS patterns + RF classifier (DrugBank labels) |
| **Metabolism** | CYP450 + P-gp + PPB → bioavailability: $F = f_a \times f_g \times f_h$ |
| **Routing** | MW/TPSA/functional-group → small_oral / large_antiviral / prodrug / default |
| **Validation** | MW/TPSA-stratified, calibration curves, uncertainty quantification |
| **Tuning** | Optuna Bayesian optimization (80 trials, 5-fold scaffold CV) |
| **Data Sources** | MoleculeNet + ChEMBL + PubChem + DrugBank + ZINC15 + ADMETlab |

### Training Data (MoleculeNet Benchmarks)

| Dataset | Task | Compounds | Property | Unit |
|---------|------|-----------|----------|------|
| **ESOL** | Regression | 1,128 | Aqueous Solubility | logS (mol/L) |
| **Lipophilicity** | Regression | 4,200 | Lipophilicity | logD at pH 7.4 |
| **BBBP** | Classification | 2,050 | Blood-Brain Barrier Penetration | binary |
| **ClinTox** | Classification | 1,484 | Clinical Toxicity | binary |

### QSPR v2 Feature Engineering (2,056 dimensions)

| Feature Type | Count | Details |
|-------------|-------|---------| 
| **Morgan Fingerprints (ECFP4)** | 2,048 | Radius 2, captures substructural fragments of diameter 4 |
| **Physicochemical Descriptors** | 8 | MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3 |

### QSPR v2 Model Architecture

| Component | Configuration |
|-----------|---------------|
| **RandomForest** | 500 estimators, sqrt features, min_samples_split=5 |
| **XGBoost** | 300 estimators, max_depth=6, lr=0.05, subsample=0.8 |
| **Ensemble** | Weighted average (weights from CV performance, ~40/60 RF/XGB) |
| **Tuning** | Optuna Bayesian optimization (50 trials, 5-fold CV) |
| **Splitting** | Scaffold split (Bemis-Murcko) for realistic generalization |

### Prediction Accuracy & Confidence Calibration

The ensemble engine features **calibrated confidence scoring** and **hybrid prediction blending** for production-quality results:

#### Confidence Calibration
- **Per-property reference uncertainty scales** derived from 2× training RMSE — predictions are scored against realistic baselines rather than self-normalized
- **Confidence floors** prevent misleadingly low scores: LogP ≥ 55%, Solubility ≥ 45%, BBBP ≥ 50%, Toxicity ≥ 50%
- **Exact-method properties** (TPSA, QED) contribute confidence = 1.0 to the weighted average
- **Overall confidence** is a weighted average across all predicted properties including pKa, TPSA, and QED

#### LogP Hybrid Blending
LogP uses a **confidence-weighted blend** of QSPR ensemble prediction and RDKit Crippen LogP (a validated physics-based method):

$$\text{LogP}_{\text{final}} = w \cdot \text{LogP}_{\text{QSPR}} + (1 - w) \cdot \text{LogP}_{\text{Crippen}}$$

where $w = 0.2 + 0.5 \cdot \text{confidence}_{\text{QSPR}}$. At high QSPR confidence the ensemble dominates; at low confidence, the validated Crippen method takes over.

#### Benchmark Results

| Compound | LogP (Predicted) | LogP (Experimental) | Confidence | Drug-Likeness |
|----------|-----------------|--------------------|-----------|--------------| 
| **Aspirin** | 0.88 | 1.19 | 73.5% | A (82.0) |
| **Caffeine** | −0.30 | −0.07 | 83.3% | A (82.0) |
| **Ibuprofen** | 2.54 | 3.97 | 73.2% | A (82.0) |

### Model Files

```
ml/models/
├── qspr/                                    # QSPR v2.0 ensemble models
│   ├── solubility_random_forest.joblib      ├── solubility_xgboost.joblib
│   ├── logp_random_forest.joblib            ├── logp_xgboost.joblib
│   ├── bbbp_random_forest.joblib            ├── bbbp_xgboost.joblib
│   ├── toxicity_random_forest.joblib        ├── toxicity_xgboost.joblib
│   ├── *_ensemble.meta.json                 # Ensemble weights + eval metrics
│   ├── *.meta.json                          # Per-model metadata
│   └── training_report.json                 # Full training report
├── admet/                                   # ADMET v4.0 domain-aware models
│   ├── *_random_forest.joblib               # Per-endpoint RF models
│   ├── *_xgboost.joblib                     # Per-endpoint XGBoost models
│   ├── *_ensemble.json                      # Per-endpoint ensemble weights
│   ├── *_ad.joblib                          # Per-endpoint applicability domains
│   ├── prodrug_detector.joblib              # Shared prodrug detection model
│   ├── metabolism_predictor.joblib           # Shared metabolism prediction model
│   ├── router.joblib                        # Ensemble router (all endpoints)
│   └── training_report.json                 # Full ADMET training report
├── *_xgboost.joblib                         # Legacy v1 models (fallback)
├── *_decision_tree.joblib                   # Legacy v1 models (fallback)
└── training_metadata.json                   # Legacy training metadata
```

### Training & Evaluation Commands

```bash
# ── ADMET v4.0 (recommended) ──

# Full ADMET training with Optuna tuning (17 endpoints)
python ml/train_admet.py --tune

# Standard ADMET training (default hyperparameters)
python ml/train_admet.py

# Quick ADMET training (150 estimators, for testing)
python ml/train_admet.py --quick

# Train only specific endpoints
python ml/train_admet.py --endpoint logp
python ml/train_admet.py --endpoints logp,bbbp,toxicity

# ── QSPR v2.0 (legacy, still supported) ──

# Full training with Optuna hyperparameter tuning
npm run ml:train:tune
# → Trains RF + XGB for all 4 properties with Bayesian optimization

# Standard training (default hyperparameters)
npm run ml:train
# → Uses DEFAULT_RF_PARAMS & DEFAULT_XGB_PARAMS from qspr/config.py

# Quick training (reduced trials, for testing)
npm run ml:train:quick

# Evaluate trained models
npm run ml:evaluate
# → Runs scaffold-split evaluation, prints RMSE/R²/AUC metrics
```

---

## 📁 Project Structure

```
inSillico/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── predict/            # ML prediction endpoints
│   │   │   │   ├── route.ts        #   Main prediction proxy
│   │   │   │   ├── compare/        #   Ensemble vs legacy comparison
│   │   │   │   └── save/           #   Persist results to Supabase
│   │   │   ├── descriptors/        # Molecular descriptor proxy (mock fallback)
│   │   │   ├── copilot/            # AI assistant endpoints
│   │   │   │   ├── route.ts        #   Chat with function calling
│   │   │   │   └── summary/        #   Quick compound analysis
│   │   │   └── network-pharmacology/ # 🕸️ NP proxy (action routing, 120s timeout, mock fallback)
│   │   ├── auth/                   # Login & Signup pages
│   │   ├── copilot/                # AI Chat interface
│   │   ├── dashboard/              # User dashboard with metrics
│   │   ├── molecules/new/          # 3-step molecule input wizard
│   │   ├── reactions/              # ⚗️ Three.js 3D Reaction Lab
│   │   ├── simulations/            # Simulation config, demo mode
│   │   │   ├── page.tsx            #   Simulation list
│   │   │   ├── new/                #   New simulation wizard
│   │   │   └── demo/               #   Demo mode (no ML server needed)
│   │   ├── network-pharmacology/   # 🕸️ Network Pharmacology Pipeline
│   │   │   └── page.tsx            #   Animated stepper + 5-tab results
│   │   ├── results/                # Results list, detail, compare, export
│   │   │   ├── page.tsx            #   Results list with live predictions
│   │   │   ├── [id]/               #   Single result detail
│   │   │   ├── compare/            #   Side-by-side comparison
│   │   │   ├── export/             #   CSV/PDF export
│   │   │   └── view/               #   Shareable report view
│   │   ├── reports/                # PDF/CSV report viewer
│   │   ├── projects/               # Project management
│   │   ├── page.tsx                # Landing page (hero + ballpit)
│   │   ├── layout.tsx              # Root layout (auth, navbar, voice orb)
│   │   └── globals.css             # Design system (glassmorphism theme)
│   ├── components/
│   │   ├── molecular/              # 🧬 Three.js Molecular Engine
│   │   │   ├── MolecularScene.tsx  #   Main React component (Three.js)
│   │   │   ├── AtomMesh.ts         #   Atom rendering (sphere geometry)
│   │   │   ├── BondMesh.ts         #   Bond rendering (cylinder geometry)
│   │   │   ├── ConformerAnimator.ts#   Multi-conformer frame interpolation
│   │   │   ├── ReactionAnimator.ts #   Reaction morphing animations
│   │   │   ├── VibrationEngine.ts  #   Thermal vibration simulation
│   │   │   ├── VideoRecorder.ts    #   WebM recording from canvas
│   │   │   ├── constants.ts        #   Element colors, radii, scene defaults
│   │   │   ├── types.ts            #   TypeScript interfaces
│   │   │   └── index.ts            #   Public API exports
│   │   ├── network-graph.tsx       # 🕸️ Force-directed SVG PPI graph (351 lines)
│   │   ├── voice-assistant.tsx     # 🎙️ PersonaPlex floating voice orb
│   │   ├── molecule-viewer-3d.tsx  # 3Dmol.js 3D rendering
│   │   ├── molecule-drawer.tsx     # Canvas 2D drawing tool
│   │   ├── molecule-sketcher.tsx   # Ketcher integration
│   │   ├── drug-likeness-gauge.tsx # Animated Lipinski gauge
│   │   ├── plotly-charts.tsx       # Radar, bar, gauge, curve charts
│   │   ├── ballpit-background.tsx  # Three.js interactive particle BG
│   │   ├── HeroAnimation.jsx      # Lottie hero animation wrapper
│   │   ├── layout/navbar.tsx       # Navigation with glassmorphism
│   │   └── ui/                     # Glass cards, toasts, badges, skeletons
│   ├── animations/                 # Lottie JSON animation assets
│   │   ├── hero.json              #   Hero section animation
│   │   └── Erlenmeyer flask.json  #   Flask animation
│   ├── lib/
│   │   ├── auth-context.tsx        # Auth provider + credit tracking
│   │   ├── cerebras-client.ts      # Cerebras AI client wrapper
│   │   ├── tool-definitions.ts     # AI function calling tool defs
│   │   ├── rag-context.ts          # RAG context builder for AI
│   │   ├── smiles-to-3d.ts        # Client-side SMILES → 3D coordinates
│   │   ├── ml-mock.ts             # Mock ML predictions (offline fallback)
│   │   ├── generate-pdf-report.ts  # jsPDF report generation
│   │   ├── haptics.ts              # Haptic feedback patterns
│   │   └── supabase/               # Client & server Supabase helpers
│   └── middleware.ts               # Supabase auth session refresh
├── ml/
│   ├── server.py                   # Flask ML + Voice + 3D API (port 5001)
│   ├── server_v1_legacy.py         # Legacy v1 server (deprecated)
│   ├── descriptors.py              # RDKit ECFP4 + physicochemical engine
│   ├── train_qspr.py              # QSPR v2.0 training pipeline
│   ├── evaluate_qspr.py           # Model evaluation & metrics
│   ├── train_models.py             # Legacy v1 training (deprecated)
│   ├── download_moleculenet.py     # Dataset download utility
│   ├── test_api.py                 # API integration tests
│   ├── test_consistency.py         # Model consistency tests
│   ├── train_admet.py             # 🧪 ADMET v4.0 training pipeline
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Docker image for Railway deployment
│   ├── admet/                      # 🧪 ADMET v4.0 Domain-Aware Package
│   │   ├── __init__.py            #   Package root (v1.0.0)
│   │   ├── config.py              #   Central config (17 endpoints, 6 data sources, hyperparams)
│   │   ├── data/
│   │   │   ├── fetcher.py         #   Multi-source dataset fetching (ChEMBL, PubChem, DrugBank, ZINC15)
│   │   │   └── preprocessor.py    #   SMILES standardization, dedup, MW/TPSA stratification
│   │   ├── features/
│   │   │   └── hybrid_fingerprints.py  # ECFP6 + 26 physchem + 8 topo + 12 FG = 2094 features
│   │   ├── domain/
│   │   │   └── applicability.py   #   5-method AD: Tanimoto, Mahalanobis, IF, PCA, Leverage
│   │   ├── models/
│   │   │   ├── base.py            #   Enhanced RF + XGBoost with uncertainty
│   │   │   ├── ensemble.py        #   Domain-aware weighted ensemble
│   │   │   ├── prodrug_detector.py#   11 SMARTS + ML prodrug classifier
│   │   │   ├── metabolism.py      #   CYP450/P-gp/PPB + bioavailability (F=fa×fg×fh)
│   │   │   └── router.py          #   MW/TPSA/FG routing to specialized models
│   │   └── evaluation/
│   │       └── stratified_validator.py  # MW/TPSA-binned validation, calibration, UQ
│   ├── qspr/                       # 📦 QSPR Pipeline Package
│   │   ├── __init__.py            #   Package init + public API
│   │   ├── config.py              #   Central config (datasets, hyperparams)
│   │   ├── fingerprints.py        #   Morgan FP + descriptor computation
│   │   ├── datasets.py            #   Dataset loading & preprocessing
│   │   ├── models.py              #   Model factory (RF, XGB)
│   │   ├── ensemble.py            #   Weighted ensemble engine
│   │   ├── tuning.py              #   Optuna hyperparameter optimization
│   │   ├── evaluation.py          #   Metrics & cross-validation
│   │   ├── splitting.py           #   Scaffold & random splitting
│   │   └── serialization.py       #   Model save/load with metadata
│   ├── personaplex/                # 🎙️ PersonaPlex Voice Pipeline
│   │   ├── __init__.py            #   Package init
│   │   ├── cerebras_bridge.py     #   Cerebras AI integration + tools
│   │   ├── session_manager.py     #   Voice session lifecycle
│   │   ├── audio_processor.py     #   Audio format handling
│   │   └── riva_client.py         #   NVIDIA Riva ASR/TTS client
│   ├── network_pharmacology/       # 🕸️ Network Pharmacology Package
│   │   ├── __init__.py            #   Exports: predict_targets, build_ppi_network, enrich_pathways, map_diseases
│   │   ├── target_prediction.py   #   3-tier target prediction orchestrator (552 lines)
│   │   ├── chembl_client.py       #   ChEMBL 34 REST API client — similarity + bioactivity (363 lines)
│   │   ├── similarity_engine.py   #   Morgan FP SEA similarity engine (290 lines)
│   │   ├── ppi_network.py         #   STRING DB PPI builder + centrality metrics (435 lines)
│   │   ├── pathway_enrichment.py  #   Reactome/KEGG enrichment + Fisher/FDR (475 lines)
│   │   ├── disease_mapping.py     #   Open Targets GraphQL disease mapper (350 lines)
│   │   └── data/
│   │       ├── drug_targets.csv   #   ~120 approved drugs × ~200 target interactions
│   │       └── build_reference_db.py  # Script to rebuild reference DB from ChEMBL
│   ├── data/                       # MoleculeNet CSV datasets
│   │   ├── esol.csv               #   1,128 compounds (solubility)
│   │   ├── lipophilicity.csv      #   4,200 compounds (logD)
│   │   ├── bbbp.csv               #   2,050 compounds (BBB penetration)
│   │   └── clintox.csv            #   1,484 compounds (toxicity)
│   └── models/                     # Pre-trained model files
│       ├── qspr/                  #   QSPR v2.0 ensemble (.joblib + .meta.json)
│       │   └── training_report.json #  Full training report
│       ├── *.joblib               #   Legacy v1 models
│       └── training_metadata.json #   Legacy training metadata
├── public/                         # Static assets & logos
├── railway.json                    # Railway deployment config
├── supabase_migration_prediction_results.sql  # DB migration script
├── package.json                    # npm scripts & dependencies
└── tsconfig.json                   # TypeScript configuration
```

---

## 🚀 Deployment

### Frontend → Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set environment variables in the Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CEREBRAS_API_KEY`
- `ML_BACKEND_URL` → your Railway deployment URL

### ML Backend → Railway (Docker)

The ML server includes a production-ready `Dockerfile` and `railway.json`:

```bash
# Local Docker build & test
cd ml
docker build -t insilico-ml .
docker run -p 5001:5001 --env-file ../.env.local insilico-ml
```

Railway config (`railway.json`):
- **Builder**: Dockerfile (`ml/Dockerfile`)
- **Health check**: `/health` (120s timeout)
- **Restart policy**: On failure (max 3 retries)
- **Server**: Gunicorn with 2 workers, 120s request timeout

---

## 🔑 Key Differentiators

| Feature | InSilico Formulator | Traditional Tools |
|---------|--------------------|--------------------| 
| **Setup time** | 2 minutes | Days to weeks |
| **Cost** | Free & open source | $10K–$100K/yr licenses |
| **AI Assistant** | Context-aware copilot with function calling + voice | None |
| **ML Engine** | ADMET v4.0 (ECFP6, 2094 features, domain-aware) + QSPR v2.0 (ECFP4) | Single model |
| **Network Pharmacology** | Full pipeline: ChEMBL → STRING → Reactome/KEGG → Open Targets with animated stepper | Manual multi-tool workflow |
| **Target Prediction** | 3-tier real-data pipeline (ChEMBL API + Morgan FP + SMARTS) | Database lookup only |
| **3D Visualization** | Three.js engine + 3Dmol.js (reactions, conformers, vibration) | Static images |
| **Voice interaction** | PersonaPlex (Cerebras + Edge TTS + Riva) | N/A |
| **Dataset lookup** | Query 8,862 measured values mid-conversation | Manual search |
| **Reports** | One-click PDF/CSV export | Manual export |
| **UI/UX** | Modern glassmorphism, Framer Motion, Three.js | Legacy interfaces |
| **Deployment** | Vercel + Railway + Supabase (free tier) | On-premises only |

---

## 🚧 Roadmap

- [x] Network Pharmacology pipeline (ChEMBL, STRING DB, Reactome/KEGG, Open Targets)
- [x] 3-Tier real-data target prediction (ChEMBL API → Morgan FP similarity → SMARTS pharmacophore)
- [x] Animated pipeline stepper with per-step progress tracking
- [x] Interactive force-directed PPI network graph
- [x] PubChem / ChEMBL compound search integration
- [x] ADMET v4.0 domain-aware prediction (17 endpoints: CYP inhibition, PPB, hERG, Ames, DILI, Caco-2, clearance, half-life, VDss, oral bioavailability, P-gp)
- [x] Applicability domain awareness (5-method composite: Tanimoto, Mahalanobis, IF, PCA, Leverage)
- [x] Prodrug detection (phosphoramidate, ester, carbamate — 11 SMARTS + ML)
- [x] Metabolism-aware bioavailability (CYP450 + P-gp + PPB → F = fa × fg × fh)
- [x] MW/TPSA-stratified validation with calibration curves & uncertainty quantification
- [ ] Retrosynthesis pathway suggestion
- [ ] Molecular docking integration
- [ ] Batch prediction (CSV of 1000+ SMILES)
- [ ] GNN-based property prediction (GCN, AttentiveFP)
- [ ] Collaborative workspaces (team projects)
- [ ] QSAR model builder (no-code)
- [ ] Multi-target drug design optimization
- [ ] Polypharmacology analysis dashboard

---

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:all` | Start Next.js + Python ML server together (recommended for dev) |
| `npm run dev` | Next.js dev server only → http://localhost:3000 |
| `npm run ml` | Python ML + Voice + 3D server only → http://localhost:5001 |
| `npm run ml:legacy` | Legacy v1 server (deprecated) |
| `npm run ml:train` | Train QSPR v2.0 models (default hyperparameters) |
| `npm run ml:train:tune` | Train with Optuna Bayesian hyperparameter tuning |
| `npm run ml:train:quick` | Quick training (reduced trials, for testing) |
| `npm run ml:evaluate` | Evaluate models — scaffold-split metrics |
| `python ml/train_admet.py` | Train ADMET v4.0 models (17 endpoints, domain-aware) |
| `python ml/train_admet.py --tune` | ADMET training with Optuna tuning (80 trials) |
| `python ml/train_admet.py --quick` | ADMET quick training (150 estimators) |
| `npm run build` | Production build (Next.js) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 👥 Team

<!-- Update with your hackathon team details -->

| Names | 
|------|
| Parmeet Singh |
| Chetan Sharma |
| Niharika Khosla |
| Muskan Bindal |

---

<p align="center">
  Built with 🧬 for the future of drug discovery
</p>
