import React, { useRef, useState } from 'react';
import { Upload, FileAudio, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { apiClient } from '../services/api';

interface UploadZoneProps {
  onUploadSuccess: (fileId: string, filename: string) => void;
  onClear?: () => void;
  maxSizeMB?: number;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onUploadSuccess, onClear, maxSizeMB = 100 }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const validateAndProcessFile = (file: File) => {
    setError(null);
    setSelectedFile(null);
    setProgress(0);

    // Validate type: must be audio/mpeg or end with .mp3
    const isMp3 = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setError('Invalid file format. Only MP3 files are supported.');
      return;
    }

    // Validate size
    if (file.size > maxSizeBytes) {
      setError(`File size exceeds the limit of ${maxSizeMB} MB.`);
      return;
    }

    setSelectedFile(file);
    startUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  const triggerFileBrowser = () => {
    fileInputRef.current?.click();
  };

  const startUpload = async (file: File) => {
    setUploading(true);
    setProgress(0);
    
    try {
      const response = await apiClient.uploadFile(file, (percent) => {
        setProgress(percent);
      });
      
      console.log("UploadZone: Upload finished. Server response:", response);
      console.log("UploadZone: Propagating success callback with file_id:", response.file_id);
      onUploadSuccess(response.file_id, response.filename);
      // Keep selected file state showing completion checkmark
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during file upload.');
      setSelectedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setProgress(0);
    setError(null);
    if (onClear) {
      onClear();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="upload-container">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".mp3"
        style={{ display: 'none' }}
        disabled={uploading}
      />

      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={uploading ? undefined : triggerFileBrowser}
        role="button"
        tabIndex={0}
      >
        <div className="upload-icon-container">
          <Upload className="upload-icon" />
        </div>
        
        <p className="upload-text-main">
          {uploading ? 'Uploading your song...' : 'Drag & Drop your MP3 here'}
        </p>
        <p className="upload-text-sub">
          {uploading ? 'Please do not close this tab' : `or click to browse from files (Max ${maxSizeMB} MB)`}
        </p>
      </div>

      {error && (
        <div 
          style={{ 
            marginTop: '1.25rem', 
            padding: '1rem', 
            borderRadius: '8px', 
            background: 'rgba(244, 67, 54, 0.08)', 
            border: '1px solid rgba(244, 67, 54, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--danger)',
            fontSize: '0.9rem'
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {selectedFile && !error && (
        <div className="selected-file-card">
          <div className="file-info">
            <FileAudio className="file-icon" />
            <div className="min-width-0">
              <div className="file-name" title={selectedFile.name}>{selectedFile.name}</div>
              <div className="file-size">{formatFileSize(selectedFile.size)}</div>
            </div>
          </div>
          
          <div className="file-action" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {progress === 100 && !uploading ? (
              <>
                <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem',
                    borderRadius: '4px',
                    transition: 'background 0.2s',
                    marginLeft: '0.25rem'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 67, 54, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  title="Remove selection"
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : uploading ? (
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--secondary-accent)' }}>
                {progress}%
              </span>
            ) : null}
          </div>
        </div>
      )}

      {uploading && (
        <div className="progress-container">
          <div className="progress-header">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};
