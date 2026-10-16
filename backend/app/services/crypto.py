"""
Symmetric encryption for secrets stored in the database (customers' Blockradar API keys).

The Fernet key is derived from ENCRYPTION_KEY (any random string), falling back to
SECRET_KEY. Set ENCRYPTION_KEY explicitly in production and never rotate it without
re-encrypting stored keys, or existing connections will stop decrypting.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


@lru_cache()
def _fernet() -> Fernet:
    s = get_settings()
    secret = s.encryption_key or s.secret_key
    digest = hashlib.sha256(("ernie-secrets-v1:" + secret).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Stored credential could not be decrypted (encryption key changed?)") from e
