from database import get_db


def get_stats(user_id):
    row = get_db().execute(
        """SELECT COUNT(*) AS total,
                COALESCE(SUM(completed = 0), 0) AS pending,
                COALESCE(SUM(completed = 1), 0) AS completed,
                COALESCE(SUM(completed = 0 AND due_date = date('now', 'localtime')), 0) AS today,
                COALESCE(SUM(completed = 0 AND due_date > date('now', 'localtime')), 0) AS upcoming
            FROM tasks WHERE user_id = ?""",
        (user_id,),
    ).fetchone()
    stats = dict(row)
    stats["percent"] = round(100 * stats["completed"] / stats["total"]) if stats["total"] else 0
    return stats
