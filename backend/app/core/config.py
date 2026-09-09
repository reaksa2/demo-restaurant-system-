from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central app configuration, loaded from environment variables / .env file.
    Nothing here should be hardcoded elsewhere in the app.
    """

    DATABASE_URL: str = "postgresql://menu_user:menu_password@localhost:5432/restaurant_menu"

    SECRET_KEY: str = "insecure-dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SEED_LEVEL1_EMAIL: str = "owner@example.com"
    SEED_LEVEL1_PASSWORD: str = "change-me-now"
    SEED_LEVEL1_NAME: str = "System Owner"

    UPLOAD_DIR: str = "uploads"
    UPLOAD_URL_PREFIX: str = "/static/uploads"

    # Cloudflare R2 (S3-compatible) — when all four are set, image uploads go
    # here instead of local disk, so they survive backend restarts/redeploys.
    # Leave blank to fall back to local disk (fine for local dev only — never
    # for production, since Render's disk is wiped on every deploy).
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""  # e.g. https://pub-xxxxx.r2.dev or your custom domain

    @property
    def r2_configured(self) -> bool:
        return bool(self.R2_ACCOUNT_ID and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY and self.R2_BUCKET_NAME and self.R2_PUBLIC_URL)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
