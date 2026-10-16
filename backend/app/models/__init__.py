# Import every model so SQLAlchemy registers all tables before create_all()
from app.models import organization, user, auth_token, stored, alerts, insights, wallet, transaction  # noqa: F401
