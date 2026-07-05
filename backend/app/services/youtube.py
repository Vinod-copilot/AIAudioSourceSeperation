import uuid
import logging
from pathlib import Path
import yt_dlp

logger = logging.getLogger("uvicorn")

def download_youtube_audio(url: str, output_dir: Path) -> dict:
    """
    Downloads the audio from a YouTube video URL using yt-dlp,
    extracts the audio, converts it to 320kbps MP3 using FFmpeg,
    and saves it to the output_dir.
    """
    file_id = str(uuid.uuid4())
    logger.info(f"Starting YouTube download for URL: {url} with file_id: {file_id}")
    
    # We download as a temporary filename so we can rename it easily after post-processing
    temp_template = str(output_dir / f"{file_id}_temp.%(ext)s")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': temp_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320', # 320 kbps MP3
        }],
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract video metadata to get a friendly filename title
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'youtube_audio')
            
            # Sanitize the title to make it a safe filename
            clean_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-', '.')).strip()
            clean_title = clean_title.replace(' ', '_')
            if not clean_title:
                clean_title = "youtube_audio"
            
            # Perform actual download and post-processing (conversion to MP3 via FFmpeg)
            ydl.download([url])
            
        # The post-processor converts the audio and names it as f"{file_id}_temp.mp3"
        temp_file = output_dir / f"{file_id}_temp.mp3"
        final_filename = f"{file_id}_{clean_title}.mp3"
        final_file = output_dir / final_filename
        
        if temp_file.exists():
            temp_file.rename(final_file)
        else:
            # Fallback check in case the file extension wasn't .mp3 for some reason
            matching_files = list(output_dir.glob(f"{file_id}_temp.*"))
            if matching_files:
                matching_files[0].rename(final_file)
            else:
                raise FileNotFoundError("yt-dlp downloaded the file, but the post-processed file could not be found.")
        
        file_size = final_file.stat().st_size
        logger.info(f"YouTube download complete. Saved as {final_filename} (Size: {file_size} bytes)")
        
        return {
            "file_id": file_id,
            "filename": f"{clean_title}.mp3",
            "size": file_size
        }
        
    except Exception as e:
        logger.error(f"Failed to download/convert YouTube audio: {str(e)}")
        # Clean up any leftover temporary files if they exist
        for temp_leftover in output_dir.glob(f"{file_id}_temp.*"):
            try:
                temp_leftover.unlink()
            except Exception:
                pass
        raise RuntimeError(f"YouTube import failed: {str(e)}")
