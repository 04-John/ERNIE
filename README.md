  # ERNIE

> Engagement & Retention Network Intelligence Engine

Built using Blockradar as a case study.

---

## What it does

- **Churn Risk Scoring** — rule-based model that scores every fintech by probability of going inactive
- **Wallet Dormancy Tracking** — identifies wallets with no activity in 60+ days
- **Regional Performance** — Africa, LatAm, Middle East & Southeast Asia breakdown
- **Transaction Volume Trends** — 18-month regional volume analysis
- **Real-time Alerts** — flags high risk fintechs before they churn

---

## Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Scoring | Rule-based churn scoring (pandas, numpy) |
| Database | PostgreSQL + SQLAlchemy |
| Frontend | React + Recharts |
| Auth | Google OAuth + JWT |
| Data Source | Blockradar REST API |
| Infra | Docker + docker-compose |

---

## Getting Started

### 1. Configure environment
```bash
cp .env.example backend/.env        # Windows: copy .env.example backend\.env
cp frontend/.env.example frontend/.env
```
Set `SECRET_KEY` (32+ chars: `python -c "import secrets; print(secrets.token_urlsafe(48))"`).
Leave `DATABASE_URL` unset to use local SQLite; set `DATA_MODE=real` plus the Blockradar keys for live data.

### 2. Run the backend (Python 3.11)
```bash
cd backend
python -m venv venv
venv\Scriptsctivate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Run the frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 (with `DEBUG=true`, API docs are at http://localhost:8000/docs).

### Docker
```bash
cp .env.example .env   # set SECRET_KEY, POSTGRES_PASSWORD, ...
docker compose up --build
```

### Deploy (Render)
`render.yaml` is a Blueprint: API + Postgres + static site. After the first deploy set
`CORS_ORIGINS` (API) to the site URL and `VITE_API_BASE_URL` (site) to the API URL, then redeploy the site.
Google sign-in also needs the site URL added to *Authorized JavaScript origins* in Google Cloud Console.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/analytics/summary` | Top-level KPIs |
| GET | `/analytics/monthly-volume` | Monthly volume by region |
| GET | `/analytics/regional` | Per-region aggregates |
| GET | `/churn/scores` | Churn scores for all fintechs |
| GET | `/churn/high-risk` | High risk fintechs only |
| GET | `/churn/distribution` | Risk tier counts |
| GET | `/wallets/dormancy` | Dormancy stats by region |
| GET | `/wallets/activity` | Raw wallet activity |

All endpoints except `/auth/*` and `/health` require a Bearer token. Interactive docs at `/docs` when `DEBUG=true`.

---

## Data Modes

Set `DATA_MODE` in `backend/.env`:

- `simulated` — generates 100k wallets & ~60k transactions for demo
- `real` — connects to your live Blockradar account via API

---

## Data & API Connection

> This platform is connected to a **live Blockradar account** via their REST API. Real wallet addresses and account data are fetched directly from Blockradar's infrastructure on startup.
>
> Current account is on the free plan with 6 active wallet addresses and no transactions yet. As wallets transact, the churn model, dormancy tracker, and volume charts will populate with fully live data automatically.
>
> To run with simulated data at scale (100k wallets, 150k transactions across 100+ fintechs), set `DATA_MODE=simulated` in your `.env` file.
---

## Why I built this

Blockradar is a 5-person team serving 100+ fintechs across 4 regions with $300M+ in transaction volume.

At that scale and team size, there's no dedicated system tracking which fintechs are going quiet, which wallets have gone dormant, or who's about to churn.

I built the solution and sent it as my pitch.

---

*Built April 2026*
