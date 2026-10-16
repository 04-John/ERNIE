from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_settings
from app.api.routes import analytics, churn, wallets, auth
from app.services.auth import get_current_user
import asyncio

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

    from app.core.database import create_tables
    from app.models import user, wallet, transaction  # import models so SQLAlchemy sees them
    create_tables()
    print("  OK Database tables ready")

    from app.services.data_loader import refresh_state
    await refresh_state("startup", force=True)
    print("API is ready.")

    from app.core.scheduler import start_scheduler
    from app.core.state import app_state
    task = asyncio.create_task(start_scheduler())
    app_state["scheduler_task"] = task

    yield

    task.cancel()
    print("Shutting down...")


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