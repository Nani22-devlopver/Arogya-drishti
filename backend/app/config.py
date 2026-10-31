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

    # AI image analysis. AI_PROVIDER: "auto" (Ollama Cloud if OLLAMA_API_KEY is set, else mock),
    # "ollama" (always Ollama Cloud) or "mock" (offline demo adapter).
    AI_PROVIDER: str = "auto"
    # When false (default) there is no local blur/size/type gate: the AI judges photo quality itself.
    LOCAL_QUALITY_CHECK: bool = False
    OLLAMA_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "https://ollama.com"
    OLLAMA_MODEL: str = "gemma4"
    OLLAMA_FALLBACK_MODEL: str = ""
    OLLAMA_TIMEOUT_SECONDS: int = 90
    OLLAMA_MAX_IMAGE_PX: int = 1024

    @property
    def use_ollama(self) -> bool:
        provider = self.AI_PROVIDER.strip().lower()
        if provider == "mock":
            return False
        if provider == "ollama":
            return True
        return bool(self.OLLAMA_API_KEY.strip())

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
