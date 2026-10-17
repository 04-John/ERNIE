<div align="center">

# ERNIE

**Engagement & Retention Network Intelligence Engine**

Know which fintechs are going quiet, *before* they churn.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white)
![Render](https://img.shields.io/badge/Deployed_on-Render-46E3B7?logo=render&logoColor=black)
[![CI](https://github.com/04-John/ERNIE/actions/workflows/ci.yml/badge.svg)](https://github.com/04-John/ERNIE/actions/workflows/ci.yml)

[Architecture](#1-system-architecture) · [Request lifecycle](#2-request-lifecycle-and-tenancy) · [Data pipeline](#3-data-pipeline) · [Scoring](#4-churn-scoring) · [Intelligence](#5-intelligence-layer) · [Alerts](#6-alerts) · [Auth](#7-accounts-workspaces-and-roles) · [Billing](#8-plans-and-billing) · [Public API](#9-public-api-pay-per-call) · [AI assistant](#10-ask-ernie-ai-assistant) · [Data model](#11-data-model) · [Security](#12-security-model) · [Deployment](#13-deployment) · [Frontend](#14-frontend-map)

</div>

> **How to read this page.** Every diagram below is live Mermaid, so GitHub draws it for you: click a diagram to zoom and pan. Sections marked **▶** open to reveal the detail. Everything here describes what the code does today, and each flow names the file that implements it.

---

## What ERNIE does

ERNIE connects to a [Blockradar](https://blockradar.co) wallet, turns its transactions into a picture of how each fintech customer is behaving, and tells you who is drifting away while there is still time to act.

| | Capability | Where to see it |
|---|---|---|
| 🎯 | **Explainable churn scoring.** Every fintech gets a risk tier and the exact reasons behind it | Overview, Fintech page |
| 💡 | **Insights engine.** Prioritised findings with a suggested next step, plus a retention health score | Insights |
| 📈 | **Forecast, anomalies, cohorts.** 30-day volume forecast and unusual-day detection | Analytics |
| 🔔 | **Alerts.** Email, Slack or signed webhooks when a fintech turns high risk | Settings → Alerts |
| 🤖 | **Ask ERNIE.** An AI analyst grounded in your own numbers (opt-in) | Ask ERNIE |
| 🔌 | **Public API.** Pay-per-call access with prepaid credits | Developers |
| 🏢 | **Multi-tenant SaaS.** Workspaces, roles, plans, billing, audit log, admin console | Settings, Admin |

---

## 1. System architecture

One FastAPI process serves every route, keeps each workspace's computed results in memory for instant reads, and persists everything that matters to PostgreSQL. The React app is a static site that talks to the API over HTTPS.

```mermaid
flowchart TB
    classDef client fill:#0b3d2e,stroke:#10D9A0,color:#eafff6
    classDef edge fill:#14213d,stroke:#5FAEFF,color:#eaf2ff
    classDef api fill:#1f2937,stroke:#A3FF3C,color:#f3ffe0
    classDef data fill:#2d1b4e,stroke:#B38CFF,color:#f4ecff
    classDef ext fill:#3b2a0a,stroke:#FFB938,color:#fff4de

    U["👤 Team member<br/>browser"]
    D["🧑‍💻 Customer backend<br/>API key"]
    WEB["blockradar-web<br/>React 19 + Vite static site"]

    subgraph API["blockradar-api · FastAPI + uvicorn"]
        ROUTERS["<b>Routers</b><br/>auth · workspace · account · admin<br/>analytics · churn · intelligence<br/>assistant · alerts · billing · developer<br/>v1 public API · status"]
        SERVICES["<b>Services</b><br/>data_loader + sync · churn_engine · intel/*<br/>alerts · assistant · billing · apiaccess<br/>plans · audit · auth · crypto · email · netsafe"]
        SCH["⏱ Scheduler<br/>every N hours"]
    end

    MEM[("In-memory state<br/>one result set per workspace")]
    PG[("PostgreSQL<br/>blockradar-db")]

    subgraph EXT["External services (all optional except Blockradar)"]
        direction LR
        BR["Blockradar API<br/>read-only"]
        ST["Stripe<br/>Checkout · Portal"]
        AN["Anthropic Claude<br/>opt-in, minimal data"]
        GO["Google OAuth"]
        SM["SMTP provider"]
        HK["Slack and customer webhooks<br/>signed, SSRF-checked"]
    end

    U --> WEB
    WEB -- "HTTPS + JWT" --> ROUTERS
    D -- "HTTPS + API key" --> ROUTERS
    ROUTERS --> SERVICES
    SCH --> SERVICES
    SERVICES <--> MEM
    SERVICES <--> PG
    SERVICES -- "outbound calls<br/>(Stripe also sends signed webhooks back)" --> EXT

    class U,D client
    class WEB edge
    class ROUTERS,SERVICES,SCH api
    class MEM,PG data
    class BR,ST,AN,GO,SM,HK ext
```

**Why this shape**

| Decision | Reason |
|---|---|
| In-memory results per workspace, rebuilt from the database on restart | Reads are instant and the dashboard never waits on Blockradar. A restart restores from stored data in seconds |
| Everything persistent lives in Postgres (SQLite locally) | One source of truth. Disconnecting a wallet or deleting a workspace removes its rows |
| Read-only Blockradar access | ERNIE can look but never move funds |
| Stripe and Anthropic are optional | With no keys the app runs normally: everyone is on Free and the assistant is hidden |

---

## 2. Request lifecycle and tenancy

Every signed-in request resolves *which data the caller may see* in one place (`app/api/deps.py`). Routes read only from the resolved context, never from global state, which is what keeps workspaces apart.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as FastAPI router
    participant D as deps.org_ctx
    participant DB as PostgreSQL
    participant M as In-memory state

    B->>A: GET /churn/scores (Authorization: Bearer JWT)
    A->>A: get_current_user: verify signature, expiry, password_changed_at
    A->>D: resolve workspace
    D->>DB: connection for user.org_id?
    alt workspace has a Blockradar connection
        D->>M: ensure_loaded(org_id)
        Note over M: first request since boot restores from DB instantly<br/>and catches up in the background
    else no connection yet
        D->>M: shared read-only demo dataset
    end
    M-->>A: ctx.state (only this workspace's results)
    A-->>B: JSON
```

<details>
<summary><b>▶ Rules the lifecycle enforces</b></summary>

- A connected workspace **never falls back to demo data.** If a sync fails it keeps its last good data and shows the error.
- Sessions issued before a password change or reset are rejected (`password_changed_at`).
- Every admin-only route depends on `require_admin`. Members can read, admins can change things.
- CORS allows every HTTP method the UI uses. A parametrised test walks every route and method so a missing verb can never silently break a browser feature again.
- `ensure_loaded` and `sync_now` answer within about 3 seconds and keep syncing in the background (`data_source: "syncing"`), so a large wallet never causes a proxy timeout.

</details>

---

## 3. Data pipeline

Blockradar addresses and transactions flow in, get stored per workspace, normalised, scored, analysed and then fanned out to the dashboard, alerts and history.

```mermaid
flowchart LR
    classDef trig fill:#3b2a0a,stroke:#FFB938,color:#fff4de
    classDef step fill:#1f2937,stroke:#A3FF3C,color:#f3ffe0
    classDef store fill:#2d1b4e,stroke:#B38CFF,color:#f4ecff
    classDef out fill:#0b3d2e,stroke:#10D9A0,color:#eafff6

    T1["🔌 Connect wallet"]:::trig
    T2["⏱ Scheduled<br/>every PIPELINE_SCHEDULE_HOURS"]:::trig
    T3["🔄 Manual refresh<br/>30 s cooldown"]:::trig
    T4["🚀 Startup catch-up"]:::trig

    F["Fetch from Blockradar<br/>addresses · transactions<br/>per-address balances"]:::step
    DBS[("stored_addresses<br/>stored_transactions")]:::store
    N["Normalise<br/>_build_from_db"]:::step
    C["Score churn<br/>churn_engine"]:::step
    I["Analyse<br/>forecast · anomalies<br/>cohorts · health · insights"]:::step
    ST[("In-memory state")]:::store
    P[("daily_snapshots<br/>fintech_daily<br/>insight_records")]:::store

    UI["📊 Dashboard"]:::out
    AL["🔔 Alerts<br/>transition detection"]:::out
    API["🔌 Public API"]:::out
    AI["🤖 Ask ERNIE context"]:::out

    T1 --> F
    T2 --> F
    T3 --> F
    T4 --> N
    F --> DBS --> N --> C --> I --> ST
    I --> P
    ST --> UI
    ST --> API
    ST --> AI
    C --> AL
```

<details>
<summary><b>▶ Incremental sync: how ERNIE avoids re-downloading everything</b></summary>

The first sync reads the whole history (up to 40,000 transactions, then the dashboard says it was truncated). Later syncs stop early *only when that is provably safe*.

```mermaid
flowchart TD
    A["Start sync"] --> B{"Full re-fetch due?<br/>first sync, forced,<br/>or older than 24 h"}
    B -- yes --> FULL["Page through everything<br/>up to 400 pages"]
    B -- no --> INC["Page newest first"]
    INC --> C{"Is the list provably<br/>newest-first?"}
    C -- no --> INC2["Keep paging<br/>never assume"]
    C -- yes --> D{"Is this whole page already stored<br/>in a final status?"}
    D -- no --> NEXT["Next page"] --> INC
    D -- yes --> STOP["Stop early"]
    FULL --> SAVE["Upsert rows, update balances<br/>for the addresses actually fetched"]
    INC2 --> SAVE
    STOP --> SAVE
    SAVE --> DONE["Rebuild state and run analysis"]
```

- Per-address balance lookups are time-boxed (8 at a time, 25 s budget). Addresses that were not reached keep their stored balance instead of resetting to zero.
- A different wallet on the same workspace purges the old wallet's stored data first, so histories never mix.

</details>

<details>
<summary><b>▶ How real Blockradar data is interpreted</b></summary>

- Each Blockradar **child address = one fintech**, named after the address `name`.
- Addresses carry no activity or balance fields, so **activity comes from transactions** (successful deposits and withdrawals; internal `SALVAGE` sweeps are ignored) and **balances come from the per-address balance endpoint**.
- An address with no transactions is **"never active"** (not dormant). With no data its risk is **"Unknown"**. Dormant means the last successful transaction was more than 60 days ago.
- Only stablecoins (USDC, USDT, PYUSD, ...) are valued in USD (1:1). Other assets are counted but not valued.
- Region, country and type are **never invented.** Set them in the address `metadata`, for example `{"country": "Kenya", "type": "Remittance"}`. Otherwise they show as Unassigned or Unclassified.

</details>

---

## 4. Churn scoring

A transparent, rule-based model. There are no real churn outcomes to train on yet, so it is explainable on purpose: every fintech's page shows how many points each signal contributed. Scores are *absolute*, so one fintech's score never depends on how the others are doing.

```mermaid
flowchart LR
    classDef sig fill:#1f2937,stroke:#A3FF3C,color:#f3ffe0
    classDef res fill:#0b3d2e,stroke:#10D9A0,color:#eafff6

    R["⏳ Silence vs its own rhythm<br/>weight 35%"]:::sig
    DM["💤 Share of dormant wallets<br/>weight 20%"]:::sig
    TR["📉 Volume vs previous 3 months<br/>weight 25%"]:::sig
    AC["🌱 Low activity<br/>weight 20%"]:::sig

    SUM(("Σ weighted<br/>0 – 1")):::res
    HI["🔴 High<br/>≥ 0.60"]:::res
    ME["🟠 Medium<br/>≥ 0.30"]:::res
    LO["🟢 Low<br/>below 0.30"]:::res
    UN["⚪ Unknown<br/>no transactions"]:::res

    R --> SUM
    DM --> SUM
    TR --> SUM
    AC --> SUM
    SUM --> HI
    SUM --> ME
    SUM --> LO
    SUM -. "0 transactions" .-> UN
```

<details>
<summary><b>▶ The four signals in detail</b></summary>

| Signal | Weight | What it measures |
|---|---:|---|
| **Silence vs its own rhythm** | 35% | Days since the last transaction, judged against *that fintech's own* usual gap (the 90th percentile gap between its active days). A bursty fintech that goes quiet for a week is normal. A daily one that goes quiet for a week is not. Fintechs with fewer than 4 gaps use a flat 90-day scale |
| **Dormant wallets** | 20% | Share of its wallets with no activity in 60+ days |
| **Volume trend** | 25% | Last 3 months of volume against the 3 months before. Skipped when there is no earlier period |
| **Low activity** | 20% | Fewer than 5 successful transactions is maximum risk, fewer than 20 is half |

Silence up to 2× the usual gap is treated as normal, and 8× or more as maximum risk. Daily per-fintech scores are stored (`fintech_daily`) so a trained model can be built later without losing history. Code: `backend/app/services/churn_engine.py`, tests: `tests/test_scoring.py`.

</details>

---

## 5. Intelligence layer

After scoring, a second pass turns raw numbers into things a person can act on.

```mermaid
flowchart LR
    classDef in fill:#2d1b4e,stroke:#B38CFF,color:#f4ecff
    classDef mod fill:#1f2937,stroke:#A3FF3C,color:#f3ffe0
    classDef out fill:#0b3d2e,stroke:#10D9A0,color:#eafff6

    IN1[("Daily volume series")]:::in
    IN2[("Scored fintechs")]:::in
    IN3[("Wallets and creation dates")]:::in
    IN4[("History snapshots")]:::in

    FC["Holt-Winters<br/>30-day forecast + range"]:::mod
    AN["Robust z-score<br/>anomaly days"]:::mod
    CO["Cohorts by creation month<br/>activated % · active %"]:::mod
    HE["Health score 0-100<br/>fintech health 40% · activation 25%<br/>momentum 20% · diversification 15%"]:::mod
    IE["Insights engine<br/>stable keys, priority ranking"]:::mod

    O1["Insights page + nav badge"]:::out
    O2["Forecast and anomaly charts"]:::out
    O3["Cohort table"]:::out
    O4["Health card"]:::out

    IN1 --> FC
    IN1 --> AN
    IN3 --> CO
    IN2 --> HE
    IN4 --> HE
    FC --> IE
    AN --> IE
    CO --> IE
    HE --> IE
    IN2 --> IE
    IE --> O1
    FC --> O2
    AN --> O2
    CO --> O3
    HE --> O4
```

Findings have a lifecycle, so they do not nag and they do not vanish silently:

```mermaid
stateDiagram-v2
    [*] --> Active: engine finds it
    Active --> Active: still true, last_seen updates
    Active --> Dismissed: user dismisses it
    Dismissed --> Active: the situation materially changes
    Active --> Resolved: condition no longer holds
    Resolved --> Active: it comes back
    Resolved --> [*]
```

Code: `backend/app/services/intel/` (series, forecast, cohorts, health, insights) and `intelligence.py`. A finding's identity is a stable key built from its kind and the fintechs involved (table `insight_records`).

---

## 6. Alerts

After every sync ERNIE compares each fintech's risk tier with the previous one and tells the team about *changes*, never the steady state.

```mermaid
flowchart TD
    A["Sync finished"] --> B["Compare each fintech<br/>with its stored risk_states row"]
    B --> C{"First sync<br/>for this workspace?"}
    C -- yes --> BASE["Record a baseline<br/>send nothing"]
    C -- no --> D{"Changed?"}
    D -- "became High" --> E{"Alerted for this fintech<br/>in the last 24 h?"}
    E -- yes --> SKIP["Suppress<br/>flapping fintech"]
    E -- no --> SEND
    D -- "recovered from High" --> SEND
    D -- "no change" --> NONE["Nothing to say"]
    F["Blockradar sync starts failing"] --> SEND
    SEND["Build ONE digest"] --> H[("Save to alert_events<br/>shown in the bell")]
    SEND --> CH{"For each enabled channel"}
    CH --> EM["📧 Email<br/>workspace members only"]
    CH --> SL["💬 Slack<br/>incoming webhook"]
    CH --> WH["🔗 Webhook<br/>HMAC-SHA256 signed"]
    SL --> G["netsafe: https, public IP,<br/>port 443, no redirects"]
    WH --> G
```

<details>
<summary><b>▶ Webhook contract and SSRF protection</b></summary>

Webhooks receive JSON with `type: "ernie.alerts"` and the header `X-ERNIE-Signature: sha256=<HMAC-SHA256 of the raw body, keyed with the secret shown once at creation>`.

Webhook and Slack URLs must be `https`, public, port 443 and carry no credentials. The hostname is resolved and rejected if *any* address is private or internal (localhost, 10.x, 169.254.169.254, ...). The check repeats on every send, so a DNS change after the channel was saved is caught, and redirects are never followed. Targets are encrypted at rest and never returned in full. A failing channel is flagged in Settings and never affects syncing.

</details>

---

## 7. Accounts, workspaces and roles

Every signup creates a **workspace** and makes that person its admin. All data is scoped to the workspace.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    actor Mate as Teammate
    participant API as FastAPI
    participant DB as PostgreSQL
    participant Mail as SMTP

    rect rgb(15, 40, 32)
    Note over Admin,DB: Sign up
    Admin->>API: POST /auth/register (or Google OAuth)
    API->>DB: create organization + user (role admin, bcrypt hash)
    API-->>Admin: JWT
    end

    rect rgb(20, 28, 48)
    Note over Admin,Mate: Invite
    Admin->>API: POST /workspace/invites (plan limit checked)
    API->>DB: store SHA-256 of a random token, never the token
    API-->>Admin: link shown once
    opt "email the link" ticked and SMTP configured
        API->>Mail: send invite email
    end
    Mate->>API: POST /auth/register with invite_token
    API->>DB: join that workspace as member, mark invite used
    end
```

| Role | Can do |
|---|---|
| **Admin** | Everything: connect or disconnect Blockradar, manage team, alert channels, API keys, billing, AI opt-in, export and delete |
| **Member** | Read dashboards, insights, history and the activity bell. Ask ERNIE once an admin enabled it |
| **Platform admin** | Operates the whole product from `#/admin`. Set by `PLATFORM_ADMIN_EMAILS` and requires a verified email. Anyone else gets a 404, so the console does not advertise itself |

<details>
<summary><b>▶ Email flows (password reset, confirmation, invites)</b></summary>

ERNIE sends over plain **SMTP**, so any provider works (Resend, SendGrid, Postmark, Mailgun, SES, a Gmail app password). Without configuration it simply does not send: the app keeps working and nothing sensitive is logged.

- **Forgot password:** 1-hour single-use link, 3 per address per hour, and it ends all other sessions.
- **Email confirmation:** banner and resend, links valid 48 hours.
- **Emailed invites:** a checkbox on the Team card.
- Links are stored **hashed**, single-use and expiring.

| Variable | Example |
|---|---|
| `EMAIL_BACKEND` | `smtp` (default `console` prints emails to the server log in dev) |
| `SMTP_HOST` / `SMTP_PORT` | Resend `smtp.resend.com` / `465`, SendGrid `smtp.sendgrid.net` / `587` |
| `SMTP_SECURITY` | `ssl` for 465, `starttls` for 587 |
| `SMTP_USER` / `SMTP_PASSWORD` | Resend: `resend` / API key. SendGrid: `apikey` / API key |
| `EMAIL_FROM` | `ERNIE <no-reply@yourdomain.com>` (a verified sender) |
| `PUBLIC_APP_URL` | the site URL, used to build links in emails |

</details>

---

## 8. Plans and billing

Plans are plain data in `backend/app/services/plans.py`. Limits are enforced on the server and hitting one returns **HTTP 402** with an upgrade message.

| | Free | Pro | Business |
|---|---:|---:|---:|
| Price | $0 | $49 / mo | $199 / mo |
| Team members | 2 | 10 | 50 |
| Alert channels | 1 | 5 | 10 |
| Ask ERNIE messages / month | 10 | 300 | 2,000 |
| Chart history | 30 days | 365 days | 800 days |

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant UI as Settings → Plan
    participant API as /billing
    participant S as Stripe
    participant DB as PostgreSQL

    Admin->>UI: choose Pro
    UI->>API: POST /billing/checkout {plan}
    API->>S: create Checkout Session (metadata: org_id, plan)
    S-->>UI: hosted checkout URL
    Admin->>S: pays on Stripe's page (card never touches ERNIE)
    S->>API: POST /billing/webhook (Stripe-Signature)
    API->>API: verify signature, reject stale or forged events
    API->>DB: set plan, subscription id, status (idempotent)
    API->>DB: audit log: plan.changed by "stripe"
    UI-->>Admin: new plan appears (page re-checks for a few seconds)
```

The browser can **never** change a plan. Only a verified webhook (or a platform admin) can.

```mermaid
stateDiagram-v2
    [*] --> Free
    Free --> Paid: checkout completed and paid
    Paid --> Paid: upgrade or downgrade in the portal
    Paid --> PastDue: card fails, Stripe retries
    PastDue --> Paid: card fixed
    PastDue --> Free: retries exhausted (unpaid)
    Paid --> Free: subscription canceled
    Free --> [*]: workspace deleted (subscription canceled first)
```

<details>
<summary><b>▶ Webhook safety properties (all covered by tests)</b></summary>

- Unsigned, forged, wrongly-keyed or replayed (old timestamp) events change nothing.
- Duplicate and out-of-order deliveries are harmless: handlers *set* state instead of incrementing it, and a late event about an old subscription cannot overwrite the current one.
- An unpaid checkout never upgrades. Unknown workspaces and unrelated event types are acknowledged with `200` so Stripe stops retrying.
- Stripe errors are logged by type only and never shown to customers.

**Switching billing on:** create two recurring monthly Prices, then set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, add a webhook endpoint at `<API URL>/billing/webhook` for `checkout.session.completed` and `customer.subscription.created|updated|deleted`, and set `STRIPE_WEBHOOK_SECRET`. Also activate the Customer Portal in Stripe. Without keys everyone stays on Free.

</details>

---

## 9. Public API (pay per call)

Businesses can wire ERNIE into their own systems. An admin creates keys in **Developers**, tops up prepaid credits through Stripe, and each successful call spends a few credits.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer backend
    participant V as /v1 router
    participant K as apiaccess
    participant W as Workspace data
    participant DB as PostgreSQL

    C->>V: GET /v1/fintechs (Bearer ernie_live_...)
    V->>K: authenticate: SHA-256 lookup, not revoked
    alt unknown or revoked key
        V-->>C: 401
    end
    V->>V: per-key rate limit (300/min live, 30/min test)
    alt test key
        V->>W: demo dataset, never the real data
        V-->>C: 200, X-Credits-Charged: 0
    else live key
        V->>W: this workspace's results (409 if no wallet, 503 if still syncing)
        V->>V: compute the response (404 and 422 are never billed)
        V->>DB: UPDATE credits = credits - cost WHERE credits >= cost
        alt wallet cannot cover it
            V-->>C: 402, no data returned
        else
            V-->>C: 200 + X-Credits-Charged + X-Credits-Remaining
        end
    end
```

| Endpoint | Credits | $ per call |
|---|---:|---:|
| `GET /v1/health` | 2 | $0.002 |
| `GET /v1/insights` | 2 | $0.002 |
| `GET /v1/fintechs` | 5 | $0.005 |
| `GET /v1/history` | 5 | $0.005 |
| `GET /v1/fintechs/{id}` | 10 | $0.010 |
| `GET /v1/usage` | free | free |

One credit is $0.001. Top-ups: **$10** → 10,000 credits, **$50** → 55,000 (+10%), **$200** → 240,000 (+20%). Prices live in `backend/app/services/apiaccess.py` and are a starting point to tune against real usage.

<details>
<summary><b>▶ Guarantees</b></summary>

- **Keys** are random, stored only as a SHA-256 hash, shown once, revocable instantly, capped at 10 active per workspace.
- **Spending is one atomic conditional `UPDATE`.** Twenty concurrent calls against a 10-credit balance can never overspend. A test hammers it from threads.
- **Only successful calls are billed.** Errors, unknown ids and invalid parameters are free.
- **A replayed Stripe webhook can never credit twice**: the Stripe session id is unique, and the amount paid must match a real pack.
- **Credits are prepaid usage credit.** They do not expire, cannot be withdrawn or transferred, and are non-refundable once bought. Have a lawyer review this wording before launch.

</details>

---

## 10. Ask ERNIE (AI assistant)

A chat analyst and a "Draft outreach" button, grounded in the workspace's own numbers. It is **off by default**, and nothing leaves the server until an admin opts in.

```mermaid
sequenceDiagram
    autonumber
    actor U as Team member
    participant R as /assistant
    participant G as Gate
    participant X as Context builder
    participant L as Claude

    U->>R: POST /assistant/chat
    R->>G: key configured? workspace opted in?
    G->>G: per-user limit (20/min), monthly plan allowance
    alt any check fails
        R-->>U: 503 / 403 / 429 with a clear message
    end
    R->>X: build context from ctx.state
    Note over X: aggregated fintech-level facts only.<br/>No API keys, wallet addresses, tx hashes,<br/>emails or team details
    X->>L: system prompt + data inside a labelled block
    Note over L: the block is declared to be DATA,<br/>never instructions (fintech names are customer text)
    L-->>R: answer
    R->>R: count the message and tokens for the month
    R-->>U: reply + usage
```

<details>
<summary><b>▶ Privacy and safety rules (each has a test)</b></summary>

- **Sent:** fintech names, regions and types, volumes, transaction counts, risk scores and their reasons, current findings, health score.
- **Never sent:** Blockradar API key, wallet addresses, transaction hashes, email addresses, user or workspace ids.
- **Prompt-injection defence:** customer-supplied text sits inside a `<workspace_data>` block that the system prompt declares to be data.
- **Resilience:** server-side model fallbacks when available, calm messages on rate limits and outages, and a loud `OPERATOR ACTION NEEDED` log line (with a friendly message for customers) if the provider account runs out of credit.
- **Config:** `ANTHROPIC_API_KEY`, optional `ASSISTANT_MODEL`, `ASSISTANT_FALLBACKS`, `AI_MONTHLY_LIMIT` (0 means use each plan's allowance).

</details>

---

## 11. Data model

Every business table hangs off `organizations`, and every row is keyed by workspace. Deleting a workspace removes them all.

**Accounts, access and money**

```mermaid
erDiagram
    organizations ||--o{ users : "has members"
    organizations ||--o| blockradar_connections : "connects one wallet"
    organizations ||--o{ invites : "issues"
    organizations ||--o{ alert_channels : "delivers to"
    organizations ||--o{ api_keys : "owns"
    organizations ||--o{ credit_transactions : "top-ups"
    organizations ||--o{ api_usage_daily : "metering"
    organizations ||--o{ ai_usage : "per month"
    organizations ||--o{ audit_events : "who did what"
    users ||--o{ auth_tokens : "reset and verify links"

    organizations {
        string id PK
        string name
        string plan "free | pro | business"
        int credits "prepaid API credits"
        bool ai_enabled "opt-in"
        string stripe_customer_id
        string stripe_subscription_id
        string subscription_status
    }
    users {
        string id PK
        string org_id FK
        string email UK
        string role "admin | member"
        string hashed_password "bcrypt, null for Google"
        bool is_verified
    }
    blockradar_connections {
        string org_id FK
        string wallet_id
        text api_key_enc "Fernet encrypted"
        string api_key_last4
        datetime last_synced_at
        text last_error
    }
    alert_channels {
        string id PK
        string kind "email | slack | webhook"
        text target_enc "encrypted"
        text secret_enc "webhook signing secret"
        bool enabled
    }
    api_keys {
        string id PK
        string key_hash UK "SHA-256 only"
        string prefix "safe to display"
        string mode "live | test"
        datetime revoked_at
    }
    credit_transactions {
        string id PK
        int delta
        string ref UK "Stripe session id"
        int balance_after
    }
    api_usage_daily {
        string org_id PK
        date day PK
        string endpoint PK
        int calls
        int credits
    }
```

**Synced data, scoring and monitoring**

```mermaid
erDiagram
    organizations ||--o{ stored_addresses : "syncs"
    organizations ||--o{ stored_transactions : "syncs"
    organizations ||--o{ daily_snapshots : "one per day"
    organizations ||--o{ fintech_daily : "one per fintech per day"
    organizations ||--o{ insight_records : "findings"
    organizations ||--o{ risk_states : "last known tier"
    organizations ||--o{ alert_events : "history"

    stored_addresses {
        string org_id PK
        string id PK "Blockradar address id"
        float balance_usd
        text data
    }
    stored_transactions {
        string org_id PK
        string id PK
        string status "PENDING | SUCCESS | FAILED"
        datetime created_at
        text data
    }
    daily_snapshots {
        string org_id PK
        date day PK
        float total_volume_usd
        int high_risk
        float health_score
    }
    fintech_daily {
        string org_id PK
        string fintech_id PK
        date day PK
        string risk
        float probability
    }
    insight_records {
        string org_id PK
        string key PK "stable identity"
        string severity
        datetime resolved_at
        datetime dismissed_at
    }
    risk_states {
        string org_id PK
        string fintech_id PK
        string risk
        datetime last_alert_at "24 h throttle"
    }
    alert_events {
        string id PK
        string kind "high_risk | recovered | sync_failed"
        string title
        datetime created_at
    }
```

Schema upgrades are automatic: on startup `run_migrations()` adds any missing column to an existing database (SQLite or Postgres) and backfills workspaces for older users. New tables are created by `create_all`.

---

## 12. Security model

Defence in depth, with the same few rules applied everywhere: **secrets are encrypted or hashed at rest, never returned, never logged; every query is scoped to a workspace; every outbound call is constrained.**

```mermaid
flowchart LR
    classDef bad fill:#4a1520,stroke:#FF6B78,color:#ffe8eb
    classDef gate fill:#1f2937,stroke:#A3FF3C,color:#f3ffe0
    classDef ok fill:#0b3d2e,stroke:#10D9A0,color:#eafff6

    REQ["Incoming request"]:::bad --> L1["TLS + CORS allow-list"]:::gate
    L1 --> L2["Rate limits<br/>auth 10/min per IP · AI 20/min per user<br/>API 300/min per key · refresh 30 s"]:::gate
    L2 --> L3{"Identity"}:::gate
    L3 -- "JWT" --> L4["Signature, expiry,<br/>password-change cutoff"]:::gate
    L3 -- "API key" --> L5["SHA-256 lookup, revoked check"]:::gate
    L3 -- "Stripe" --> L6["Webhook signature + replay window"]:::gate
    L4 --> L7["Role check<br/>require_admin"]:::gate
    L7 --> L8["Workspace scoping<br/>org_ctx"]:::gate
    L5 --> L8
    L6 --> L8
    L8 --> OK["Handler runs"]:::ok
```

| Concern | Control |
|---|---|
| **Passwords** | bcrypt. Reset and verify links are single-use, hashed, expiring. Password change ends other sessions |
| **Blockradar API keys** | Verified against Blockradar before saving, stored with Fernet (`ENCRYPTION_KEY`), only the last 4 characters ever shown |
| **Alert targets and webhook secrets** | Encrypted at rest, never returned in full |
| **API keys** | Random, stored as SHA-256, shown once |
| **Outbound webhooks** | HMAC-signed. SSRF guard: https only, public IPs only, port 443, re-resolved on each send, no redirects |
| **Payments** | Card details never reach ERNIE (Stripe-hosted pages). Plans and credits change only from a verified webhook |
| **AI** | Opt-in, minimal data, injection-resistant prompt, metered |
| **Tenant isolation** | Every table keyed by workspace. A test suite checks cross-workspace reads, writes, keys and deletes |
| **Audit** | Admin actions are recorded (who, what, when) without secrets |
| **Your data** | Export (no secrets) and deletion, with Stripe cancelled first |

---

## 13. Deployment

`render.yaml` is a Blueprint: static site + API + Postgres. Pushing to `main` auto-deploys both services.

```mermaid
flowchart LR
    classDef dev fill:#14213d,stroke:#5FAEFF,color:#eaf2ff
    classDef r fill:#0b3d2e,stroke:#10D9A0,color:#eafff6
    classDef d fill:#2d1b4e,stroke:#B38CFF,color:#f4ecff

    DEV["💻 Developer"]:::dev -- "git push main" --> GH["GitHub"]:::dev
    GH -- "auto-deploy" --> WEB["blockradar-web<br/>npm ci && npm run build<br/>serves dist/"]:::r
    GH -- "auto-deploy" --> API["blockradar-api<br/>pip install -r requirements.txt<br/>uvicorn app.main:app"]:::r
    API <--> DB[("blockradar-db<br/>PostgreSQL")]:::d
    WEB -- "VITE_API_BASE_URL" --> API
    STR["Stripe"] -- "/billing/webhook" --> API
```

<details>
<summary><b>▶ First-time setup checklist</b></summary>

1. Deploy the Blueprint. After the first deploy set `CORS_ORIGINS` on the API to the site URL and `VITE_API_BASE_URL` on the site to the API URL, then redeploy the site.
2. Add the site URL to *Authorized JavaScript origins* in Google Cloud Console (for Google sign-in).
3. Set `ENCRYPTION_KEY` once and **never change it** afterwards, or stored Blockradar keys stop decrypting.
4. Set `PLATFORM_ADMIN_EMAILS` to your sign-in email to unlock `#/admin`.
5. Optional: `BOOTSTRAP_ADMIN_EMAIL` with `BLOCKRADAR_API_KEY` / `BLOCKRADAR_WALLET_ID` to auto-connect that one account (self-hosting shortcut).
6. Optional: `ANTHROPIC_API_KEY` (the account needs credit), the four `STRIPE_*` values, SMTP settings, and `VITE_SUPPORT_EMAIL` on the site so the legal pages show a contact address.

Operations: point an uptime monitor at `GET /status`. It reports the API, database and scheduled refresh, and which optional features are configured, without exposing anything about any workspace.

</details>

---

## 14. Frontend map

A React 19 single-page app with hash routing (`#/route`), lazy-loaded pages and TanStack Query for data. Public pages work signed in or out.

```mermaid
flowchart TD
    classDef pub fill:#14213d,stroke:#5FAEFF,color:#eaf2ff
    classDef app fill:#0b3d2e,stroke:#10D9A0,color:#eafff6
    classDef adm fill:#3b2a0a,stroke:#FFB938,color:#fff4de

    BOOT["index.html<br/>splash paints before any JavaScript"] --> APP{"App state"}
    APP -- "no token" --> LAND["Landing<br/>features · pricing · FAQ"]:::pub
    LAND --> LOGIN["Sign in"]:::pub
    LAND --> SIGNUP["Sign up / accept invite"]:::pub
    LOGIN --> DASH
    SIGNUP --> DASH
    APP -- "valid token" --> DASH["Dashboard shell"]:::app

    DASH --> OV["#/overview"]:::app
    DASH --> IN["#/insights"]:::app
    DASH --> AS["#/assistant<br/>Ask ERNIE"]:::app
    DASH --> AN["#/analytics"]:::app
    DASH --> WA["#/wallets"]:::app
    DASH --> DV["#/developers<br/>keys · credits · usage · docs"]:::app
    DASH --> ST["#/settings<br/>plan · connection · team · alerts<br/>activity log · your data"]:::app
    AN --> FD["#/fintech/id<br/>score, reasons, history, draft outreach"]:::app
    DASH -. "platform admins only" .-> AD["#/admin"]:::adm

    PUB["Public, any state"]:::pub --> TM["#/terms"]:::pub
    PUB --> PV["#/privacy"]:::pub
    PUB --> SS["#/status"]:::pub
```

Design system: one token set (`frontend/src/index.css`) drives both themes. Dark is pitch black, light is a soft grey-white, and the brand is a lime-to-emerald gradient. Type is Bricolage Grotesque for display (16px and up) and Geist for everything else, with JetBrains Mono for data. The landing page is dark-only with a live "ledger lanes" canvas, a five-step scrollytelling section, an interactive copy of the real scoring model and an optional, off-by-default sound layer. Clicking any fintech anywhere in the app opens a right-hand drawer with its score, reasons and risk history. Splash, canvases and animations respect reduced-motion settings.

---

## Quick start

**Requirements:** Python 3.11, Node 20+.

```bash
# 1. configure
cp .env.example backend/.env            # Windows: copy .env.example backend\.env
cp frontend/.env.example frontend/.env
# set SECRET_KEY (32+ chars): python -c "import secrets; print(secrets.token_urlsafe(48))"
# leave DATABASE_URL unset for local SQLite. DATA_MODE=simulated gives everyone the demo dataset.

# 2. backend
cd backend
python -m venv venv
source venv/bin/activate                # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 3. frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. With `DEBUG=true` the API docs are at http://localhost:8000/docs and emails are printed to the server log.

**Docker:** `cp .env.example .env` (set `SECRET_KEY` and `POSTGRES_PASSWORD`), then `docker compose up --build`.

**Tests:** `cd backend && pip install -r requirements.txt -r requirements-dev.txt && pytest` (scoring, tenancy, billing, API metering, security, migrations, CORS).

**Continuous integration:** `.github/workflows/ci.yml` runs the backend tests (Python 3.11) and the frontend lint and build (Node 20) on every push to `main` and every pull request. The tests use a throwaway database and no real keys, so CI cannot reach Stripe, Anthropic or Blockradar. To stop broken code reaching production, set Render's *Auto-Deploy* to **After CI checks pass** on both services, and in GitHub add a branch rule that requires the two checks.

<details>
<summary><b>▶ Configuration reference</b></summary>

| Group | Variable | Purpose |
|---|---|---|
| **Core** | `SECRET_KEY` | Signs login tokens. Required, 32+ characters |
| | `ENCRYPTION_KEY` | Encrypts stored Blockradar keys and alert targets. Set once, never change |
| | `DATABASE_URL` | Postgres in production, SQLite when unset |
| | `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |
| | `DEBUG` | Enables `/docs` and console email |
| **Data** | `DATA_MODE` | `real` (per-workspace connections) or `simulated` (demo for all) |
| | `PIPELINE_SCHEDULE_HOURS` | How often every connected workspace re-syncs (default 6) |
| | `BOOTSTRAP_ADMIN_EMAIL`, `BLOCKRADAR_API_KEY`, `BLOCKRADAR_WALLET_ID` | Auto-connect one account (self-hosting) |
| **Auth** | `GOOGLE_CLIENT_ID` | Google sign-in |
| **Email** | `EMAIL_BACKEND`, `SMTP_*`, `EMAIL_FROM`, `PUBLIC_APP_URL` | See the email section above |
| **AI** | `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`, `ASSISTANT_FALLBACKS`, `AI_MONTHLY_LIMIT` | Ask ERNIE |
| **Billing** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Plans and API credit top-ups |
| **Platform** | `PLATFORM_ADMIN_EMAILS` | Who can open the admin console (must be verified) |
| **Frontend build** | `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_SUPPORT_EMAIL` | Baked in at build time, so redeploy the site after changing them |

</details>

<details>
<summary><b>▶ Repository map</b></summary>

```text
.
├── render.yaml                     Blueprint: static site + API + Postgres
├── docker-compose.yml              Local Postgres + API + site
├── .env.example                    Every setting, documented
├── backend/
│   ├── app/
│   │   ├── main.py                 App, CORS, router wiring, startup (tables, migrations, demo warm-up, scheduler)
│   │   ├── core/                   config, database, scheduler, in-memory state
│   │   ├── api/
│   │   │   ├── deps.py             org_ctx / load_workspace: the tenancy gate
│   │   │   └── routes/             auth · workspace · account · admin · analytics · churn · intelligence
│   │   │                           alerts · assistant · billing · developer · v1 (public API) · status
│   │   ├── models/                 SQLAlchemy tables (one file per area)
│   │   └── services/
│   │       ├── blockradar.py       API client (read-only)
│   │       ├── sync.py             incremental sync, snapshots, history, insight persistence
│   │       ├── data_loader.py      state lifecycle: ensure_loaded, sync_now, refresh_state
│   │       ├── churn_engine.py     explainable scoring
│   │       ├── intelligence.py + intel/   forecast, anomalies, cohorts, health, insights
│   │       ├── alerts.py + netsafe.py     transition detection, delivery, SSRF guard
│   │       ├── assistant.py        Claude integration, privacy rules, metering
│   │       ├── plans.py · billing.py · apiaccess.py · audit.py · account.py
│   │       └── auth.py · crypto.py · email.py · tenancy.py · simulator.py
│   └── tests/                      the backend test suite
└── frontend/
    ├── index.html                  splash screen + theme bootstrap
    └── src/
        ├── pages/                  Landing · Dashboard shell · Overview · Insights · Analytics · Wallets
        │                           FintechDetail · Assistant · Developers · SettingsPage · Admin · auth pages
        ├── components/             charts, cards, ApiConsole, PlanCard, Starfield, ...
        ├── hooks/useAnalytics.js   every query and mutation
        ├── api/client.js           axios client + all endpoint functions
        └── index.css               design tokens for both themes
```

</details>

<details>
<summary><b>▶ Internal API (used by the web app, JWT)</b></summary>

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `/auth/login` · `/auth/google` · `GET /auth/me` · password reset and email verification routes |
| Workspace | `GET /workspace` · `PUT/DELETE /workspace/connection` · `/workspace/members` · `/workspace/invites` · `GET /workspace/audit` · `GET /workspace/export` · `DELETE /workspace` · `DELETE /account` |
| Wallets | `GET /wallets/dormancy` · `GET /wallets/activity?status=active\|dormant\|never` · `activity-trend` |
| Analytics | `GET /analytics/summary` · `monthly-volume` · `regional` · `type-breakdown` · `status` · `history` · `POST /analytics/refresh` |
| Churn | `GET /churn/scores` (each row carries its one-line `top_reason`) · `high-risk` · `distribution` · `sparklines?ids=` · `fintech/{id}` |
| Intelligence | `GET /intelligence/insights` · `forecast` · `cohorts` · `health` · `POST /intelligence/insights/dismiss` · `POST /intelligence/insights/restore` |
| Alerts | `GET/POST /workspace/alerts/channels` · `PATCH/DELETE .../{id}` · `POST .../{id}/test` · `GET /workspace/alerts/events` |
| Assistant | `GET /assistant/status` · `PUT /assistant/settings` · `POST /assistant/chat` · `POST /assistant/draft-outreach` |
| Billing | `GET /billing/plans` (public) · `GET /billing` · `POST /billing/checkout` · `/billing/portal` · `/billing/webhook` (signature) |
| Developer | `GET /developer` · `POST /developer/keys` · `DELETE /developer/keys/{id}` · `GET /developer/usage` · `POST /developer/topup` |
| Public | `GET /v1/pricing` (the API price list, no key needed) |
| Platform | `GET /admin/overview` · `/admin/workspaces` · `PATCH /admin/workspaces/{id}/plan` · public `GET /status` · `GET /health` |

All of these except `/auth/*`, `/billing/plans`, `/billing/webhook`, `/status` and `/health` need a Bearer login token. The public `/v1/*` API uses API keys instead (section 9).

</details>

---

## Known limits and roadmap

- **Single API instance.** Per-workspace results and rate-limit counters live in process memory. Scaling out needs them moved to Redis.
- **Wallets above about 40,000 transactions** are truncated (and the dashboard says so).
- **No trained model yet.** Scoring is rule-based until real churn outcomes exist. Daily per-fintech scores are already stored for that day.
- **Not built:** per-plan limits on tracked addresses, error monitoring (Sentry), SSO, usage-based invoicing, enforced email verification (deferred by choice).
- **Needs a lawyer before launch:** the Terms, Privacy Policy and the API credit wording.

---

## Origin

ERNIE began as a pitch to Blockradar, a small team serving 100+ fintechs across four regions with $300M+ in volume and no system for noticing which customers were going quiet. It has since grown into a multi-tenant product. ERNIE is an independent project and is not affiliated with or endorsed by Blockradar.
