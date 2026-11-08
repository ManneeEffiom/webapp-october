"""JSON endpoints used by the category dialogs."""
from flask import Blueprint, request, session, jsonify
from backend.security import login_required
from backend import category_service as cs

category_bp = Blueprint("categories", __name__, url_prefix="/categories")


def _body():
    return request.get_json(silent=True) or {}


def _respond(errors):
    if errors is None:
        return jsonify(ok=False, errors={"form": "Category not found."}), 404
    return (jsonify(ok=False, errors=errors), 400) if errors else jsonify(ok=True)


@category_bp.post("")
@login_required
def create():
    d = _body()
    return _respond(cs.create_category(session["user_id"], d.get("name", ""), d.get("color", "")))


@category_bp.post("/<int:cat_id>/update")
@login_required
def update(cat_id):
    d = _body()
    return _respond(cs.update_category(session["user_id"], cat_id, d.get("name", ""), d.get("color", "")))


@category_bp.post("/<int:cat_id>/delete")
@login_required
def delete(cat_id):
    return _respond({} if cs.delete_category(session["user_id"], cat_id) else None)
