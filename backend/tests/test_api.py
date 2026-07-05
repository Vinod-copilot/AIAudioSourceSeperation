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
