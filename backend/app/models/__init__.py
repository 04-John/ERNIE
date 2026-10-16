# Import every model so SQLAlchemy registers all tables before create_all()
from app.models import organization, user, stored, wallet, transaction  # noqa: F401
