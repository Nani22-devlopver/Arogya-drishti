from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def normalize_database_url(raw: str) -> str:
    """Accept any PostgreSQL URL, including the ones Supabase / Heroku-style hosts hand out.

    - postgres:// and postgresql:// are switched to the psycopg2 driver
    - Supabase hosts (…supabase.co, …pooler.supabase.com) get sslmode=require when it is not set
    """
    raw = (raw or "").strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg2://" + raw[len("postgresql://"):]
    if not raw.startswith("postgresql"):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL (postgresql+psycopg2://user:pass@host:5432/db)")
    url = make_url(raw)
    host = url.host or ""
    if host.endswith("supabase.co") or host.endswith("supabase.com"):
        if "sslmode" not in url.query:
            url = url.update_query_dict({"sslmode": "require"})
    return url.render_as_string(hide_password=False)


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)

# pool_pre_ping + pool_recycle keep connections healthy through cloud poolers (Supabase pgbouncer drops idle ones).
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
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
