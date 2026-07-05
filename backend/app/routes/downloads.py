import os
import logging
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from app.services.job_manager import job_manager
from app.services.storage import storage_provider

logger = logging.getLogger("uvicorn")
router = APIRouter()

def get_file_response(
    storage_key: str,
    download_name: str,
    should_download: bool
) -> FileResponse:
    """Helper to serve file or download attachment."""
    try:
        file_path = storage_provider.get_file_path(storage_key)
    except FileNotFoundError as e:
        logger.error(f"File lookup failed: {str(e)}")
        raise HTTPException(
            status_code=404,
            detail="Requested audio file not found on storage."
        )
        
    media_type = "audio/mpeg" if file_path.suffix == ".mp3" else "audio/wav"
    
    headers = {}
    if should_download:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{download_name}"'
        
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers=headers
    )

@router.get("/download/{jobId}/vocals")
async def download_vocals(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated vocals track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.vocals_path:
        raise HTTPException(
            status_code=400,
            detail="Vocals track is not ready or separation failed."
        )
        
    # Generate descriptive download filename: e.g. "originalName_vocals.mp3"
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.vocals_path)[1]
    download_filename = f"{orig_name_sans_ext}_vocals{ext}"
    
    return get_file_response(job.vocals_path, download_filename, download)

@router.get("/download/{jobId}/instrumental")
async def download_instrumental(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated instrumental track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.instrumental_path:
        raise HTTPException(
            status_code=400,
            detail="Instrumental track is not ready or separation failed."
        )
        
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.instrumental_path)[1]
    download_filename = f"{orig_name_sans_ext}_instrumental{ext}"
    
    return get_file_response(job.instrumental_path, download_filename, download)

@router.get("/download/{jobId}/original")
async def download_original(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the original uploaded audio file.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if not job.original_path:
        raise HTTPException(
            status_code=400,
            detail="Original file path is not set."
        )
        
    return get_file_response(job.original_path, job.filename, download)

@router.get("/download/{jobId}/drums")
async def download_drums(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated drums track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.drums_path:
        raise HTTPException(
            status_code=400,
            detail="Drums track is not ready or separation failed."
        )
        
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.drums_path)[1]
    download_filename = f"{orig_name_sans_ext}_drums{ext}"
    
    return get_file_response(job.drums_path, download_filename, download)

@router.get("/download/{jobId}/bass")
async def download_bass(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated bass track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.bass_path:
        raise HTTPException(
            status_code=400,
            detail="Bass track is not ready or separation failed."
        )
        
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.bass_path)[1]
    download_filename = f"{orig_name_sans_ext}_bass{ext}"
    
    return get_file_response(job.bass_path, download_filename, download)

@router.get("/download/{jobId}/other")
async def download_other(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated other track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.other_path:
        raise HTTPException(
            status_code=400,
            detail="Other track is not ready or separation failed."
        )
        
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.other_path)[1]
    download_filename = f"{orig_name_sans_ext}_other{ext}"
    
    return get_file_response(job.other_path, download_filename, download)

@router.get("/download/{jobId}/backing_vocals")
async def download_backing_vocals(
    jobId: str,
    download: bool = Query(False, description="Force download file attachment")
):
    """
    Streams or downloads the separated backing vocals track for a completed job.
    """
    job = job_manager.get_job(jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job.status != "COMPLETED" or not job.backing_vocals_path:
        raise HTTPException(
            status_code=400,
            detail="Backing vocals track is not ready or separation failed."
        )
        
    orig_name_sans_ext = os.path.splitext(job.filename)[0]
    ext = os.path.splitext(job.backing_vocals_path)[1]
    download_filename = f"{orig_name_sans_ext}_backing_vocals{ext}"
    
    return get_file_response(job.backing_vocals_path, download_filename, download)
