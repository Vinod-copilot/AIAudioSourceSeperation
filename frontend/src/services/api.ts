export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Job {
  job_id: string;
  file_id: string;
  filename: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  model_type?: string;
  stems?: number;
  vocal_cleanup?: boolean;
  instrumental_cleanup?: boolean;
  error_message: string | null;
  vocals_ready: boolean;
  backing_vocals_ready?: boolean;
  instrumental_ready: boolean;
  drums_ready?: boolean;
  bass_ready?: boolean;
  other_ready?: boolean;
  vocals_path?: string;
  backing_vocals_path?: string;
  instrumental_path?: string;
  drums_path?: string;
  bass_path?: string;
  other_path?: string;
  original_path?: string;
  progress?: number;                 // 0-100 real backend progress
  processing_started_at?: string;   // ISO timestamp when Modal call began
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  size: number;
  message: string;
}

export interface SeparateResponse {
  job_id: string;
  status: JobStatus;
  message: string;
}

// Determine API base URL. If VITE_BACKEND_URL is set (production), use it directly.
// Otherwise, use relative path (which local Vite dev proxy forwards to localhost:8000).
const rawBackendUrl = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');
export const BASE_URL = rawBackendUrl ? `${rawBackendUrl}/api` : '/api';


export const apiClient = {
  /**
   * Uploads an MP3 file with progress updates.
   */
  uploadFile(file: File, onProgress: (progress: number) => void): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/upload`);

      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Failed to parse upload response.'));
          }
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            reject(new Error(errorResponse.detail || 'Upload failed.'));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network connection error during upload.'));
      };

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  },

  /**
   * Imports an audio file by downloading a YouTube video URL and converting it to MP3.
   */
  async importYoutube(url: string): Promise<UploadResponse> {
    const response = await fetch(`${BASE_URL}/import/youtube`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to import audio from YouTube.');
    }

    return response.json();
  },

  /**
   * Triggers the separation backend task for a given fileId, modelType, stems count, and vocalCleanup.
   */
  async triggerSeparate(fileId: string, modelType: string = 'demucs', stems: number = 2, vocalCleanup: boolean = false, instrumentalCleanup: boolean = false): Promise<SeparateResponse> {
    const response = await fetch(`${BASE_URL}/separate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_id: fileId,
        model_type: modelType,
        stems: stems,
        vocal_cleanup: vocalCleanup,
        instrumental_cleanup: instrumentalCleanup
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to trigger audio separation.');
    }

    return response.json();
  },

  /**
   * Uploads a specific stem track from a job to Google Drive.
   */
  async uploadTrackToGoogleDrive(jobId: string, track: string, accessToken: string): Promise<{ view_url: string }> {
    const response = await fetch(`${BASE_URL}/job/${jobId}/upload-to-drive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        track,
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to upload track to Google Drive.');
    }

    return response.json();
  },

  /**
   * Retrieves the status of a specific job.
   */
  async getJobStatus(jobId: string): Promise<Job> {
    const response = await fetch(`${BASE_URL}/job/${jobId}`);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to fetch job status.');
    }

    return response.json();
  },

  /**
   * Deletes a separation job and its local files.
   */
  async deleteJob(jobId: string): Promise<{ message: string }> {
    const response = await fetch(`${BASE_URL}/job/${jobId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to delete job.');
    }

    return response.json();
  },

  /**
   * Lists all past active and completed jobs.
   */
  async listJobs(): Promise<Job[]> {
    const response = await fetch(`${BASE_URL}/jobs`);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to fetch jobs list.');
    }

    return response.json();
  },

  /**
   * Helper to retrieve URL for downloading or playing files.
   */
  getDownloadUrl(jobId: string, track: 'vocals' | 'backing_vocals' | 'instrumental' | 'drums' | 'bass' | 'other' | 'original', forceDownload = false): string {
    return `${BASE_URL}/download/${jobId}/${track}${forceDownload ? '?download=true' : ''}`;
  }
};
