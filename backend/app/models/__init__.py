# Import every model so SQLAlchemy registers all tables before create_all()
from app.models import organization, user, auth_token, stored, wallet, transaction  # noqa: F401
