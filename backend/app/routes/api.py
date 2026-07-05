import os
import uuid
import logging
import asyncio
from typing import List
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
from app.config import settings
from app.models import (
    UploadResponse, YoutubeImportRequest, SeparateRequest, SeparateResponse, JobStatusResponse, Job,
    GoogleDriveUploadRequest, GoogleDriveUploadResponse
)
from app.services.storage import storage_provider
from app.services.job_manager import job_manager
from app.services.youtube import download_youtube_audio
from app.services.drive import upload_file_to_google_drive

logger = logging.getLogger("uvicorn")
router = APIRouter()

@router.post("/upload", response_model=UploadResponse)
async def upload_audio_file(file: UploadFile = File(...)):
    """
    Uploads an audio file (MP3 only, up to 100 MB).
    Saves the file to local storage.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")
        
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    
    # Validate extension
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Only {', '.join(settings.ALLOWED_EXTENSIONS)} files are allowed."
        )
        
    # Read contents and enforce maximum file size
    try:
        contents = await file.read()
        file_size = len(contents)
        
        if file_size > settings.MAX_UPLOAD_SIZE:
            max_mb = settings.MAX_UPLOAD_SIZE / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum upload size of {max_mb:.0f} MB."
            )
            
        # Generate a unique file ID
        file_id = str(uuid.uuid4())
        storage_filename = f"{file_id}_{filename}"
        
        # Save to uploads folder
        storage_provider.save_file(
            folder="uploads",
            filename=storage_filename,
            data=contents
        )
        
        logger.info(f"Successfully uploaded {filename} (Size: {file_size} bytes) with file_id: {file_id}")
        
        return UploadResponse(
            file_id=file_id,
            filename=filename,
            size=file_size
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error occurred during file upload: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during upload: {str(e)}"
        )

@router.post("/import/youtube", response_model=UploadResponse)
async def import_youtube_audio(request: YoutubeImportRequest):
    """
    Downloads audio from a YouTube URL, converts it to 320kbps MP3 via FFmpeg,
    and registers it as an uploaded file.
    """
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="YouTube URL is empty.")
    
    # Check if storage directory exists
    uploads_dir = settings.STORAGE_DIR / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Run yt-dlp downloading in a threadpool so it doesn't block the FastAPI async event loop
        result = await asyncio.to_thread(download_youtube_audio, url, uploads_dir)
        return UploadResponse(
            file_id=result["file_id"],
            filename=result["filename"],
            size=result["size"],
            message="YouTube audio imported and converted to 320kbps MP3 successfully"
        )
    except Exception as e:
        logger.error(f"Error importing from YouTube: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to import audio from YouTube: {str(e)}"
        )

@router.post("/separate", response_model=SeparateResponse)
async def separate_audio_file(
    request: SeparateRequest,
    background_tasks: BackgroundTasks
):
    """
    Triggers the Demucs audio separation pipeline on a previously uploaded file.
    Runs asynchronously as a background task.
    """
    file_id = request.file_id
    
    # Locate the uploaded file inside storage
    # We must scan directory to find the filename associated with this file_id,
    # as file_id prefix was added to filename
    uploads_dir = settings.STORAGE_DIR / "uploads"
    
    if not uploads_dir.exists():
        raise HTTPException(status_code=404, detail="Uploads storage directory not found.")
        
    matching_files = list(uploads_dir.glob(f"{file_id}_*"))
    
    if not matching_files:
        raise HTTPException(
            status_code=404,
            detail=f"Uploaded file with ID {file_id} not found. Please upload again."
        )
        
    target_file_path = matching_files[0]
    filename = target_file_path.name.replace(f"{file_id}_", "", 1)
    
    # Create the job
    model_type = request.model_type or "demucs"
    stems = request.stems or 2
    vocal_cleanup = request.vocal_cleanup or False
    instrumental_cleanup = request.instrumental_cleanup or False
    job = job_manager.create_job(
        file_id=file_id,
        filename=filename,
        model_type=model_type,
        stems=stems,
        vocal_cleanup=vocal_cleanup,
        instrumental_cleanup=instrumental_cleanup
    )
    
    # Enqueue background task
    background_tasks.add_task(job_manager.run_separation_task, job.job_id)
    
    return SeparateResponse(
        job_id=job.job_id,
        status=job.status
    )
 
@router.get("/job/{jobId}", response_model=JobStatusResponse)
async def get_job_status(jobId: str):
    """
    Returns the status and metadata of a separation job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job with ID {jobId} not found."
        )
        
    return JobStatusResponse(
        job_id=job.job_id,
        file_id=job.file_id,
        filename=job.filename,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        model_type=job.model_type,
        stems=job.stems,
        vocal_cleanup=job.vocal_cleanup,
        instrumental_cleanup=job.instrumental_cleanup,
        error_message=job.error_message,
        vocals_ready=job.vocals_path is not None,
        backing_vocals_ready=job.backing_vocals_path is not None,
        instrumental_ready=job.instrumental_path is not None,
        drums_ready=job.drums_path is not None,
        bass_ready=job.bass_path is not None,
        other_ready=job.other_path is not None
    )

