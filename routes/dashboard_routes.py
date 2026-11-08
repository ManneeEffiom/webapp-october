
from datetime import date, datetime
from flask import (
    Blueprint, jsonify, render_template,
    session, request, abort
)

from backend.security import login_required
from backend.validators import CATEGORY_COLORS
from backend import category_service
from database import get_db


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard")
@login_required
def home():
    uid = session["user_id"]

    tasks = get_db().execute("""
        SELECT
            t.*,
            c.name AS cat_name,
            c.color AS cat_color
        FROM tasks t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = ?
        ORDER BY t.completed, t.due_date, t.id DESC
    """, (uid,)).fetchall()

    total = len(tasks)
    done = sum(t["completed"] for t in tasks)
    today = date.today()

    name = session["full_name"]

    return render_template(
        "dashboard.html",
        categories=category_service.list_categories(uid),
        colors=CATEGORY_COLORS,
        tasks=tasks,
        total=total,
        done=done,
        pending=total - done,
        percent=round(done / total * 100) if total else 0,
        today_label=today.strftime("%A, %B %d, %Y").upper(),
        first_name=name.split()[0],
        initials="".join(
            word[0] for word in name.split()[:2]
        ).upper(),
        open_manage=request.args.get("manage") == "1"
    )


def validate_task_data(data, uid, partial=False):
    errors = {}

    title = data.get("title")
    notes = data.get("notes", "")
    category_id = data.get("category_id")
    due_date = data.get("due_date") or None

    if not partial or "title" in data:
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Task name is required."
        elif len(title.strip()) > 200:
            errors["title"] = "Task name must be 200 characters or fewer."

    if not isinstance(notes, str):
        errors["notes"] = "Notes must be text."
    elif len(notes.strip()) > 1000:
        errors["notes"] = "Notes must be 1000 characters or fewer."

    if category_id not in (None, ""):
        try:
            category_id = int(category_id)
        except (TypeError, ValueError):
            errors["category_id"] = "Choose a valid category."
        else:
            category = get_db().execute("""
                SELECT id FROM categories
                WHERE id = ? AND user_id = ?
            """, (category_id, uid)).fetchone()

            if category is None:
                errors["category_id"] = "Choose a valid category."
    else:
        category_id = None

    if due_date is not None:
        try:
            parsed = date.fromisoformat(due_date)

            if parsed.isoformat() != due_date:
                raise ValueError

        except (ValueError, TypeError):
            errors["due_date"] = "Choose a valid due date."

    return errors


@dashboard_bp.post("/tasks")
@login_required
def create_task():
    data = request.get_json(silent=True) or {}
    uid = session["user_id"]

    errors = validate_task_data(data, uid)

    if errors:
        return jsonify(ok=False, errors=errors), 400

    db = get_db()

    cursor = db.execute("""
        INSERT INTO tasks (
            user_id, category_id, title,
            notes, due_date, completed
        )
        VALUES (?, ?, ?, ?, ?, 0)
    """, (
        uid,
        data.get("category_id") or None,
        data["title"].strip(),
        data.get("notes", "").strip(),
        data.get("due_date") or None
    ))

    db.commit()

    return jsonify(
        ok=True,
        task_id=cursor.lastrowid
    ), 201


@dashboard_bp.post("/tasks/<int:task_id>/update")
@login_required
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    uid = session["user_id"]
    db = get_db()

    task = db.execute("""
        SELECT * FROM tasks
        WHERE id = ? AND user_id = ?
    """, (task_id, uid)).fetchone()

    if task is None:
        return jsonify(ok=False, error="Task not found."), 404

    errors = validate_task_data(data, uid, partial=True)

    if errors:
        return jsonify(ok=False, errors=errors), 400

    title = data.get("title", task["title"])
    notes = data.get("notes", task["notes"] or "")
    category_id = (
        data.get("category_id", task["category_id"])
    )
    due_date = data.get("due_date", task["due_date"])

    if category_id == "":
        category_id = None

    if due_date == "":
        due_date = None

    db.execute("""
        UPDATE tasks
        SET title = ?,
            notes = ?,
            category_id = ?,
            due_date = ?
        WHERE id = ? AND user_id = ?
    """, (
        title.strip(),
        notes.strip(),
        category_id,
        due_date,
        task_id,
        uid
    ))

    db.commit()

    return jsonify(ok=True)


@dashboard_bp.post("/tasks/<int:task_id>/complete")
@login_required
def complete_task(task_id):
    data = request.get_json(silent=True) or {}
    uid = session["user_id"]

    completed = data.get("completed")

    if not isinstance(completed, bool):
        return jsonify(
            ok=False,
            error="Completed must be true or false."
        ), 400

    db = get_db()

    cursor = db.execute("""
        UPDATE tasks
        SET completed = ?,
            completed_at = ?
        WHERE id = ? AND user_id = ?
    """, (
        int(completed),
        datetime.now().isoformat(timespec="seconds")
        if completed else None,
        task_id,
        uid
    ))

    db.commit()

    if cursor.rowcount == 0:
        return jsonify(ok=False, error="Task not found."), 404

    return jsonify(ok=True)


@dashboard_bp.post("/tasks/<int:task_id>/delete")
@login_required
def delete_task(task_id):
    uid = session["user_id"]

    db = get_db()

    cursor = db.execute("""
        DELETE FROM tasks
        WHERE id = ? AND user_id = ?
    """, (task_id, uid))

    db.commit()

    if cursor.rowcount == 0:
        return jsonify(ok=False, error="Task not found."), 404

    return jsonify(ok=True)
