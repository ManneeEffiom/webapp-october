"""
JustDoIt - Task Manager (Flask backend)
=======================================
Serves the dashboard and exposes a small JSON API for tasks and categories.

Run:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000

Notes for the team:
- The database (tasks.db) is created and seeded with demo data on first run.
- Deleting a category does NOT delete its tasks: they become "Uncategorized"
  (tasks.category_id is set to NULL).
- All dates are stored as local, naive values:
    tasks.due_date      -> "YYYY-MM-DD"      (may be NULL)
    tasks.completed_at  -> "YYYY-MM-DDTHH:MM:SS" (may be NULL)
"""

import os
import sqlite3
from datetime import datetime, timedelta, date

from flask import Flask, abort, jsonify, request, send_from_directory

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_ROOT, "tasks.db")

# The six colors offered by the category color picker (matches the UI).
ALLOWED_COLORS = ["#43826A", "#8A79AE", "#4268D7", "#B2864D", "#BD798C", "#778898"]

# Static files the single-page dashboard is allowed to request.
ASSET_FILES = {"style.css", "dialogs.css", "scripts.js"}

app = Flask(__name__)


# ------------------------------------------------------------------
# Database helpers
# ------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    notes        TEXT    NOT NULL DEFAULT '',
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    due_date     TEXT,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT    NOT NULL
);
"""


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_str():
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def init_db():
    """Create the schema; seed demo data the very first time only."""
    first_run = not os.path.exists(DB_PATH)
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()

    if first_run:
        seed_demo_data(conn)
    conn.close()


def seed_demo_data(conn):
    """Demo data that mirrors the UI mockups (dates relative to today)."""
    today = date.today()
    plus = lambda days: (today + timedelta(days=days)).isoformat()

    conn.execute(
        "INSERT INTO categories (name, color) VALUES (?, ?), (?, ?), (?, ?)",
        ("Home", "#43826A", "School", "#8A79AE", "Work", "#4268D7"),
    )
    conn.commit()
    home, school, work = (row["id"] for row in conn.execute(
        "SELECT id FROM categories ORDER BY name"
    ).fetchall())

    morning = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)
    demo_tasks = [
        # title, notes, category, due_date, completed, completed_at
        ("Prepare quarterly presentation", "Finalize slides for the team review", work, plus(0), 0, None),
        ("Pick up groceries", "Oat milk, vegetables, coffee", home, plus(0), 0, None),
        ("Finish history essay", "Review citations before submitting", school, plus(0), 0, None),
        ("Submit expense report", "Attach receipts from the client visit", work, plus(3), 0, None),
        ("Water the plants", "Living room and balcony", home, plus(3), 0, None),
        ("Send weekly team update", "Recap wins and flag blockers", work, plus(0), 1,
         morning.strftime("%Y-%m-%dT%H:%M:%S")),
        ("Pay electricity bill", "Due before the end of the month", home, plus(0), 1,
         morning.replace(hour=8, minute=40).strftime("%Y-%m-%dT%H:%M:%S")),
        ("Read chapter 4", "Take notes for the seminar", school, plus(-1), 1,
         (datetime.now() - timedelta(days=1)).replace(hour=18, minute=20, second=0,
                                                      microsecond=0).strftime("%Y-%m-%dT%H:%M:%S")),
    ]
    created = datetime.now()
    for i, (title, notes, cat, due, done, done_at) in enumerate(demo_tasks):
        conn.execute(
            "INSERT INTO tasks (title, notes, category_id, due_date, completed,"
            " completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, notes, cat, due, done, done_at,
             (created - timedelta(minutes=len(demo_tasks) - i)).strftime("%Y-%m-%dT%H:%M:%S")),
        )
    conn.commit()


def task_row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "notes": row["notes"],
        "due_date": row["due_date"],
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
        "category": (
            {"id": row["category_id"], "name": row["category_name"], "color": row["category_color"]}
            if row["category_id"] is not None
            else None
        ),
    }


TASK_SELECT = """
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM tasks t
    LEFT JOIN categories c ON c.id = t.category_id
