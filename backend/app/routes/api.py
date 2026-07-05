import os
import uuid
import logging
from typing import List
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks
from app.config import settings
from app.models import (
    UploadResponse, SeparateRequest, SeparateResponse, JobStatusResponse, Job
)
from app.services.storage import storage_provider
from app.services.job_manager import job_manager

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
