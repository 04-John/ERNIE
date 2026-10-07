from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.api.routes import analytics, churn, wallets, auth
from app.services.auth import get_current_user
import asyncio
from datetime import datetime

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 55)
    print("  BLOCKRADAR INTELLIGENCE API")
    print("=" * 55)
    print(f"  Mode     : {settings.data_mode.upper()}")
    if settings.debug:
        print(f"  Docs     : http://localhost:{settings.api_port}/docs")
    print("=" * 55)

    # create database tables
    from app.core.database import create_tables
    from app.models import user, wallet, transaction  # import models so SQLAlchemy sees them
    create_tables()
    print("  OK Database tables ready")

    from app.core.state import app_state
    from app.services.churn_engine import run_churn_pipeline

    if settings.data_mode == "real":
        print("\nFetching REAL data from Blockradar API...")
        try:
            from app.services.blockradar import BlockradarClient
            client = BlockradarClient()

            # ping first
            alive = await client.ping()
            if not alive:
                raise Exception("API key invalid or wallet ID wrong — falling back to simulation")

            print("  OK Blockradar API connected")

            # fetch real addresses and transactions
            print("  Fetching addresses...")
            addresses_raw = await client.get_all_addresses()
            print(f"  -> {len(addresses_raw)} addresses fetched")

            print("  Fetching transactions...")
            transactions_raw = await client.get_all_transactions(max_pages=20)
            print(f"  -> {len(transactions_raw)} transactions fetched")

            # normalize to our internal format
            addresses = _normalize_addresses(addresses_raw, settings.blockradar_wallet_id)
            transactions = _normalize_transactions(transactions_raw)

            print(f"  Normalized: {len(addresses)} addresses, {len(transactions)} transactions")
            used_real_data = True
            # if real API returns no data yet, fall back to simulation
            if len(addresses) == 0:
              print("\n  WARN No addresses found in your Blockradar wallet yet.")
              print("  This is normal for a new account.")
              print("  Falling back to SIMULATED data for dashboard demo...\n")
              from app.services.simulator import run_simulation
              raw = run_simulation()
              addresses = raw["addresses"]
              transactions = raw["transactions"]
              used_real_data = False

        except Exception as e:
            print(f"\n  WARN Real data fetch failed: {e}")
            print("  Falling back to SIMULATED data...\n")
            from app.services.simulator import run_simulation
            raw = run_simulation()
            addresses = raw["addresses"]
            transactions = raw["transactions"]
    else:
        print("\nLoading SIMULATED data...")
        from app.services.simulator import run_simulation
        raw = run_simulation()
        addresses = raw["addresses"]
        transactions = raw["transactions"]

    print("\nRunning churn pipeline...")
    results = run_churn_pipeline(addresses, transactions)
    app_state.update(results)
    app_state["raw"] = {"addresses": addresses, "transactions": transactions}
    print("Pipeline complete. API is ready.\n")

    # start background scheduler
    from app.core.scheduler import start_scheduler
    task = asyncio.create_task(start_scheduler())
    app_state["scheduler_task"] = task
    app_state["last_refreshed"] = datetime.utcnow().isoformat()

    yield

    # cleanup
    if "scheduler_task" in app_state:
        app_state["scheduler_task"].cancel()

    print("Shutting down...")


