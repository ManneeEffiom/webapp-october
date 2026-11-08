"Server-side validation rules (the browser rules in static/js/validation.js mirror these)."
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CATEGORY_COLORS = ["#4f7f68", "#8b7bb0", "#4263d8", "#a8844f", "#b57a8a", "#7b8a9e"]


def _check_email(email, errors):
    if not email.strip():
        errors["email"] = "Email address is required."
    elif not EMAIL_RE.match(email.strip()):
        errors["email"] = "Enter a valid email address."


def validate_signin(email, password):
    errors = {}
    _check_email(email, errors)
    if not password:
        errors["password"] = "Password is required."
    return errors


def validate_signup(full_name, email, password, agree):
    errors = {}
    if not 2 <= len(full_name.strip()) <= 60:
        errors["full_name"] = "Full name must be 2-60 characters."
    _check_email(email, errors)
    if len(password) < 8 or not re.search(r"\d", password):
        errors["password"] = "Use at least 8 characters, including a number."
    if not agree:
        errors["agree"] = "You need to agree to continue."
    return errors


def validate_category(name, color):
    errors = {}
    name = (name or "").strip()
    if not name:
        errors["name"] = "Category name is required."
    elif len(name) > 30:
        errors["name"] = "Keep it to 30 characters or fewer."
    if color not in CATEGORY_COLORS:
        errors["color"] = "Pick one of the colors."
    return errors
