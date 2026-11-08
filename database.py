
"""
Database connection, schema initialization and migrations
for the JustDoIt! Flask application.
"""

import sqlite3

from flask import g, current_app


# --------------------------------------------------
# DATABASE SCHEMA
# --------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4263d8',

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE (user_id, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL
);
"""


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def get_db():
    """
    Returns the current database connection.

    A single connection is maintained for each
    Flask application context.
    """

    if "db" not in g:

        g.db = sqlite3.connect(
            current_app.config["DATABASE"],
            timeout=10
        )

        # Return database rows as dictionary-like objects.
        g.db.row_factory = sqlite3.Row

        # Enable foreign key constraints.
        g.db.execute("PRAGMA foreign_keys = ON")

        # Wait for database locks to clear.
        g.db.execute("PRAGMA busy_timeout = 10000")

    return g.db


# --------------------------------------------------
# CLOSE DATABASE CONNECTION
# --------------------------------------------------

def close_db(error=None):
    """
    Closes the database connection when the
    Flask application context ends.
    """

    db = g.pop("db", None)

    if db is not None:
        db.close()


# --------------------------------------------------
# DATABASE MIGRATIONS
# --------------------------------------------------

def migrate_db(db):
    """
    Updates existing database tables without
    deleting existing users, categories or tasks.
    """

    # Get existing task table columns.
    columns = {
        row["name"]
        for row in db.execute(
            "PRAGMA table_info(tasks)"
        ).fetchall()
    }

    # Add completed_at if it doesn't exist.
    if "completed_at" not in columns:

        db.execute("""
            ALTER TABLE tasks
            ADD COLUMN completed_at TEXT
        """)

    # Add created_at if it doesn't exist.
    if "created_at" not in columns:

        db.execute("""
            ALTER TABLE tasks
            ADD COLUMN created_at TEXT
        """)

    # Populate creation dates for existing tasks.
    db.execute("""
        UPDATE tasks
        SET created_at = CURRENT_TIMESTAMP
        WHERE created_at IS NULL
    """)

    # Ensure completed tasks have a completion timestamp.
    db.execute("""
        UPDATE tasks
        SET completed_at = CURRENT_TIMESTAMP
        WHERE completed = 1
        AND completed_at IS NULL
    """)

    db.commit()


# --------------------------------------------------
# DATABASE INDEXES
# --------------------------------------------------

def create_indexes(db):
    """
    Creates indexes to improve common database queries.
    """

    db.executescript("""
        CREATE INDEX IF NOT EXISTS idx_tasks_user
        ON tasks(user_id);

        CREATE INDEX IF NOT EXISTS idx_tasks_category
        ON tasks(category_id);

        CREATE INDEX IF NOT EXISTS idx_tasks_due_date
        ON tasks(user_id, due_date);

        CREATE INDEX IF NOT EXISTS idx_categories_user
        ON categories(user_id);
    """)

    db.commit()


# --------------------------------------------------
# INITIALIZE DATABASE
# --------------------------------------------------

def init_app(app):
    """
    Initializes the database when the Flask
    application starts.
    """

    # Register automatic connection cleanup.
    app.teardown_appcontext(close_db)

    with app.app_context():

        db = get_db()

        # Create tables that don't already exist.
        db.executescript(SCHEMA)

        # Update existing tables.
        migrate_db(db)

        # Create performance indexes.
        create_indexes(db)

        db.commit()
