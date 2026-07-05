import json
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional
import uuid

from app.config import settings
from app.models import Job, JobStatus
from app.services.storage import storage_provider
from app.services.modal_client import modal_client

logger = logging.getLogger("uvicorn")

class JobManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs_file = settings.JOBS_FILE
        self._jobs: Dict[str, Job] = {}
        self._load_jobs()

    def _load_jobs(self):
        """Loads jobs from disk if the JSON file exists."""
        with self.lock:
            if self.jobs_file.exists():
                try:
                    with open(self.jobs_file, "r") as f:
                        data = json.load(f)
                        self._jobs = {
                            jid: Job(**item) for jid, item in data.items()
                        }
                    logger.info(f"Loaded {len(self._jobs)} jobs from {self.jobs_file}")
                except Exception as e:
                    logger.error(f"Failed to load jobs file: {str(e)}. Initializing empty job store.")
                    self._jobs = {}
            else:
                self._jobs = {}

    def _save_jobs(self):
        """Saves current jobs to disk."""
        # Called within lock
        try:
            with open(self.jobs_file, "w") as f:
                json.dump(
                    {jid: job.model_dump() for jid, job in self._jobs.items()},
                    f,
                    indent=2
                )
        except Exception as e:
            logger.error(f"Failed to save jobs file: {str(e)}")

    def create_job(self, file_id: str, filename: str, model_type: str = "demucs", stems: int = 2, vocal_cleanup: bool = False, instrumental_cleanup: bool = False) -> Job:
        """Creates a new Job in QUEUED state."""
        job_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        job = Job(
            job_id=job_id,
            file_id=file_id,
            filename=filename,
            status=JobStatus.QUEUED,
            created_at=now,
            updated_at=now,
            model_type=model_type,
            stems=stems,
            vocal_cleanup=vocal_cleanup,
            instrumental_cleanup=instrumental_cleanup,
            original_path=f"uploads/{file_id}_{filename}"
        )
        
        with self.lock:
            self._jobs[job_id] = job
            self._save_jobs()
            
        logger.info(f"Created job {job_id} ({model_type}) for file {filename}")
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieves job details."""
        with self.lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[Job]:
        """Lists all registered jobs, ordered by creation date desc."""
        with self.lock:
            return sorted(
                list(self._jobs.values()),
                key=lambda j: j.created_at,
                reverse=True
            )

    def delete_job(self, job_id: str) -> bool:
        """Deletes a job and all associated files from storage."""
        with self.lock:
            if job_id not in self._jobs:
                logger.warning(f"Attempted to delete non-existent job: {job_id}")
                return False
                
            job = self._jobs[job_id]
            logger.info(f"Deleting job {job_id} ({job.filename}) and associated files...")
            
            # Delete separated files (support 2, 3 and 4 stems)
            for track_path in [job.vocals_path, job.backing_vocals_path, job.instrumental_path, job.drums_path, job.bass_path, job.other_path]:
                if track_path:
                    try:
                        storage_provider.delete_file(track_path)
                    except Exception as e:
                        logger.error(f"Failed to delete file {track_path} for job {job_id}: {e}")
                    
            # Delete original file
            if job.original_path:
                try:
                    storage_provider.delete_file(job.original_path)
                except Exception as e:
                    logger.error(f"Failed to delete original file for job {job_id}: {e}")
            
            # Remove from list and save
            del self._jobs[job_id]
            self._save_jobs()
            return True

    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        error_message: Optional[str] = None,
        vocals_path: Optional[str] = None,
        backing_vocals_path: Optional[str] = None,
        instrumental_path: Optional[str] = None,
        drums_path: Optional[str] = None,
        bass_path: Optional[str] = None,
        other_path: Optional[str] = None,
        progress: Optional[int] = None,
        processing_started_at: Optional[str] = None,
    ) -> Optional[Job]:
        """Thread-safe status update helper."""
        with self.lock:
            if job_id not in self._jobs:
                return None
                
            job = self._jobs[job_id]
            job.status = status
            job.updated_at = datetime.utcnow().isoformat()
            
            if error_message:
                job.error_message = error_message
            if vocals_path:
                job.vocals_path = vocals_path
            if backing_vocals_path:
                job.backing_vocals_path = backing_vocals_path
            if instrumental_path:
                job.instrumental_path = instrumental_path
            if drums_path:
                job.drums_path = drums_path
            if bass_path:
                job.bass_path = bass_path
            if other_path:
                job.other_path = other_path
            if progress is not None:
                job.progress = progress
            if processing_started_at:
                job.processing_started_at = processing_started_at
                
            self._save_jobs()
            return job

    def update_job_progress(self, job_id: str, progress: int) -> None:
        """Lightweight helper to update just the progress field."""
        with self.lock:
            if job_id in self._jobs:
                self._jobs[job_id].progress = progress
                self._jobs[job_id].updated_at = datetime.utcnow().isoformat()
                self._save_jobs()

    def run_separation_task(self, job_id: str):
        """
        Background task that processes audio separation using Modal.
        Dispatched as a background task. Runs in a thread pool since it is synchronous.
        """
        logger.info(f"Starting background worker for job: {job_id}")
        job = self.get_job(job_id)
        if not job:
            logger.error(f"Job {job_id} not found in background task.")
            return

        # 1. Update status to PROCESSING and record start time
        started_at = datetime.utcnow().isoformat()
        self.update_job_status(
            job_id, JobStatus.PROCESSING,
            progress=5,
            processing_started_at=started_at
        )
        
        try:
            # 2. Retrieve original file bytes
            logger.info(f"Retrieving input bytes for file ID: {job.file_id}")
            input_storage_key = f"uploads/{job.file_id}_{job.filename}"
            audio_bytes = storage_provider.get_file_bytes(input_storage_key)
            self.update_job_progress(job_id, 15)   # file retrieved
            
            # 3. Call Modal with real-time progress streaming
            logger.info(f"Forwarding {len(audio_bytes)} bytes to Modal with model {job.model_type}, stems: {job.stems}, cleanup: {job.vocal_cleanup}...")
            self.update_job_progress(job_id, 25)   # about to call Modal

            def on_progress(pct: int, stage: str):
                logger.info(f"[Job {job_id}] Progress: {pct}% — {stage}")
                self.update_job_progress(job_id, pct)

            result = modal_client.separate_audio(
                audio_bytes, job.filename, job.model_type, job.stems, job.vocal_cleanup, job.instrumental_cleanup,
                progress_callback=on_progress
            )
            self.update_job_progress(job_id, 90)   # Modal returned, saving files
            
            # 4. Check for errors
            if "error" in result:
                error_msg = result["error"]
                logger.error(f"Separation failed for job {job_id}: {error_msg}")
                self.update_job_status(
                    job_id=job_id,
                    status=JobStatus.FAILED,
                    error_message=error_msg
                )
                return
                
            # 5. Save output bytes in Storage
            logger.info(f"Separation complete. Saving outputs for job {job_id}...")
            
            if job.model_type in ("bve", "male_female", "medleyvox"):
                vocal_key = "lead_vocals" if job.model_type == "male_female" else "vocals"
                lead_vocals_bytes = result[vocal_key]
                backing_vocals_bytes = result["backing_vocals"]
                instrumental_bytes = result["instrumental"]
                
                if job.model_type == "male_female":
                    lead_filename = f"{job_id}_male_vocals.mp3"
                    backing_filename = f"{job_id}_female_vocals.mp3"
                elif job.model_type == "medleyvox":
                    lead_filename = f"{job_id}_vocalist1.mp3"
                    backing_filename = f"{job_id}_vocalist2.mp3"
                else:
                    lead_filename = f"{job_id}_lead_vocals.mp3"
                    backing_filename = f"{job_id}_backing_vocals.mp3"
                instrumental_filename = f"{job_id}_instrumental.mp3"
                
                vocals_key = storage_provider.save_file(
                    folder=f"jobs/{job_id}",
                    filename=lead_filename,
                    data=lead_vocals_bytes
                )
                backing_key = storage_provider.save_file(
                    folder=f"jobs/{job_id}",
                    filename=backing_filename,
                    data=backing_vocals_bytes
                )
                instrumental_key = storage_provider.save_file(
                    folder=f"jobs/{job_id}",
                    filename=instrumental_filename,
                    data=instrumental_bytes
                )
                
                # 6. Complete BVE Job
                logger.info(f"Successfully processed BVE job {job_id}. Status set to COMPLETED.")
                self.update_job_status(
                    job_id=job_id,
                    status=JobStatus.COMPLETED,
                    vocals_path=vocals_key,
                    backing_vocals_path=backing_key,
                    instrumental_path=instrumental_key
                )
            else:
                vocals_bytes = result["vocals"]
                vocals_filename = f"{job_id}_vocals.mp3"
                vocals_key = storage_provider.save_file(
                    folder=f"jobs/{job_id}",
                    filename=vocals_filename,
                    data=vocals_bytes
                )
                
                if job.stems == 4 and job.model_type == "demucs":
                    drums_bytes = result["drums"]
                    bass_bytes = result["bass"]
                    other_bytes = result["other"]
                    
                    drums_filename = f"{job_id}_drums.mp3"
                    bass_filename = f"{job_id}_bass.mp3"
                    other_filename = f"{job_id}_other.mp3"
                    
                    drums_key = storage_provider.save_file(
                        folder=f"jobs/{job_id}",
                        filename=drums_filename,
                        data=drums_bytes
                    )
                    bass_key = storage_provider.save_file(
                        folder=f"jobs/{job_id}",
                        filename=bass_filename,
                        data=bass_bytes
                    )
                    other_key = storage_provider.save_file(
                        folder=f"jobs/{job_id}",
                        filename=other_filename,
                        data=other_bytes
                    )
                    
                    # 6. Complete 4-stem Job
                    logger.info(f"Successfully processed 4-stem job {job_id}. Status set to COMPLETED.")
                    self.update_job_status(
                        job_id=job_id,
                        status=JobStatus.COMPLETED,
                        vocals_path=vocals_key,
                        drums_path=drums_key,
                        bass_path=bass_key,
                        other_path=other_key
                    )
                else:
                    instrumental_bytes = result["instrumental"]
                    instrumental_filename = f"{job_id}_instrumental.mp3"
                    
                    instrumental_key = storage_provider.save_file(
                        folder=f"jobs/{job_id}",
                        filename=instrumental_filename,
                        data=instrumental_bytes
                    )
                    
                    # 6. Complete 2-stem Job
                    logger.info(f"Successfully processed 2-stem job {job_id}. Status set to COMPLETED.")
                    self.update_job_status(
                        job_id=job_id,
                        status=JobStatus.COMPLETED,
                        vocals_path=vocals_key,
                        instrumental_path=instrumental_key
                    )
            
        except Exception as e:
            logger.exception(f"Unhandled exception in background task for job {job_id}")
            self.update_job_status(
                job_id=job_id,
                status=JobStatus.FAILED,
                error_message=f"System error: {str(e)}"
            )

job_manager = JobManager()
