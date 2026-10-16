from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from functools import lru_cache
from typing import List

_INSECURE_KEYS = {"", "change_this", "changeme", "secret"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Blockradar API
    blockradar_api_key: str = ""
    blockradar_base_url: str = "https://api.blockradar.co/v1"
    blockradar_wallet_id: str = ""

    # Database (SQLite fallback so the app runs with zero setup)
    database_url: str = "sqlite:///./blockradar.db"

    # FastAPI
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False
    secret_key: str = ""

    # Secrets at rest (customers' Blockradar API keys). Any random string; falls back to SECRET_KEY.
    encryption_key: str = ""

    # Optional: seed this user's workspace with the BLOCKRADAR_* env credentials (self-hosting convenience)
    bootstrap_admin_email: str = ""

    # Warm the shared demo dataset in the background at startup
    warm_demo: bool = True

    # Auth
    google_client_id: str = ""
    # Comma-separated list of allowed browser origins
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Pipeline
    # "real": each workspace uses its own Blockradar connection (demo data until connected)
    # "simulated": every workspace sees demo data (local development)
    data_mode: str = "simulated"
    pipeline_schedule_hours: float = 6

    @model_validator(mode="after")
    def _check_secret(self):
        if self.secret_key.lower() in _INSECURE_KEYS or len(self.secret_key) < 32:
            if self.debug:
                # dev convenience only: ephemeral key, tokens die on restart
                import secrets
                object.__setattr__(self, "secret_key", secrets.token_urlsafe(48))
                print("  WARN SECRET_KEY missing/weak — using an ephemeral dev key (DEBUG=true)")
            else:
                raise ValueError(
                    "SECRET_KEY must be set to a random string of 32+ chars. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
        # Render/Heroku hand out postgres:// which SQLAlchemy 2 rejects
        if self.database_url.startswith("postgres://"):
            object.__setattr__(
                self, "database_url",
                self.database_url.replace("postgres://", "postgresql://", 1),
            )
        return self

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
