<p align="center">
  <img width="60" height="60" alt="Gemini_Generated_Image_c2bzihc2bzihc2bz" src="https://github.com/user-attachments/assets/1a259672-4b3c-45f2-94e5-bcdf682ba972" />

</p>

<h1 align="center">🧬 InSilico Formulator</h1>

<p align="center">
  <strong>AI-Powered In-Silico Drug Formulation & Physicochemical Prediction Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-ml-models">ML Models</a> •
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
  <img src="https://img.shields.io/badge/RDKit-ECFP4_2048-005571" />
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

### 🔬 Molecular Property Prediction (QSPR v2.0)
- Predict **Aqueous Solubility (logS)**, **Lipophilicity (logD)**, **Blood-Brain Barrier Penetration**, and **Clinical Toxicity** from any SMILES input
- **QSPR v2.0 Ensemble Engine**: **RandomForest + XGBoost** with Optuna-tuned hyperparameters, trained on MoleculeNet benchmarks (ESOL, Lipophilicity, BBBP, ClinTox)
- **2056-dimensional feature vector**: Morgan Fingerprints (ECFP4, radius 2, 2048 bits) + 8 physicochemical descriptors (MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3)
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
| **RDKit** | Morgan fingerprints (ECFP4) + physicochemical descriptors + 3D conformer generation |
| **XGBoost** | Gradient boosting ensemble member |
| **scikit-learn** | RandomForest ensemble member, preprocessing |
| **Optuna** | Bayesian hyperparameter tuning |
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
│  │  Reaction Lab (Three.js)                                         │ │
│  │  AtomMesh · BondMesh · ConformerAnimator · ReactionAnimator      │ │
│  │  VibrationEngine · VideoRecorder · smiles-to-3d (client)         │ │
│  └──────┬───────────────────────────────────────────────────────────┘ │
│         │                                                             │
│  ┌──────▼──────────────────────────────────────────────────────────┐ │
│  │                    Next.js API Routes                           │ │
│  │  /api/predict   /api/predict/compare   /api/copilot             │ │
│  │  /api/predict/save   /api/descriptors  /api/copilot/summary     │ │
│  └──────────┬──────────────────────────────────────┬───────────────┘ │
└─────────────┼──────────────────────────────────────┼────────────────┘
              │                                      │
   ┌──────────▼──────────────┐         ┌─────────────▼───────────┐
   │  Flask ML + Voice       │         │   Cerebras AI           │
   │  Server v2.3            │         │   (llama3.1-8b)         │
   │  (Port 5001)            │         │                         │
   │                         │         │  Function calling +     │
   │  ┌───────────────────┐  │         │  QSPR dataset context   │
   │  │ ECFP4 Fingerprints│  │         │  injection              │
   │  │ 2048 bits + 8     │  │         └─────────────────────────┘
   │  │ physicochemical   │  │
   │  │ = 2056-dim vector │  │
   │  │ Drug-likeness +   │  │
   │  │ PAINS/Brenk       │  │
   │  └───────┬───────────┘  │
   │  ┌───────▼───────────┐  │
   │  │ QSPR v2.0         │  │
   │  │ Ensemble Engine    │  │
   │  │ RandomForest +     │  │
   │  │ XGBoost (8 models) │  │
   │  │ + 4 legacy DT      │  │
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

### ML + Voice + 3D API (Flask — Port 5001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — engine version, loaded models |
| `GET` | `/models` | List available models & capabilities |
| `POST` | `/predict` | Full QSPR ensemble property prediction from SMILES |
| `POST` | `/descriptors` | Raw molecular descriptor computation (ECFP4 + physicochemical) |
| `POST` | `/drug-likeness` | Lipinski, Veber, Ghose assessment + PAINS/Brenk alerts |
| `POST` | `/generate-3d` | Generate 3D coordinates + conformers for Three.js viewer (RDKit + MMFF94) |
| `POST` | `/generate-reaction-3d` | Generate reaction 3D geometries with atom padding for morphing |
| `POST` | `/qspr/lookup` | Look up a molecule in training datasets by SMILES or name |
| `GET` | `/qspr/stats` | Training dataset statistics (sizes, ranges, distributions) |
| `POST` | `/voice/session` | Create a PersonaPlex voice session |
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
```

---

## 🧠 ML Models

### QSPR Engine v2.0

The prediction engine uses a **weighted ensemble** of RandomForest and XGBoost, with weights determined by cross-validation performance. Legacy Decision Tree + XGBoost v1 models are available as fallbacks.

### Training Data (MoleculeNet Benchmarks)

| Dataset | Task | Compounds | Property | Unit |
|---------|------|-----------|----------|------|
| **ESOL** | Regression | 1,128 | Aqueous Solubility | logS (mol/L) |
| **Lipophilicity** | Regression | 4,200 | Lipophilicity | logD at pH 7.4 |
| **BBBP** | Classification | 2,050 | Blood-Brain Barrier Penetration | binary |
| **ClinTox** | Classification | 1,484 | Clinical Toxicity | binary |

### Feature Engineering (2,056 dimensions)

| Feature Type | Count | Details |
|-------------|-------|---------| 
| **Morgan Fingerprints (ECFP4)** | 2,048 | Radius 2, captures substructural fragments of diameter 4 |
| **Physicochemical Descriptors** | 8 | MW, TPSA, LogP, HBD, HBA, RotBonds, AromaticRings, FractionCSP3 |

### Model Architecture

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
├── *_xgboost.joblib                         # Legacy v1 models (fallback)
├── *_decision_tree.joblib                   # Legacy v1 models (fallback)
└── training_metadata.json                   # Legacy training metadata
```

### Training & Evaluation Commands

```bash
# Full training with Optuna hyperparameter tuning (recommended)
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
│   │   │   └── copilot/            # AI assistant endpoints
│   │   │       ├── route.ts        #   Chat with function calling
│   │   │       └── summary/        #   Quick compound analysis
│   │   ├── auth/                   # Login & Signup pages
│   │   ├── copilot/                # AI Chat interface
│   │   ├── dashboard/              # User dashboard with metrics
│   │   ├── molecules/new/          # 3-step molecule input wizard
│   │   ├── reactions/              # ⚗️ Three.js 3D Reaction Lab
│   │   ├── simulations/            # Simulation config, demo mode
│   │   │   ├── page.tsx            #   Simulation list
│   │   │   ├── new/                #   New simulation wizard
│   │   │   └── demo/               #   Demo mode (no ML server needed)
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
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Docker image for Railway deployment
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
| **ML Engine** | QSPR v2.0 ensemble (RF + XGB, ECFP4) | Single model |
| **3D Visualization** | Three.js engine + 3Dmol.js (reactions, conformers, vibration) | Static images |
| **Voice interaction** | PersonaPlex (Cerebras + Edge TTS + Riva) | N/A |
| **Dataset lookup** | Query 8,862 measured values mid-conversation | Manual search |
| **Reports** | One-click PDF/CSV export | Manual export |
| **UI/UX** | Modern glassmorphism, Framer Motion, Three.js | Legacy interfaces |
| **Deployment** | Vercel + Railway + Supabase (free tier) | On-premises only |

---

## 🚧 Roadmap

- [ ] ADMET expansion (CYP inhibition, plasma protein binding, hERG)
- [ ] Retrosynthesis pathway suggestion
- [ ] Molecular docking integration
- [ ] Batch prediction (CSV of 1000+ SMILES)
- [ ] GNN-based property prediction (GCN, AttentiveFP)
- [ ] Collaborative workspaces (team projects)
- [ ] PubChem / ChEMBL compound search integration
- [ ] QSAR model builder (no-code)

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
