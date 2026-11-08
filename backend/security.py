"CSRF protection and the login_required decorator."   
import secrets
from functools import wraps
from flask import request, session, abort, redirect, url_for, jsonify # type: ignore


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_hex(16)
    return session["_csrf"]


def init_security(app):
    app.jinja_env.globals["csrf_token"] = csrf_token

    @app.before_request
    def verify_csrf():
        if request.method == "POST":
            sent = (request.headers.get("X-CSRF-Token") or request.form.get("_csrf", "")).encode()
            real = session.get("_csrf", "").encode()
            if not real or not secrets.compare_digest(sent, real):
                abort(400)


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            if request.is_json:
                return jsonify(ok=False, errors={"form": "Please sign in again."}), 401
            return redirect(url_for("auth.signin"))
        return view(*args, **kwargs)
    return wrapped
