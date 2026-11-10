from alembic import context
from sqlalchemy import pool

from app.db import models  # noqa: F401  (registriert die Modelle in Base.metadata)
from app.db.base import Base
from app.db.session import get_engine

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_engine().url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with get_engine().connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
