from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class Job(BaseModel):
    job_id: str
    file_id: str
    filename: str
    status: JobStatus
    created_at: str
    updated_at: str
    model_type: str = "demucs"
    stems: int = 2
    vocal_cleanup: bool = False
    instrumental_cleanup: bool = False
    error_message: Optional[str] = None
    vocals_path: Optional[str] = None
    backing_vocals_path: Optional[str] = None
    instrumental_path: Optional[str] = None
    drums_path: Optional[str] = None
    bass_path: Optional[str] = None
    other_path: Optional[str] = None
    original_path: Optional[str] = None
    progress: int = 0                          # 0-100, updated by backend at key steps
    processing_started_at: Optional[str] = None  # set when Modal call begins

class UploadResponse(BaseModel):
    file_id: str
    filename: str
    size: int
    message: str = "File uploaded successfully"

class YoutubeImportRequest(BaseModel):
    url: str

class SeparateRequest(BaseModel):
    file_id: str
    model_type: Optional[str] = "demucs"
    stems: Optional[int] = 2
    vocal_cleanup: Optional[bool] = False
    instrumental_cleanup: Optional[bool] = False

class SeparateResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str = "Separation job registered and queued"

class JobStatusResponse(BaseModel):
    job_id: str
    file_id: str
    filename: str
    status: JobStatus
    created_at: str
    updated_at: str
    model_type: str = "demucs"
    stems: int = 2
    vocal_cleanup: bool = False
    instrumental_cleanup: bool = False
    error_message: Optional[str] = None
    # We will return boolean flags indicating downloads are ready
    vocals_ready: bool = False
    backing_vocals_ready: bool = False
    instrumental_ready: bool = False
    drums_ready: bool = False
    bass_ready: bool = False
    other_ready: bool = False