def _normalize_addresses(raw: list, wallet_id: str) -> list:
    """Convert Blockradar API address format to our internal format."""
    import uuid
    from datetime import datetime, timezone

    REGIONS = {
        "Nigeria": "Africa", "Ghana": "Africa", "Kenya": "Africa",
        "South Africa": "Africa", "Egypt": "Africa", "Senegal": "Africa",
        "Rwanda": "Africa", "Ethiopia": "Africa", "Tanzania": "Africa",
        "Brazil": "LatAm", "Mexico": "LatAm", "Argentina": "LatAm",
        "Colombia": "LatAm", "Chile": "LatAm", "Peru": "LatAm",
        "UAE": "Middle East", "Saudi Arabia": "Middle East",
        "Jordan": "Middle East", "Kuwait": "Middle East",
        "Indonesia": "Southeast Asia", "Philippines": "Southeast Asia",
        "Vietnam": "Southeast Asia", "Thailand": "Southeast Asia",
        "Malaysia": "Southeast Asia", "Singapore": "Southeast Asia",
    }

    normalized = []
    now = datetime.now(timezone.utc)

    for addr in raw:
        created_str = addr.get("createdAt") or addr.get("created_at") or now.isoformat()
        last_active_str = addr.get("lastActive") or addr.get("last_active") or created_str

        try:
            created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            created = now

        try:
            last_active = datetime.fromisoformat(last_active_str.replace("Z", "+00:00"))
        except Exception:
            last_active = created

        days_since = (now - last_active).days
        is_dormant = days_since > 60

        # try to get label/metadata for fintech info
        label = addr.get("label") or addr.get("name") or ""
        network = addr.get("network") or addr.get("chain") or "ethereum"
        currency = addr.get("asset") or addr.get("currency") or "USDC"
        balance = float(addr.get("balance") or addr.get("balanceUsd") or 0)

        normalized.append({
            "id": addr.get("id") or str(uuid.uuid4()),
            "address": addr.get("address") or "",
            "network": network,
            "currency": currency,
            "label": label,
            "balance": balance,
            "balanceUsd": balance,
            "totalReceived": float(addr.get("totalReceived") or 0),
            "totalSent": float(addr.get("totalSent") or 0),
            "totalTransactions": int(addr.get("totalTransactions") or 0),
            "lastActive": last_active.isoformat(),
            "createdAt": created.isoformat(),
            "isDormant": is_dormant,
            "daysSinceLastTx": days_since,
            "_fintechId": wallet_id,
            "_fintechName": label or "Your Wallet",
            "_fintechType": "Neobank",
            "_region": "Africa",
            "_country": "Nigeria",
        })

    return normalized


def _normalize_transactions(raw: list) -> list:
    """Convert Blockradar API transaction format to our internal format."""
    import uuid
    from datetime import datetime, timezone

    normalized = []
    now = datetime.now(timezone.utc)

    for tx in raw:
        date_str = tx.get("createdAt") or tx.get("created_at") or now.isoformat()
        try:
            tx_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            tx_date = now

        amount = float(tx.get("amount") or tx.get("amountUsd") or 0)
        status = (tx.get("status") or "SUCCESS").upper()
        if status not in ["SUCCESS", "FAILED", "PENDING"]:
            status = "SUCCESS"

        normalized.append({
            "id": tx.get("id") or str(uuid.uuid4()),
            "hash": tx.get("hash") or tx.get("txHash") or "",
            "type": tx.get("type") or "transfer",
            "status": status,
            "network": tx.get("network") or tx.get("chain") or "ethereum",
            "currency": tx.get("asset") or tx.get("currency") or "USDC",
            "amount": amount,
            "amountUsd": amount,
            "fee": float(tx.get("fee") or 0),
            "feeUsd": float(tx.get("feeUsd") or 0),
            "fromAddress": tx.get("from") or tx.get("fromAddress") or "",
            "toAddress": tx.get("to") or tx.get("toAddress") or "",
            "createdAt": tx_date.isoformat(),
            "_walletId": tx.get("addressId") or tx.get("walletId") or "",
            "_fintechId": tx.get("walletId") or "",
            "_fintechName": "Your Wallet",
            "_region": "Africa",
        })

    return normalized


app = FastAPI(
    title="Blockradar Intelligence API",
    description="Wallet analytics, churn prediction & retention insights.",
    version="1.0.0",
    lifespan=lifespan,
    # interactive docs only in debug — they advertise every route
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # JWT is sent in the Authorization header, not cookies
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router,      prefix="/auth",      tags=["Auth"])
_protected = [Depends(get_current_user)]
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"], dependencies=_protected)
app.include_router(churn.router,     prefix="/churn",     tags=["Churn"],     dependencies=_protected)
app.include_router(wallets.router,   prefix="/wallets",   tags=["Wallets"],   dependencies=_protected)


@app.get("/", tags=["Health"])
async def root():
    return {"service": "Blockradar Intelligence API", "status": "running"}

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}