@router.delete("/job/{jobId}")
async def delete_job(jobId: str):
    """
    Deletes a separation job and all associated audio files.
    """
    success = job_manager.delete_job(jobId)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Job with ID {jobId} not found."
        )
    return {"message": f"Job {jobId} deleted successfully."}

@router.get("/jobs", response_model=List[Job])
async def list_all_jobs():
    """
    Returns list of all active/completed jobs.
    """
    return job_manager.list_jobs()

@router.post("/job/{jobId}/upload-to-drive", response_model=GoogleDriveUploadResponse)
async def upload_job_track_to_drive(jobId: str, request: GoogleDriveUploadRequest):
    """
    Uploads a specific audio stem track from a completed job to Google Drive
    using the user's Google OAuth2 access token.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="Separation job has not completed yet.")
        
    track = request.track.lower()
    
    # Resolve the track's local storage path from the job metadata
    track_path_key = None
    if track == "vocals":
        track_path_key = job.vocals_path
    elif track == "backing_vocals":
        track_path_key = job.backing_vocals_path
    elif track == "instrumental":
        track_path_key = job.instrumental_path
    elif track == "drums":
        track_path_key = job.drums_path
    elif track == "bass":
        track_path_key = job.bass_path
    elif track == "other":
        track_path_key = job.other_path
    elif track == "original":
        track_path_key = job.original_path
    else:
        raise HTTPException(status_code=400, detail=f"Invalid track type '{track}'.")
        
    if not track_path_key:
        raise HTTPException(
            status_code=400,
            detail=f"Requested track '{track}' was not generated or is not ready."
        )
        
    try:
        # Resolve the full file path from the storage provider
        full_file_path = storage_provider.get_file_path(track_path_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Track file for '{track}' could not be found on storage."
        )
        
    # Construct a friendly display filename: e.g. "my_song_vocals.mp3"
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = full_file_path.suffix
    display_filename = f"{orig_name_sans_ext}_{track}{ext}"
    
    # Determine if we should mock the upload based on access token or configuration
    is_mock = settings.MOCK_MODAL or request.access_token.startswith("mock-") or not os.getenv("VITE_GOOGLE_CLIENT_ID")
    
    if is_mock:
        logger.info(f"[Mock Drive] Simulating Google Drive upload for {display_filename}...")
        # Simulate slight network delay
        await asyncio.sleep(1.5)
        mock_id = f"mock-drive-id-{uuid.uuid4().hex[:12]}"
        mock_url = f"https://drive.google.com/file/d/{mock_id}/view?usp=drivesdk"
        logger.info(f"[Mock Drive] Simulated upload successful. URL: {mock_url}")
        return GoogleDriveUploadResponse(view_url=mock_url)
        
    try:
        # Perform actual upload to Google Drive
        view_url = await upload_file_to_google_drive(
            file_path=full_file_path,
            filename=display_filename,
            access_token=request.access_token
        )
        return GoogleDriveUploadResponse(view_url=view_url)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload track to Google Drive: {str(e)}"
        )
