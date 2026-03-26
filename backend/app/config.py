from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/onyx"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "yoursecretkeyhere"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    # AI
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # GitHub App
    GITHUB_APP_ID: Optional[str] = None
    GITHUB_PRIVATE_KEY_PATH: Optional[str] = None
    GITHUB_WEBHOOK_SECRET: Optional[str] = None

    # Encryption key for data at rest (AES-256-GCM)
    ENCRYPTION_SECRET_KEY: str = "your32bytehexkeyhere"

    # Scan limits
    MAX_SCANS_PER_USER_PER_DAY: int = 3
    MAX_ACTIVE_SCANS_PER_DOMAIN: int = 1
    SCAN_TIMEOUT_MINUTES: int = 45

    # Per-tool timeouts (seconds)
    SUBFINDER_TIMEOUT: int = 300
    NMAP_TIMEOUT: int = 600
    FFUF_TIMEOUT: int = 600
    NUCLEI_TIMEOUT: int = 1200

    # ffuf safe rate limit
    FFUF_RATE: int = 50

    # LLM retry policy
    LLM_MAX_RETRIES: int = 3
    LLM_RETRY_BACKOFF_BASE: int = 2

    # Tool paths
    SUBFINDER_PATH: str = "/usr/local/bin/subfinder"
    NMAP_PATH: str = "/usr/bin/nmap"
    FFUF_PATH: str = "/usr/local/bin/ffuf"
    NUCLEI_PATH: str = "/usr/local/bin/nuclei"
    WORDLIST_PATH: str = "/wordlists/SecLists/Discovery/Web-Content/common.txt"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
