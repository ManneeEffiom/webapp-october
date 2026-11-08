
from flask import Flask, redirect, url_for, session

import database
from backend.security import init_security
from routes.auth_routes import auth_bp
from routes.dashboard_routes import dashboard_bp
from routes.category_routes import category_bp


def create_app():
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="statics"
    )

    app.config.from_object("config.Config")

    # Initialize the single database
    database.init_app(app)

    # Initialize CSRF protection
    init_security(app)

    # Register application blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(category_bp)

    @app.route("/")
    def index():
        if "user_id" in session:
            return redirect(url_for("dashboard.home"))

        return redirect(url_for("auth.signin"))

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
