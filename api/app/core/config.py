from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "IELTS Prep API"
    environment: str = "development"
    debug: bool = True

    database_url: str = "postgresql+psycopg://ielts:ielts@localhost:5433/ielts"
    redis_url: str = "redis://localhost:6380/0"

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    writing_submissions_per_day: int = 5

    frontend_url: str = "http://localhost:3000"
    cors_origins: list[str] = ["http://localhost:3000"]

    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "ielts-media"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
