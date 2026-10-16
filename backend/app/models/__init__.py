# Import every model so SQLAlchemy registers all tables before create_all()
from app.models import organization, user, wallet, transaction  # noqa: F401
