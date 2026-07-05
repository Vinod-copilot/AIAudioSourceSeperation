import os
from pathlib import Path
from typing import Set, List, Any
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "AI Audio Separation API"
    API_V1_STR: str = "/api"
    
    # Storage Configuration
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    
    # Upload & Storage locations
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    STORAGE_DIR: Path = DATA_DIR / "storage"
    JOBS_FILE: Path = DATA_DIR / "jobs.json"
    
    # File Limits
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100 MB
    ALLOWED_EXTENSIONS: Set[str] = {".mp3"}
    
    # Modal Configuration
    MODAL_APP_NAME: str = "demucs-audio-separation"
    MODAL_FUNCTION_NAME: str = "separate"
    
    # Credentials & GPU config
    MOCK_MODAL: bool = False
    MODAL_TOKEN_ID: str = ""
    MODAL_TOKEN_SECRET: str = ""
    MODAL_GPU_TYPE: str = "t4"
    
    # CORS Origins — can be overridden via env var as a comma-separated list
    # e.g.  BACKEND_CORS_ORIGINS="https://your-app.vercel.app,http://localhost:5173"
    BACKEND_CORS_ORIGINS: Any = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost",
    ]

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# If BACKEND_CORS_ORIGINS was provided as a comma-separated string via env var,
# parse it into a proper list (Pydantic v2 does not auto-split strings).
_raw_cors = os.environ.get("BACKEND_CORS_ORIGINS", "")
if _raw_cors:
    # Strip whitespace and trailing slashes so both 'https://domain.com/' and 'https://domain.com' match the browser Origin header
    settings.BACKEND_CORS_ORIGINS = [o.strip().rstrip("/") for o in _raw_cors.split(",") if o.strip()]

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

