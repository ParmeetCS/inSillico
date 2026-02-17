# InSilico — AI-Powered Molecular Property Prediction Platform

InSilico is a full-stack web application for computational drug discovery. It lets researchers define molecules, run physicochemical property predictions using trained ML models, and visualize results with interactive 3D structures and charts.

## Features

- **Molecule Management** — Define molecules via SMILES notation, with duplicate detection per user
- **ML-Powered Predictions** — XGBoost & Decision Tree models trained on MoleculeNet datasets (BBBP, ESOL, Lipophilicity, ClinTox)
- **Predicted Properties** — LogP, pKa, Aqueous Solubility, TPSA, Bioavailability, Toxicity Screening (hERG, Ames, Hepatotoxicity)
- **Interactive 3D Viewer** — 3Dmol.js-based molecule visualization with fullscreen expand, spin controls, and SMILES-to-SDF resolution via PubChem/NCI CACTUS
- **Dynamic Charts** — Plotly.js radar charts, bar charts, toxicity gauges, and pH-solubility curves driven by real prediction data
- **Projects & Organization** — Create projects to organize molecules and simulations
- **Compound Library** — Browse all completed simulations with search, filtering, and detailed result views
- **PDF Reports** — Export simulation results as formatted PDF reports
- **Demo Mode** — Try the platform with a pre-configured Aspirin simulation
- **Authentication** — Supabase Auth with email/password, protected routes via middleware
- **Credit System** — Simulation cost tracking per user

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, Framer Motion, custom glass-morphism UI |
| Charts | Plotly.js (CDN), Recharts |
| 3D Viewer | 3Dmol.js (CDN) |
| Auth & DB | Supabase (Auth, PostgreSQL, Row Level Security) |
| ML Backend | Python Flask, XGBoost, scikit-learn, RDKit |
| Molecule Editor | Ketcher (EPAM) |

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/predict/        # ML prediction proxy + save routes
│   │   ├── auth/               # Login & signup pages
│   │   ├── dashboard/          # User dashboard
│   │   ├── molecules/new/      # Molecule input with SMILES
│   │   ├── projects/           # Project CRUD management
│   │   ├── results/            # Compound library + detail views
│   │   ├── simulations/        # Simulation hub, new sim, demo
│   │   └── reports/[id]/       # PDF report generation
│   ├── components/
│   │   ├── molecule-viewer-3d  # 3Dmol.js wrapper (compact + fullscreen)
│   │   ├── plotly-charts       # 4 dynamic Plotly chart components
│   │   ├── molecule-sketcher   # Ketcher molecule editor
│   │   └── ui/                 # GlassCard, StatusBadge, Toast, Skeleton
│   └── lib/
│       ├── auth-context        # Auth provider + credit tracking
│       ├── supabase/           # Client & server Supabase instances
│       └── generate-pdf-report # jsPDF report generation
├── ml/
│   ├── server.py               # Flask ML prediction server (port 5001)
│   ├── train_models.py         # Model training script
│   ├── descriptors.py          # RDKit molecular descriptor computation
│   ├── data/                   # MoleculeNet CSV datasets
│   └── models/                 # Trained .joblib model files
└── package.json
```

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **Python** 3.11+ (tested with 3.13)
- **Supabase** project (cloud or local)

## Setup

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd inSillico

# Node.js dependencies
npm install

# Python ML dependencies
pip install -r ml/requirements.txt
```

### 2. Environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase database

Your Supabase project needs these tables (with RLS enabled):
- `profiles` — user profiles with credits
- `projects` — user projects
- `molecules` — molecule definitions (SMILES, formula, MW)
- `simulations` — simulation runs with config/result JSON
- `prediction_results` — saved ML prediction outputs

### 4. Run the application

```bash
# Start both Next.js + ML server (recommended)
npm run dev:all

# Or run them separately:
npm run dev       # Next.js on http://localhost:3000
npm run ml        # ML server on http://localhost:5001
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:all` | Start Next.js + Python ML server together |
| `npm run dev` | Next.js dev server only |
| `npm run ml` | Python ML server only (port 5001) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## ML Models

The `ml/` directory contains pre-trained models on MoleculeNet benchmark datasets:

| Model | Dataset | Task | Algorithms |
|-------|---------|------|-----------|
| BBBP | Blood-Brain Barrier | Classification | XGBoost, Decision Tree |
| LogP | Lipophilicity | Regression | XGBoost, Decision Tree |
| Solubility | ESOL | Regression | XGBoost, Decision Tree |
| Toxicity | ClinTox | Classification | XGBoost, Decision Tree |

To retrain models:
```bash
cd ml
python train_models.py
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/predict` | POST | Proxy to ML server — predict properties from SMILES |
| `/api/predict/compare` | POST | Compare predictions across model types |
| `/api/predict/save` | POST | Save prediction result to Supabase |
| ML: `/predict` | POST | Direct ML prediction (port 5001) |
| ML: `/health` | GET | ML server health check |
| ML: `/models` | GET | List available models |

## License

Private project.

