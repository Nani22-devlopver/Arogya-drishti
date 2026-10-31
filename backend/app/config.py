from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL only
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/aarogya_drishti"
    JWT_SECRET: str = "local-demo-secret-not-for-production"
    JWT_EXPIRE_MINUTES: int = 480
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8080"
    STORAGE_DIR: str = str(Path(__file__).resolve().parents[1] / "storage")
    AI_FORCE_FAIL: bool = False
    SEED_ON_START: bool = True
    PORT: int = 8000

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
