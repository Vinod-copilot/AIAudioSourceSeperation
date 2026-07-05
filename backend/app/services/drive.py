import logging
from pathlib import Path
import httpx
import json

logger = logging.getLogger("uvicorn")

async def upload_file_to_google_drive(file_path: Path, filename: str, access_token: str) -> str:
    """
    Uploads a file to Google Drive using the provided OAuth2 access token.
    Uses multipart upload (metadata + media content).
    Returns the Google Drive web view URL of the uploaded file.
    """
    logger.info(f"Starting Google Drive upload for {filename} ({file_path})")
    
    if not file_path.exists():
        raise FileNotFoundError(f"Source file not found at {file_path}")
        
    # Construct metadata
    # We set MIME type based on file extension
    ext = file_path.suffix.lower()
    mime_type = "audio/mpeg" if ext == ".mp3" else "audio/wav"
    
    metadata = {
        "name": filename,
        "mimeType": mime_type
    }
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    # Read file content
    file_bytes = file_path.read_bytes()
    
    # httpx expects multipart files as: (filename, file_content, content_type)
    # The metadata part doesn't have a filename, just JSON data.
    files = {
        "metadata": (None, json.dumps(metadata), "application/json; charset=UTF-8"),
        "file": (filename, file_bytes, mime_type)
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers=headers,
                files=files,
                timeout=60.0
            )
            
            if response.status_code != 200:
                logger.error(f"Google Drive upload returned status code {response.status_code}: {response.text}")
                # Parse error response if possible
                try:
                    error_detail = response.json().get("error", {}).get("message", response.text)
                except Exception:
                    error_detail = response.text
                raise RuntimeError(f"Google Drive API error: {error_detail}")
                
            res_data = response.json()
            file_id = res_data.get("id")
            
            if not file_id:
                raise RuntimeError("Google Drive API response did not contain a file ID.")
                
            web_view_url = f"https://drive.google.com/file/d/{file_id}/view?usp=drivesdk"
            logger.info(f"Google Drive upload successful. File ID: {file_id}")
            return web_view_url
            
    except Exception as e:
        logger.error(f"Google Drive upload failed: {str(e)}")
        raise
