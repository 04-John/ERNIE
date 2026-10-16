"""
Upgrade path: a database created by the single-tenant version (users table without
org_id/role) must be upgraded in place, giving every existing user a workspace.
Runs last (z_) because it replaces the users table.
"""

from sqlalchemy import text, inspect

from app.core.database import engine, SessionLocal, Base
from app.services.tenancy import run_migrations


def test_single_tenant_database_is_upgraded():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS blockradar_connections"))
        conn.execute(text("DROP TABLE IF EXISTS users"))
        conn.execute(text("DROP TABLE IF EXISTS organizations"))
        conn.execute(text(
            "CREATE TABLE users (id VARCHAR PRIMARY KEY, email VARCHAR NOT NULL UNIQUE, name VARCHAR, company VARCHAR,"
            " hashed_password VARCHAR, google_id VARCHAR UNIQUE, is_active BOOLEAN, is_verified BOOLEAN,"
            " created_at DATETIME, last_login DATETIME)"
        ))
        conn.execute(text("INSERT INTO users (id, email, name, company, is_active) VALUES ('u1','old@example.com','Old User','Acme',1)"))
        conn.execute(text("INSERT INTO users (id, email, name, is_active) VALUES ('u2','plain@example.com',NULL,1)"))
    with engine.begin() as conn:               # the connections table as the previous release created it (no last_full_sync_at)
        conn.execute(text(
            "CREATE TABLE blockradar_connections (id VARCHAR PRIMARY KEY, org_id VARCHAR NOT NULL UNIQUE, api_key_enc TEXT NOT NULL,"
            " api_key_last4 VARCHAR(4) NOT NULL, wallet_id VARCHAR NOT NULL, created_at DATETIME, last_synced_at DATETIME, last_error TEXT)"
        ))
    Base.metadata.create_all(bind=engine)      # creates the new tables, leaves existing ones alone
    assert "last_full_sync_at" not in {c["name"] for c in inspect(engine).get_columns("blockradar_connections")}

    assert "org_id" not in {c["name"] for c in inspect(engine).get_columns("users")}

    with SessionLocal() as db:
        run_migrations(db)
        run_migrations(db)                      # idempotent: second run changes nothing

    assert "last_full_sync_at" in {c["name"] for c in inspect(engine).get_columns("blockradar_connections")}

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT u.email, u.role, o.name FROM users u JOIN organizations o ON o.id = u.org_id ORDER BY u.email"
        )).fetchall()
        assert len(rows) == 2
        assert rows[0] == ("old@example.com", "admin", "Acme")
        assert rows[1] == ("plain@example.com", "admin", "plain's workspace")
        assert conn.execute(text("SELECT COUNT(*) FROM organizations")).scalar() == 2
