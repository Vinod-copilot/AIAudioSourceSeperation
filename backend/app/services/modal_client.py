import os
import logging
import time
from typing import Callable, Optional
from app.config import settings

logger = logging.getLogger("uvicorn")

class ModalClient:
    def __init__(self):
        self.app_name = settings.MODAL_APP_NAME
        self.function_name = settings.MODAL_FUNCTION_NAME
        # Read mock mode from settings
        self.mock_mode = settings.MOCK_MODAL
        
        if self.mock_mode:
            logger.info("ModalClient initialized in MOCK mode. Calls will simulate processing locally.")
        else:
            logger.info("ModalClient initialized in PRODUCTION mode. Connecting to remote GPU container...")
            # Propagate credentials to OS environment for Modal SDK
            if settings.MODAL_TOKEN_ID:
                os.environ["MODAL_TOKEN_ID"] = settings.MODAL_TOKEN_ID
            if settings.MODAL_TOKEN_SECRET:
                os.environ["MODAL_TOKEN_SECRET"] = settings.MODAL_TOKEN_SECRET

    def separate_audio(
        self,
        audio_bytes: bytes,
        filename: str,
        model_type: str = "demucs",
        stems: int = 2,
        vocal_cleanup: bool = False,
        instrumental_cleanup: bool = False,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> dict:
        """
        Calls the Demucs separation function.
        In mock mode, simulates latency with fake progress updates.
        In production, uses remote_gen() to stream real progress from the Modal GPU container.
        
        progress_callback(pct: int, stage: str) is called on each progress update.
        Returns the final result dict (vocals/instrumental bytes).
        """
        if self.mock_mode:
            logger.info(f"[Mock Modal] Simulating separation ({model_type}, stems={stems}, cleanup={vocal_cleanup}, inst_cleanup={instrumental_cleanup}) for {filename}...")
            
            # Emit fake progress steps with delays
            mock_steps = [
                (10, "Getting ready...", 0.5),
                (30, "Running AI model...", 1.5),
                (60, "AI is working hard...", 1.5),
                (80, "AI finished, saving files...", 0.5),
                (85, "Compressing stems to MP3...", 1.0),
            ]
            for pct, stage, delay in mock_steps:
                time.sleep(delay)
                if progress_callback:
                    progress_callback(pct, stage)
                logger.info(f"[Mock Modal] {stage} ({pct}%)")
            
            logger.info("[Mock Modal] Processing complete. Returning mock audio data.")
            
            if model_type in ("bve", "male_female", "medleyvox"):
                return {
                    "lead_vocals": audio_bytes,
                    "backing_vocals": audio_bytes,
                    "instrumental": audio_bytes,
                    "lead_vocals_filename": "mock_vocalist1.mp3" if model_type == "medleyvox" else ("mock_male_vocals.mp3" if model_type == "male_female" else "mock_lead_vocals.mp3"),
                    "backing_vocals_filename": "mock_vocalist2.mp3" if model_type == "medleyvox" else ("mock_female_vocals.mp3" if model_type == "male_female" else "mock_backing_vocals.mp3"),
                    "instrumental_filename": "mock_instrumental.mp3"
                }
            elif model_type == "pro_ensemble":
                return {
                    "vocals": audio_bytes,
                    "instrumental": audio_bytes,
                    "vocals_filename": "mock_vocals_pro_ensemble.mp3",
                    "instrumental_filename": "mock_instrumental_pro_ensemble.mp3"
                }
            elif stems == 4 and model_type == "demucs":
                return {
                    "vocals": audio_bytes,
                    "drums": audio_bytes,
                    "bass": audio_bytes,
                    "other": audio_bytes,
                    "vocals_filename": "mock_vocals.mp3",
                    "drums_filename": "mock_drums.mp3",
                    "bass_filename": "mock_bass.mp3",
                    "other_filename": "mock_other.mp3"
                }
            else:
                return {
                    "vocals": audio_bytes,
                    "instrumental": audio_bytes,
                    "vocals_filename": "mock_vocals.mp3",
                    "instrumental_filename": "mock_instrumental.mp3"
                }
            
        try:
            import modal
            
            logger.info(f"Looking up remote Modal function: {self.app_name}.{self.function_name}")
            separate_fn = modal.Function.from_name(self.app_name, self.function_name)
            
            logger.info(f"Invoking Modal function (streaming) with model: {model_type}, stems: {stems}, cleanup: {vocal_cleanup}, inst_cleanup: {instrumental_cleanup}...")
            start_time = time.time()
            result = None

            try:
                # Try remote_gen() first — works after re-deploying the generator version
                for chunk in separate_fn.remote_gen(audio_bytes, filename, model_type, stems, vocal_cleanup, instrumental_cleanup):
                    if "progress" in chunk:
                        pct = chunk["progress"]
                        stage = chunk.get("stage", "")
                        logger.info(f"[Modal Stream] {stage} ({pct}%)")
                        if progress_callback:
                            progress_callback(pct, stage)
                    elif "error" in chunk:
                        return {"error": chunk["error"]}
                    else:
                        result = chunk
            except Exception as gen_err:
                if "non-generator" in str(gen_err) or "remote_gen" in str(gen_err):
                    # Old deployed version — fall back to blocking .remote()
                    logger.warning(f"remote_gen() not supported (old deployment), falling back to .remote(): {gen_err}")
                    if progress_callback:
                        progress_callback(30, "Sending to AI (older deployment)...")
                    result = separate_fn.remote(audio_bytes, filename, model_type, stems, vocal_cleanup, instrumental_cleanup)
                    if progress_callback:
                        progress_callback(85, "AI finished, saving files...")
                else:
                    raise

            duration = time.time() - start_time
            logger.info(f"Modal execution finished in {duration:.2f} seconds.")
            return result if result else {"error": "Modal function returned no result."}
        except Exception as e:
            logger.error(f"Modal Remote Invocation Error: {str(e)}")
            return {"error": f"Failed to connect to Modal: {str(e)}"}

modal_client = ModalClient()