"""


def fetch_task(conn, task_id):
    row = conn.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()
    return row


# ------------------------------------------------------------------
# Validation helpers
# ------------------------------------------------------------------

def clean_text(value, field, max_len, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        abort(400, description=f"{field} must be a string.")
    value = value.strip()
    if required and not value:
        abort(400, description=f"{field} is required.")
    if len(value) > max_len:
        abort(400, description=f"{field} must be at most {max_len} characters.")
    return value


def clean_due_date(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        abort(400, description="due_date must be a string.")
    try:
        date.fromisoformat(value)  # validates "YYYY-MM-DD"
    except ValueError:
        abort(400, description="due_date must use the YYYY-MM-DD format.")
    return value


def clean_category_id(conn, value):
    if value in (None, ""):
        return None
    try:
        value = int(value)
    except (TypeError, ValueError):
        abort(400, description="category_id must be an integer.")
    if conn.execute("SELECT 1 FROM categories WHERE id = ?", (value,)).fetchone() is None:
        abort(400, description="category_id does not exist.")
    return value


def clean_color(value):
    if value not in ALLOWED_COLORS:
        abort(400, description="color must be one of the palette colors.")
    return value


# ------------------------------------------------------------------
# Pages & assets
# ------------------------------------------------------------------

@app.route("/")
def dashboard():
    return send_from_directory(APP_ROOT, "dashboard.html")


@app.route("/<path:filename>")
def assets(filename):
    if filename in ASSET_FILES:
        return send_from_directory(APP_ROOT, filename)
    abort(404)


# ------------------------------------------------------------------
# Task API
# ------------------------------------------------------------------

@app.get("/api/tasks")
def list_tasks():
    conn = get_db()
    rows = conn.execute(TASK_SELECT + " ORDER BY t.created_at ASC, t.id ASC").fetchall()
    conn.close()
    return jsonify(tasks=[task_row_to_dict(r) for r in rows])


@app.post("/api/tasks")
def create_task():
    data = request.get_json(silent=True) or {}
    conn = get_db()
    title = clean_text(data.get("title"), "title", 200, required=True)
    notes = clean_text(data.get("notes"), "notes", 1000)
    category_id = clean_category_id(conn, data.get("category_id"))
    due_date = clean_due_date(data.get("due_date"))
    completed = 1 if data.get("completed") else 0

    cur = conn.execute(
        "INSERT INTO tasks (title, notes, category_id, due_date, completed, completed_at, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (title, notes, category_id, due_date, completed,
         now_str() if completed else None, now_str()),
    )
    conn.commit()
    task = fetch_task(conn, cur.lastrowid)
    conn.close()
    return jsonify(task=task_row_to_dict(task)), 201


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = fetch_task(conn, task_id)
    if row is None:
        conn.close()
        abort(404, description="Task not found.")
    row = dict(row)  # make it mutable

    # Partial update: only the fields present in the request body change.
    if "title" in data:
        row["title"] = clean_text(data["title"], "title", 200, required=True)
    if "notes" in data:
        row["notes"] = clean_text(data["notes"], "notes", 1000)
    if "category_id" in data:
        row["category_id"] = clean_category_id(conn, data["category_id"])
    if "due_date" in data:
        row["due_date"] = clean_due_date(data["due_date"])

    if "completed" in data:
        completed = 1 if data["completed"] else 0
        if completed and not row["completed"]:
            row["completed_at"] = now_str()   # just checked off -> stamp it
        elif not completed:
            row["completed_at"] = None        # moved back to pending
        row["completed"] = completed

    conn.execute(
        "UPDATE tasks SET title=?, notes=?, category_id=?, due_date=?, completed=?, completed_at=?"
        " WHERE id=?",
        (row["title"], row["notes"], row["category_id"], row["due_date"],
         row["completed"], row["completed_at"], task_id),
    )
    conn.commit()
    updated = fetch_task(conn, task_id)
    conn.close()
    return jsonify(task=task_row_to_dict(updated))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    conn = get_db()
    if fetch_task(conn, task_id) is None:
        conn.close()
        abort(404, description="Task not found.")
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify(ok=True)


# ------------------------------------------------------------------
# Category API
# ------------------------------------------------------------------

@app.get("/api/categories")
def list_categories():
    conn = get_db()
    rows = conn.execute("SELECT id, name, color FROM categories ORDER BY name ASC").fetchall()
    conn.close()
    return jsonify(categories=[{"id": r["id"], "name": r["name"], "color": r["color"]} for r in rows])


def name_conflicts(conn, name, exclude_id=None):
    query = "SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE"
    params = [name]
    if exclude_id is not None:
        query += " AND id != ?"
        params.append(exclude_id)
    return conn.execute(query, params).fetchone() is not None


@app.post("/api/categories")
def create_category():
    data = request.get_json(silent=True) or {}
    conn = get_db()
    name = clean_text(data.get("name"), "name", 60, required=True)
    color = clean_color(data.get("color"))
    if name_conflicts(conn, name):
        conn.close()
        return jsonify(error="A category with this name already exists."), 409
    cur = conn.execute("INSERT INTO categories (name, color) VALUES (?, ?)", (name, color))
    conn.commit()
    row = conn.execute("SELECT id, name, color FROM categories WHERE id = ?",
                       (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(category={"id": row["id"], "name": row["name"], "color": row["color"]}), 201


@app.put("/api/categories/<int:category_id>")
def update_category(category_id):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if row is None:
        conn.close()
        abort(404, description="Category not found.")

    name = clean_text(data.get("name", row["name"]), "name", 60, required=True)
    color = clean_color(data.get("color", row["color"]))
    if name != row["name"] and name_conflicts(conn, name, exclude_id=category_id):
        conn.close()
        return jsonify(error="A category with this name already exists."), 409

    conn.execute("UPDATE categories SET name = ?, color = ? WHERE id = ?", (name, color, category_id))
    conn.commit()
    updated = conn.execute("SELECT id, name, color FROM categories WHERE id = ?",
                           (category_id,)).fetchone()
    conn.close()
    return jsonify(category={"id": updated["id"], "name": updated["name"], "color": updated["color"]})


@app.delete("/api/categories/<int:category_id>")
def delete_category(category_id):
    """Deleting a category keeps its tasks - they become Uncategorized."""
    conn = get_db()
    row = conn.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
    if row is None:
        conn.close()
        abort(404, description="Category not found.")
    moved = conn.execute("SELECT COUNT(*) AS n FROM tasks WHERE category_id = ?",
                         (category_id,)).fetchone()["n"]
    conn.execute("UPDATE tasks SET category_id = NULL WHERE category_id = ?", (category_id,))
    conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    conn.close()
    return jsonify(ok=True, tasks_moved=moved)


# ------------------------------------------------------------------
# Error handler so errors always come back as JSON
# ------------------------------------------------------------------

@app.errorhandler(400)
@app.errorhandler(404)
def json_error(err):
    return jsonify(error=err.description), err.code


init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)