import React, { useEffect, useState } from 'react';
import { apiClient, Job } from '../services/api';
import { MixerConsole } from './MixerConsole';
import { ArrowLeft, Mic, Music, Loader2, AlertCircle, Sliders, Speaker } from 'lucide-react';

interface ResultPageProps {
  jobId: string;
  onBack: () => void;
}

export const ResultPage: React.FC<ResultPageProps> = ({ jobId, onBack }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Progress Bar Simulation states
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing serverless GPU...');

  useEffect(() => {
    if (!loading || !job || job.status === 'COMPLETED' || job.status === 'FAILED') {
      return;
    }

    // Set estimated duration based on model type
    let estimatedSeconds = 60;
    if (job.model_type === 'ensemble') {
      estimatedSeconds = 95;
    } else if (job.model_type === 'male_female') {
      estimatedSeconds = 85;
    } else if (job.model_type === 'bve') {
      estimatedSeconds = 50;
    } else if (job.model_type === 'demucs') {
      estimatedSeconds = 40;
    }

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 0.5;
      
      // Update status messages contextually based on progress
      if (elapsed < 8) {
        setStatusMessage('Spinning up remote Nvidia GPU container...');
      } else if (elapsed < 20) {
        setStatusMessage('Loading audio signals and model checkpoints...');
      } else if (elapsed < estimatedSeconds * 0.7) {
        setStatusMessage('Running spectrogram AI separation (this may take a moment)...');
      } else if (elapsed < estimatedSeconds * 0.85) {
        if (job.vocal_cleanup) {
          setStatusMessage('Applying Studio De-Reverb cleanup algorithms...');
        } else {
          setStatusMessage('Synthesizing and post-processing separate stems...');
        }
      } else {
        setStatusMessage('Encoding audio stems to MP3 format and uploading workspace files...');
      }

      // Calculate progress percentage
      let nextProgress = 0;
      if (elapsed < estimatedSeconds) {
        nextProgress = Math.min(90, Math.round((elapsed / estimatedSeconds) * 90));
      } else {
        const extraTime = elapsed - estimatedSeconds;
        nextProgress = Math.min(98, 90 + Math.round((extraTime / 20) * 8));
      }

      setProgress(nextProgress);
    }, 500);

    return () => clearInterval(interval);
  }, [loading, job]);

  useEffect(() => {
    loadJob();
    
    // Poll job status if it's not completed or failed yet
    let intervalId: any;
    
    const checkStatus = async () => {
      try {
        const data = await apiClient.getJobStatus(jobId);
        setJob(data);
        
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          setLoading(false);
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to update job status.');
        setLoading(false);
        clearInterval(intervalId);
      }
    };

    intervalId = setInterval(checkStatus, 5000);

    return () => clearInterval(intervalId);
  }, [jobId]);

  const loadJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getJobStatus(jobId);
      setJob(data);
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch job details.');
      setLoading(false);
    }
  };

  if (loading && (!job || (job.status !== 'COMPLETED' && job.status !== 'FAILED'))) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', maxWidth: '600px', margin: '2rem auto' }}>
        <Loader2 className="spinning" size={48} style={{ color: 'var(--primary-accent)', marginBottom: '0.5rem' }} />
        
        <div style={{ width: '100%' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            Processing Separation Job ({progress}%)
          </h3>
          
          {/* Progress Bar Container */}
          <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '1rem' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))', borderRadius: '10px', transition: 'width 0.4s ease-out', boxShadow: '0 0 10px var(--primary-accent)' }} />
          </div>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', minHeight: '1.5rem', fontStyle: 'italic' }}>
            {statusMessage}
          </p>
        </div>
        
        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '0.5rem' }}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)' }} />
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Failed to Load Results
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>{error || 'The job could not be retrieved.'}</p>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (job.status === 'FAILED') {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)' }} />
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Separation Failed
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            An error occurred while processing the audio:
          </p>
          <code style={{ display: 'block', background: 'rgba(255,0,0,0.08)', padding: '1rem', borderRadius: '4px', border: '1px solid rgba(255,0,0,0.1)', color: 'var(--danger)', fontSize: '0.85rem' }}>
            {job.error_message || 'Unknown processing error'}
          </code>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  const originalUrl = apiClient.getDownloadUrl(jobId, 'original');
  const vocalsUrl = apiClient.getDownloadUrl(jobId, 'vocals');
  const backingVocalsUrl = apiClient.getDownloadUrl(jobId, 'backing_vocals');
  const instrumentalUrl = apiClient.getDownloadUrl(jobId, 'instrumental');
  const drumsUrl = apiClient.getDownloadUrl(jobId, 'drums');
  const bassUrl = apiClient.getDownloadUrl(jobId, 'bass');
  const otherUrl = apiClient.getDownloadUrl(jobId, 'other');

  const isFourStems = job.stems === 4;
  const isBve = job.model_type === 'bve';
  const isMaleFemale = job.model_type === 'male_female';
  const isMedleyVox = job.model_type === 'medleyvox';

  // Construct the stems array dynamically for the synced Multi-Track Mixer
  const mixerStems: any[] = [];
  
  if (isBve || isMaleFemale || isMedleyVox) {
    mixerStems.push({
      id: 'vocals',
      url: vocalsUrl,
      label: isMaleFemale ? 'Male Vocals' : isMedleyVox ? 'Vocalist 1' : 'Lead Vocals',
      color: 'hsl(271, 76%, 53%)',
      icon: <Mic size={20} />
    });
    mixerStems.push({
      id: 'backing_vocals',
      url: backingVocalsUrl,
      label: isMaleFemale ? 'Female Vocals' : isMedleyVox ? 'Vocalist 2' : 'Backing Vocals',
      color: 'hsl(35, 92%, 50%)',
      icon: <Mic size={20} />
    });
    mixerStems.push({
      id: 'instrumental',
      url: instrumentalUrl,
      label: 'Instrumental',
      color: 'hsl(182, 100%, 50%)',
      icon: <Music size={20} />
    });
  } else if (isFourStems && job.model_type === 'demucs') {
    mixerStems.push({
      id: 'vocals',
      url: vocalsUrl,
      label: 'Vocals',
      color: 'hsl(271, 76%, 53%)',
      icon: <Mic size={20} />
    });
    mixerStems.push({
      id: 'drums',
      url: drumsUrl,
      label: 'Drums',
      color: 'hsl(182, 100%, 50%)',
      icon: <Speaker size={20} />
    });
    mixerStems.push({
      id: 'bass',
      url: bassUrl,
      label: 'Bassline',
      color: 'hsl(199, 89%, 48%)',
      icon: <Sliders size={20} />
    });
    mixerStems.push({
      id: 'other',
      url: otherUrl,
      label: 'Other Instruments',
      color: 'hsl(35, 92%, 50%)',
      icon: <Music size={20} />
    });
  } else {
    mixerStems.push({
      id: 'vocals',
      url: vocalsUrl,
      label: 'Vocals',
      color: 'hsl(271, 76%, 53%)',
      icon: <Mic size={20} />
    });
    mixerStems.push({
      id: 'instrumental',
      url: instrumentalUrl,
      label: 'Instrumental',
      color: 'hsl(182, 100%, 50%)',
      icon: <Music size={20} />
    });
  }

  return (
    <div className="result-layout">
      {/* Result Header */}
      <div className="result-header">
        <div className="result-header-title">
          <button className="btn btn-secondary" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Separation Workspace</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{job.filename}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.05)' }}>
            Model: {job.model_type === 'mdx' ? 'MDX-Net' : job.model_type === 'bve' ? 'Mel-Band Roformer Karaoke' : job.model_type === 'medleyvox' ? 'MedleyVox Multi-Singer' : job.model_type === 'bs_roformer' ? 'BS-Roformer' : job.model_type === 'melband_roformer' ? 'Mel-Band Roformer' : job.model_type === 'mdx23c' ? 'MDX23C InstVoc' : job.model_type === 'male_female' ? 'Male/Female Split' : job.model_type === 'ensemble' ? 'SOTA Ensemble' : job.model_type === 'pro_ensemble' ? 'Pro Ensemble' : 'Demucs'}
          </span>
          {job.vocal_cleanup && (
            <span className="status-badge" style={{ background: 'rgba(138, 43, 226, 0.1)', color: 'var(--primary-accent)', border: '1px solid rgba(138, 43, 226, 0.2)' }}>
              Studio Cleanup Active
            </span>
          )}
        </div>
      </div>

      {/* Sync DJ Mixer Console */}
      <MixerConsole
        stems={mixerStems}
        originalUrl={originalUrl}
        title={job.filename}
      />
    </div>
  );
};
