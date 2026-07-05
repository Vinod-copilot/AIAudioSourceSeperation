import pytest
import io
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)

def test_healthcheck():
    """Verify that the health check endpoint returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "project": settings.PROJECT_NAME}

def test_upload_validation_invalid_type():
    """Verify that uploading a non-MP3 file returns a 400 Bad Request error."""
    # Try uploading a dummy text file
    file_content = b"This is a dummy text file."
    files = {"file": ("test.txt", file_content, "text/plain")}
    response = client.post("/api/upload", files=files)
    assert response.status_code == 400
    assert "Only .mp3 files are allowed" in response.json()["detail"]

def test_upload_validation_empty_file():
    """Verify uploading an empty MP3 file registers and uploads successfully."""
    # Upload an empty MP3 file
    file_content = b"ID3v2...dummy-mp3-bytes"
    files = {"file": ("test.mp3", file_content, "audio/mpeg")}
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "file_id" in data
    assert data["filename"] == "test.mp3"
    assert data["size"] == len(file_content)

def test_get_nonexistent_job():
    """Verify querying a nonexistent job returns a 404 Not Found error."""
    response = client.get("/api/job/invalid-uuid-job-id")
    assert response.status_code == 404
    assert "Job with ID" in response.json()["detail"]

def test_list_jobs():
    """Verify retrieving list of jobs returns a valid JSON array."""
    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_import_youtube_empty_url():
    """Verify that importing an empty URL returns a 400 Bad Request error."""
    response = client.post("/api/import/youtube", json={"url": "   "})
    assert response.status_code == 400
    assert "YouTube URL is empty" in response.json()["detail"]

def test_import_youtube_success():
    """Verify importing a YouTube URL successfully mocks the download process."""
    from unittest.mock import patch
    mock_result = {
        "file_id": "test-youtube-id",
        "filename": "test_video.mp3",
        "size": 12345
    }
    with patch("app.routes.api.download_youtube_audio", return_value=mock_result):
        response = client.post("/api/import/youtube", json={"url": "https://www.youtube.com/watch?v=mock"})
        assert response.status_code == 200
        data = response.json()
        assert data["file_id"] == "test-youtube-id"
        assert data["filename"] == "test_video.mp3"
        assert data["size"] == 12345
        assert "imported and converted" in data["message"]

def test_upload_to_drive_job_not_found():
    """Verify that uploading to Google Drive for a non-existent job returns 404."""
    response = client.post(
        "/api/job/non-existent-job/upload-to-drive",
        json={"track": "vocals", "access_token": "mock-token"}
    )
    assert response.status_code == 404
    assert "Job not found" in response.json()["detail"]

def test_upload_to_drive_mock_success():
    """Verify that uploading a track under Mock/Demo mode succeeds and returns a mock URL."""
    from unittest.mock import patch, MagicMock
    from app.models import Job, JobStatus
    
    mock_job = Job(
        job_id="test-job-id",
        file_id="test-file-id",
        filename="song.mp3",
        status=JobStatus.COMPLETED,
        created_at="2026-07-05T12:00:00Z",
        updated_at="2026-07-05T12:05:00Z",
        vocals_path="uploads/test-job-id_vocals.mp3",
        instrumental_path="uploads/test-job-id_instrumental.mp3"
    )
    
    with patch("app.routes.api.job_manager.get_job", return_value=mock_job), \
         patch("app.routes.api.storage_provider.get_file_path", return_value=MagicMock()):
        response = client.post(
            "/api/job/test-job-id/upload-to-drive",
            json={"track": "vocals", "access_token": "mock-token"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "view_url" in data
        assert "drive.google.com" in data["view_url"]


