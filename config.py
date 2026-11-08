
import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    DATABASE = os.path.join(BASE_DIR, "justdoit.db")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Remember-me session duration
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
