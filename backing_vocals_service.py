import os
import io
import sys
import zipfile
import pathlib
import argparse
from pathlib import Path
import modal

# Define the Modal App
app = modal.App("backing-vocals-extraction")

# Container image definition
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "demucs",
        "soundfile",
        "torch",
        "torchaudio",
        "numpy",
        "audio-separator[gpu]",
        "torchcodec",
        "fastapi",
        "python-multipart"
    )
)

# Modal Volume for model parameter caching
volume = modal.Volume.from_name("audio-models-volume", create_if_missing=True)

def run_extraction_pipeline(audio_bytes: bytes, filename: str, bve_model: str, model_cache_dir: str) -> dict:
    """
    Core separation pipeline running inside the Modal GPU container.
    1. Splits vocals and instrumental using Demucs.
    2. Separates lead and backing vocals from the vocals track using UVR BVE model.
    3. Compresses all output stems to MP3.
    """
    import tempfile
    import pathlib
    import subprocess
    import logging
    from audio_separator.separator import Separator
    import demucs.separate

    print(f"Starting extraction pipeline for {filename}...")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = pathlib.Path(temp_dir)

        # Write input file to disk
        input_file = temp_path / filename
        input_file.write_bytes(audio_bytes)

        # Create output directories
        demucs_out = temp_path / "demucs_out"
        demucs_out.mkdir()

        bve_out = temp_path / "bve_out"
        bve_out.mkdir()

        # Step 1: Run Demucs for primary separation (Vocals vs Instrumental)
        print("Demucs: Separating vocals and instrumental tracks...")
        demucs.separate.main([
            "-n", "htdemucs",
            "--two-stems", "vocals",
            "-o", str(demucs_out),
            str(input_file)
        ])

        # Locate Demucs output files
        model_dir = demucs_out / "htdemucs"
        vocals_wav_path = None
        instrumental_wav_path = None

        for path in model_dir.rglob("vocals.wav"):
            vocals_wav_path = path
        for path in model_dir.rglob("no_vocals.wav"):
            instrumental_wav_path = path

        if not vocals_wav_path or not instrumental_wav_path:
            raise RuntimeError("Demucs primary vocal/instrumental separation failed.")

        # Step 2: Load the BVE model using audio-separator
        print(f"audio-separator: Loading BVE model '{bve_model}' from {model_cache_dir}...")
        separator = Separator(
            model_file_dir=model_cache_dir,
            output_dir=str(bve_out),
            output_format="WAV",
            log_level=logging.INFO
        )
        separator.load_model(bve_model)

        # Step 3: Run secondary separation on vocals track to isolate lead and backing vocals
        print("audio-separator: Isolating lead and backing vocals...")
        output_files = separator.separate(str(vocals_wav_path))
        print(f"Generated backing vocal output files: {output_files}")

        # Resolve lead and backing files
        lead_wav_path = None
        backing_wav_path = None
        prefix = vocals_wav_path.stem.lower()

        for file_name in output_files:
            file_path = bve_out / file_name
            name_lower = file_name.lower()
            relative_name = name_lower
            if name_lower.startswith(prefix):
                relative_name = name_lower[len(prefix):]
                
            if "instrumental" in relative_name or "no_vocals" in relative_name:
                backing_wav_path = file_path
            elif "vocals" in relative_name or "lead" in relative_name:
                lead_wav_path = file_path

        # Dynamic fallback name resolution
        if not lead_wav_path or not backing_wav_path:
            for file_name in output_files:
                file_path = bve_out / file_name
                if not lead_wav_path:
                    lead_wav_path = file_path
                else:
                    backing_wav_path = file_path

        if not lead_wav_path or not backing_wav_path:
            raise RuntimeError("Failed to resolve lead and backing vocal stems from model output.")

        # Step 4: Compress stems to MP3 format using ffmpeg
        lead_mp3 = temp_path / "lead_vocals.mp3"
        backing_mp3 = temp_path / "backing_vocals.mp3"
        inst_mp3 = temp_path / "instrumental.mp3"

        print("FFmpeg: Compressing output stems to MP3...")
        for src, dst in [
            (lead_wav_path, lead_mp3),
            (backing_wav_path, backing_mp3),
            (instrumental_wav_path, inst_mp3)
        ]:
            subprocess.run([
                "ffmpeg", "-y", "-i", str(src),
                "-codec:a", "libmp3lame", "-qscale:a", "2",
                str(dst)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if not all(p.exists() for p in [lead_mp3, backing_mp3, inst_mp3]):
            raise RuntimeError("MP3 encoding of output files failed.")

        print("Separation pipeline finished successfully.")
        return {
            "lead_vocals": lead_mp3.read_bytes(),
            "backing_vocals": backing_mp3.read_bytes(),
            "instrumental": inst_mp3.read_bytes()
        }


# Modal remote GPU execution function
@app.function(
    image=image,
    gpu="t4",
    timeout=900,
    volumes={"/model-cache": volume}
)
def separate_vocals(audio_bytes: bytes, filename: str, bve_model: str = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt") -> dict:
    """Modal remote entrypoint for separating backing vocals on GPU."""
    result = run_extraction_pipeline(audio_bytes, filename, bve_model, "/model-cache")
    # Commit downloads back to persistent volume storage
    try:
        volume.commit()
    except Exception as e:
        print(f"Volume commit warning: {e}")
    return result


# FastAPI ASGI App configuration
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse

web_app = FastAPI(
    title="Backing Vocals Extraction Service",
    description="ASynchronous FastAPI endpoint separating backing vocals using Demucs and UVR BVE models on Modal GPU."
)

@web_app.post("/separate")
async def api_separate(
    file: UploadFile = File(...),
    bve_model: str = Form("mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt")
):
    """
    FastAPI endpoint for separation. Upload an MP3 and download a ZIP file containing the separated stems.
    """
    if not file.filename.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Unsupported format. Please upload an MP3 file.")

    try:
        audio_bytes = await file.read()
        
        # Invoke core pipeline logic inside the container mount
        result = run_extraction_pipeline(audio_bytes, file.filename, bve_model, "/model-cache")

        # Commit volume downloads
        try:
            volume.commit()
        except Exception as e:
            print(f"Volume commit warning: {e}")

        # Construct in-memory ZIP response
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr("lead_vocals.mp3", result["lead_vocals"])
            zip_file.writestr("backing_vocals.mp3", result["backing_vocals"])
            zip_file.writestr("instrumental.mp3", result["instrumental"])
            
        zip_buffer.seek(0)
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=separated_{file.filename}.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


# Modal web hosting entrypoint
@app.function(
    image=image,
    gpu="t4",
    timeout=900,
    volumes={"/model-cache": volume}
)
@modal.asgi_app()
def api_mode():
    """Hosts the FastAPI endpoint on a public Modal URL."""
    return web_app


# Local CLI run mode entrypoints
@app.local_entrypoint()
def local_run(input: str, output_dir: str = "./output", model: str = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"):
    """
    Triggered when running: modal run backing_vocals_service.py --input <path>
    """
    input_path = Path(input)
    if not input_path.exists():
        print(f"Error: Input file '{input}' not found.")
        sys.exit(1)

    print(f"Reading '{input_path.name}'...")
    audio_bytes = input_path.read_bytes()

    print("Uploading file to Modal and initiating GPU separation (this takes 60-90s)...")
    result = separate_vocals.remote(audio_bytes, input_path.name, model)

    # Save output stems
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "lead_vocals.mp3").write_bytes(result["lead_vocals"])
    (out_dir / "backing_vocals.mp3").write_bytes(result["backing_vocals"])
    (out_dir / "instrumental.mp3").write_bytes(result["instrumental"])

    print(f"Success! Separated audio tracks saved in folder: {out_dir.resolve()}")


if __name__ == "__main__":
    # Handle direct script invocation: python backing_vocals_service.py
    parser = argparse.ArgumentParser(description="Backing Vocals Extraction local CLI caller.")
    parser.add_argument("--input", required=True, help="Path to input MP3 file")
    parser.add_argument("--output-dir", default="./output", help="Directory where outputs will be stored")
    parser.add_argument("--model", default="mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt", help="UVR backing vocal model filename")

    args = parser.parse_args()
    input_path = Path(args.input)

    if not input_path.exists():
        print(f"Error: Input file '{input_path}' not found.")
        sys.exit(1)

    print(f"Reading '{input_path.name}'...")
    audio_bytes = input_path.read_bytes()

    print("Connecting to Modal and invoking deployed backing vocals service...")
    try:
        # Lookup the deployed function handler
        separate_fn = modal.Function.from_name("backing-vocals-extraction", "separate_vocals")
        
        print("Invoking remote function on GPU... (takes 60-90s)...")
        result = separate_fn.remote(audio_bytes, input_path.name, args.model)

        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        (out_dir / "lead_vocals.mp3").write_bytes(result["lead_vocals"])
        (out_dir / "backing_vocals.mp3").write_bytes(result["backing_vocals"])
        (out_dir / "instrumental.mp3").write_bytes(result["instrumental"])

        print(f"Success! Output tracks saved to: {out_dir.resolve()}")
    except Exception as e:
        print(f"Error connecting to Modal: {e}")
        print("Please ensure you deploy the app first by running: modal deploy backing_vocals_service.py")
