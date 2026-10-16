from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.api.routes import analytics, churn, wallets, auth, workspace
from app.api.routes import alerts as alert_routes
from app.api.routes import intelligence as intel_routes
from app.api.routes import assistant as assistant_routes
from app.api.routes import billing as billing_routes
from app.services.auth import get_current_user
import asyncio

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 55)
    print("  ERNIE API")
    print("=" * 55)
    print(f"  Mode     : {settings.data_mode.upper()}")
    if settings.debug:
        print(f"  Docs     : http://localhost:{settings.api_port}/docs")
    print("=" * 55)

    from app.core.database import create_tables, SessionLocal
    import app.models  # noqa: F401  (registers every table)
    create_tables()
    from app.services.tenancy import run_migrations
    with SessionLocal() as db:
        run_migrations(db)
    print("  OK Database ready")

    from app.core.state import DEMO_KEY
    from app.services.data_loader import ensure_loaded
    if settings.warm_demo:
        # build the shared demo dataset in the background so the first visitor doesn't wait
        asyncio.create_task(ensure_loaded(DEMO_KEY))

    from app.core.scheduler import start_scheduler
    task = asyncio.create_task(start_scheduler())
    print("API is ready.")

    yield

    task.cancel()
    print("Shutting down...")


app = FastAPI(
    title="ERNIE API",
    description="Engagement & Retention Network Intelligence Engine: wallet analytics, churn prediction & retention insights.",
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router,      prefix="/auth",      tags=["Auth"])
_protected = [Depends(get_current_user)]
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"], dependencies=_protected)
app.include_router(churn.router,     prefix="/churn",     tags=["Churn"],     dependencies=_protected)
app.include_router(wallets.router,   prefix="/wallets",   tags=["Wallets"],   dependencies=_protected)
app.include_router(workspace.router, prefix="/workspace", tags=["Workspace"], dependencies=_protected)
app.include_router(alert_routes.router, prefix="/workspace/alerts", tags=["Alerts"], dependencies=_protected)
app.include_router(intel_routes.router, prefix="/intelligence", tags=["Intelligence"], dependencies=_protected)
app.include_router(assistant_routes.router, prefix="/assistant", tags=["Assistant"], dependencies=_protected)
# /plans is public and /webhook is signature-verified; the other billing routes check the user themselves
app.include_router(billing_routes.router, prefix="/billing", tags=["Billing"])


@app.get("/", tags=["Health"])
async def root():
    return {"service": "ERNIE API", "status": "running"}

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}