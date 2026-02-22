from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-5-20250514"
    DATABASE_URL: str = "postgresql+asyncpg://notesmerge:password@localhost:5432/notesmerge"
    UPLOAD_DIR: str = "/data/uploads"
    MAX_FILE_SIZE_MB: int = 10
    MAX_NOTES_PER_SESSION: int = 10

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
