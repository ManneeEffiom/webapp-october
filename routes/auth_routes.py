from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from backend.auth_service import register_user, authenticate_user
from backend.validators import validate_signin

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/signin", methods=["GET", "POST"])
def signin():
    errors, form = {}, {}
    if request.method == "POST":
        form = request.form
        errors = validate_signin(form.get("email", ""), form.get("password", ""))
        if not errors:
            user = authenticate_user(form["email"], form["password"])
            if user:
                session.clear()                          # stops session fixation
                session["user_id"] = user["id"]
                session["full_name"] = user["full_name"]
                session.permanent = bool(form.get("remember"))
                return redirect(url_for("dashboard.home"))
            errors = {"form": "Incorrect email or password."}   # same message for both cases
    return render_template("auth/signin.html", errors=errors, form=form)


@auth_bp.route("/signup", methods=["GET", "POST"])
def signup():
    errors, form = {}, {}
    if request.method == "POST":
        form = request.form
        _, errors = register_user(form.get("full_name", ""), form.get("email", ""),
                                  form.get("password", ""), bool(form.get("agree")))
        if not errors:
            flash("Account created. Please sign in.")
            return redirect(url_for("auth.signin"))
    return render_template("auth/signup.html", errors=errors, form=form)


@auth_bp.post("/signout")
def signout():
    session.clear()
    return redirect(url_for("auth.signin"))
