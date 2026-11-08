"""Category data access. Every query is scoped by user_id (ownership check)."""
import sqlite3
from database import get_db
from backend.validators import validate_category

DEFAULTS = [("Home", "#4f7f68"), ("School", "#8b7bb0"), ("Work", "#4263d8")]
DUPLICATE = {"name": "You already have a category with that name."}


def seed_defaults(user_id):
    db = get_db()
    db.executemany("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)",
                   [(user_id, n, c) for n, c in DEFAULTS])
    db.commit()


def list_categories(user_id):
    return get_db().execute("""
        SELECT c.id, c.name, c.color, COUNT(t.id) AS total,
               COALESCE(SUM(CASE WHEN t.completed = 0 THEN 1 END), 0) AS pending
        FROM categories c LEFT JOIN tasks t ON t.category_id = c.id
        WHERE c.user_id = ? GROUP BY c.id ORDER BY c.name COLLATE NOCASE""",
        (user_id,)).fetchall()


def create_category(user_id, name, color):
    errors = validate_category(name, color)
    if errors:
        return errors
    db = get_db()
    try:
        db.execute("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)",
                   (user_id, name.strip(), color))
        db.commit()
    except sqlite3.IntegrityError:
        return DUPLICATE
    return {}


def update_category(user_id, cat_id, name, color):
    """Returns errors dict, or None when the category isn't the user's."""
    errors = validate_category(name, color)
    if errors:
        return errors
    db = get_db()
    try:
        cur = db.execute("UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?",
                         (name.strip(), color, cat_id, user_id))
        db.commit()
    except sqlite3.IntegrityError:
        return DUPLICATE
    return {} if cur.rowcount else None


def delete_category(user_id, cat_id):
    """Tasks are kept: the FK rule sets their category_id to NULL (Uncategorized)."""
    db = get_db()
    cur = db.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (cat_id, user_id))
    db.commit()
    return cur.rowcount > 0
