"Authentication functions: the two the screens call."
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash # pyright: ignore[reportMissingImports]
from database import get_db
from backend.validators import validate_signup
from backend import category_service


def register_user(full_name, email, password, agree):
    "Returns (user_id, errors)."
    errors = validate_signup(full_name, email, password, agree)
    if errors:
        return None, errors
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)",
            (full_name.strip(), email.strip().lower(), generate_password_hash(password)))
        db.commit()
    except sqlite3.IntegrityError:
        return None, {"email": "An account with this email already exists."}
    category_service.seed_defaults(cur.lastrowid)
    return cur.lastrowid, {}


def authenticate_user(email, password):
    """Returns the user row, or None if the credentials are wrong."""
    user = get_db().execute("SELECT * FROM users WHERE email = ?",
                            (email.strip().lower(),)).fetchone()
    if user and check_password_hash(user["password_hash"], password):
        return user
    return None
