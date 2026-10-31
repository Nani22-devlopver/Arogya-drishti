from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

if not settings.DATABASE_URL.startswith("postgresql"):
    raise RuntimeError("DATABASE_URL must be a PostgreSQL URL (postgresql+psycopg2://user:pass@host:5432/db)")

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def ensure_schema() -> None:
    """Tiny forward-only migration so an existing database picks up new columns.

    Base.metadata.create_all() creates missing tables but never alters existing ones.
    """
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS feedback TEXT"))
        conn.execute(text("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_provider VARCHAR(20) DEFAULT 'google_meet'"))
        conn.execute(text("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_url VARCHAR(300)"))
        conn.execute(text("UPDATE appointments SET video_provider = 'google_meet' WHERE video_provider IS NULL OR video_provider = 'jitsi'"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
