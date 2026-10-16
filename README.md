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

## Workspaces & Blockradar connections

ERNIE is multi-tenant. Every signup creates its own **workspace** and becomes its admin; all data is scoped to the workspace, and one workspace can never see another's.

- A workspace with no connection sees a shared, read-only **demo dataset** (clearly labelled).
- An admin connects a wallet under **Settings → Blockradar connection** (wallet ID + API key). The key is verified against Blockradar, then stored **encrypted** (Fernet, derived from `ENCRYPTION_KEY`) and is never returned by any endpoint or written to logs.
- A real workspace never falls back to demo data: if a sync fails it keeps its last good data and shows the error.
- `DATA_MODE=simulated` forces demo data for everyone (local development); `DATA_MODE=real` enables per-workspace connections.
- Self-hosting shortcut: set `BOOTSTRAP_ADMIN_EMAIL` plus `BLOCKRADAR_API_KEY` / `BLOCKRADAR_WALLET_ID` to auto-connect that one account.
- Upgrading an existing database is automatic: on startup users get a workspace (they become admin).

Run the tests with `cd backend && pip install -r requirements-dev.txt && pytest`.

## Email (password reset, confirmation, invites)

ERNIE sends email over plain **SMTP**, so any provider works (Resend, SendGrid, Postmark, Mailgun, Amazon SES, Gmail app password...). Without configuration it simply doesn't send: the app keeps working, password-reset requests still answer normally, and nothing sensitive is logged.

Set these on the API (`blockradar-api` on Render):

| Variable | Example |
|---|---|
| `EMAIL_BACKEND` | `smtp` |
| `SMTP_HOST` / `SMTP_PORT` | Resend `smtp.resend.com` / `465`, SendGrid `smtp.sendgrid.net` / `587`, Postmark `smtp.postmarkapp.com` / `587` |
| `SMTP_SECURITY` | `ssl` for port 465, `starttls` for 587 |
| `SMTP_USER` / `SMTP_PASSWORD` | Resend: `resend` / your API key. SendGrid: `apikey` / your API key |
| `EMAIL_FROM` | `ERNIE <no-reply@yourdomain.com>` (a sender your provider has verified) |
| `PUBLIC_APP_URL` | your site URL, e.g. `https://blockradar-web.onrender.com` |

What it enables: **forgot password** (1-hour single-use link, 3 per address per hour, ends all other sessions), **email confirmation** (banner + resend), and **emailed invites** (a checkbox on the Team card). Links are stored hashed, single-use and expire. Use `DEBUG=true` locally with the default `console` backend to see emails in the server log.

## How real data is interpreted

- Each Blockradar **child address = one fintech**, named after the address `name`.
- Blockradar addresses carry no activity or balance fields, so **activity comes from transactions** (successful deposits/withdrawals; internal `SALVAGE` sweeps are ignored) and **balances come from the per-address balance endpoint**.
- An address with no transactions is **"never active"** (not dormant); with no data its churn risk is **"Unknown"**. Dormant = last successful transaction more than 60 days ago.
- Only stablecoins (USDC, USDT, PYUSD, ...) are valued in USD (1:1); other assets are counted but not valued.
- Region/country/type are **not invented**. Set them by putting JSON in the address `metadata`, e.g. `{"country": "Kenya", "type": "Remittance"}` (`region` is derived from country, or set it directly). Otherwise they show as Unassigned / Unclassified.
- **Stored in your database.** Addresses, transactions and per-address balances are saved per workspace, so a restart rebuilds the dashboard instantly from the database instead of re-downloading everything. Disconnecting (or switching to a different wallet) permanently deletes that workspace's stored data and history.
- **First sync runs in the background** (the dashboard shows "Syncing…" and updates itself). It reads the full history, up to 40,000 transactions; beyond that the dashboard says so.
- **Later syncs are incremental.** ERNIE only stops early when the transaction list is provably newest-first and a whole page is already stored in a final status (never assumed). Otherwise it keeps paging, and it does a full re-fetch at least every 24 hours to catch stuck or changed transactions.
- Syncs run at startup catch-up, every `PIPELINE_SCHEDULE_HOURS` hours for every connected workspace, and on demand (`POST /analytics/refresh`, max once per 30s). `GET /analytics/status` reports the source, last refresh, last sync result and any error.
- **History.** One snapshot of the headline metrics is saved per workspace per day and powers the Trends chart (`GET /analytics/history`).
- If Blockradar is unreachable ERNIE serves the stored data and shows the error. It never substitutes demo data for a connected workspace.

---

## Why I built this

Blockradar is a 5-person team serving 100+ fintechs across 4 regions with $300M+ in transaction volume.

At that scale and team size, there's no dedicated system tracking which fintechs are going quiet, which wallets have gone dormant, or who's about to churn.

I built the solution and sent it as my pitch.

---

*Built April 2026*
