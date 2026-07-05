from abc import ABC, abstractmethod
from pathlib import Path
import os
import shutil
from app.config import settings

class StorageProvider(ABC):
    """
    Abstract Base Class defining the contract for audio storage.
    Can be implemented for Local Storage, AWS S3, Google Cloud Storage, etc.
    """
    
    @abstractmethod
    def save_file(self, folder: str, filename: str, data: bytes) -> str:
        """Saves file bytes and returns a unique locator/path."""
        pass
        
    @abstractmethod
    def get_file_bytes(self, key: str) -> bytes:
        """Retrieves file bytes from storage."""
        pass
        
    @abstractmethod
    def get_file_path(self, key: str) -> Path:
        """Returns local path or raises error if only remote is supported."""
        pass

    @abstractmethod
    def delete_file(self, key: str) -> bool:
        """Deletes file from storage."""
        pass


class LocalStorageProvider(StorageProvider):
    """
    StorageProvider implementation using the local filesystem.
    """
    def __init__(self, base_dir: Path = settings.STORAGE_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, key: str) -> Path:
        # Prevent directory traversal attacks
        safe_path = self.base_dir / Path(key).name
        return safe_path

    def save_file(self, folder: str, filename: str, data: bytes) -> str:
        target_folder = self.base_dir / folder
        target_folder.mkdir(parents=True, exist_ok=True)
        
        file_path = target_folder / filename
        file_path.write_bytes(data)
        
        # Return a standard relative storage path key (e.g. "uploads/jobid_input.mp3")
        return f"{folder}/{filename}"

    def get_file_bytes(self, key: str) -> bytes:
        full_path = self.base_dir / key
        if not full_path.exists():
            raise FileNotFoundError(f"Storage file not found: {key}")
        return full_path.read_bytes()

    def get_file_path(self, key: str) -> Path:
        full_path = self.base_dir / key
        if not full_path.exists():
            raise FileNotFoundError(f"Storage file not found: {key}")
        return full_path

    def delete_file(self, key: str) -> bool:
        full_path = self.base_dir / key
        if full_path.exists():
            full_path.unlink()
            # Clean up parent directory if it is empty and not the base directory itself
            parent = full_path.parent
            if parent != self.base_dir and parent.is_dir() and not os.listdir(parent):
                try:
                    parent.rmdir()
                except Exception:
                    pass
            return True
        return False


# S3 mock structure for future implementation reference:
"""
import boto3

class S3StorageProvider(StorageProvider):
    def __init__(self, bucket_name: str):
        self.s3_client = boto3.client('s3')
        self.bucket_name = bucket_name

    def save_file(self, folder: str, filename: str, data: bytes) -> str:
        key = f"{folder}/{filename}"
        self.s3_client.put_object(Bucket=self.bucket_name, Key=key, Body=data)
        return key

    def get_file_bytes(self, key: str) -> bytes:
        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
        return response['Body'].read()

    def get_file_path(self, key: str) -> Path:
        raise NotImplementedError("S3 storage does not support direct path resolution. Use URL streaming or download to local cache.")

    def delete_file(self, key: str) -> bool:
        self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
        return True
"""

# Instantiate the active storage provider
storage_provider = LocalStorageProvider()
