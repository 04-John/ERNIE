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

Set `DATA_MODE`:

- `simulated` — generates 100k wallets & ~60k transactions for demo
- `real` — pulls your live Blockradar wallet; falls back to simulated data if the API is unreachable (the dashboard says so in a red badge)

## How real data is interpreted

- Each Blockradar **child address = one fintech**, named after the address `name`.
- Blockradar addresses carry no activity or balance fields, so **activity comes from transactions** (successful deposits/withdrawals; internal `SALVAGE` sweeps are ignored) and **balances come from the per-address balance endpoint**.
- An address with no transactions is **"never active"** (not dormant); with no data its churn risk is **"Unknown"**. Dormant = last successful transaction more than 60 days ago.
- Only stablecoins (USDC, USDT, PYUSD, ...) are valued in USD (1:1); other assets are counted but not valued.
- Region/country/type are **not invented**. Set them by putting JSON in the address `metadata`, e.g. `{"country": "Kenya", "type": "Remittance"}` (`region` is derived from country, or set it directly). Otherwise they show as Unassigned / Unclassified.
- Data refreshes at startup, every `PIPELINE_SCHEDULE_HOURS` hours, and on demand via **Refresh now** (`POST /analytics/refresh`, max once per 30s). `GET /analytics/status` reports the source, last refresh and any fetch error.
- Up to 5,000 recent transactions are read per refresh.

---

## Why I built this

Blockradar is a 5-person team serving 100+ fintechs across 4 regions with $300M+ in transaction volume.

At that scale and team size, there's no dedicated system tracking which fintechs are going quiet, which wallets have gone dormant, or who's about to churn.

I built the solution and sent it as my pitch.

---

*Built April 2026*
