import React, { useEffect, useRef, useState } from 'react';
import { UploadZone } from './UploadZone';
import { apiClient, Job, JobStatus } from '../services/api';
import { Play, Music, AlertCircle, Loader2, FileText, ChevronDown, ChevronRight, Trash2, Youtube } from 'lucide-react';


interface DashboardProps {
  onViewJob: (jobId: string) => void;
  credits: number;
  onDeductCredits: () => void;
  onOpenTopUp: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onViewJob, credits, onDeductCredits, onOpenTopUp }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{ id: string; name: string; source?: 'upload' | 'youtube'; size?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube'>('upload');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('ensemble');
  const [selectedStems, setSelectedStems] = useState<number>(2);
  const [vocalCleanup, setVocalCleanup] = useState(false);
  const [instrumentalCleanup, setInstrumentalCleanup] = useState(true);
  const [isSeparating, setIsSeparating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always-running 1-second ticker so progress bars update every second
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  // Automatically lock stems based on selected model
  useEffect(() => {
    if (selectedModel === 'bve' || selectedModel === 'male_female' || selectedModel === 'medleyvox') {
      setSelectedStems(3);
    } else if (selectedModel !== 'demucs') {
      setSelectedStems(2);
    } else if (selectedStems === 3) {
      setSelectedStems(2);
    }
  
  }, [selectedModel]);

  // Always poll jobs every 3 seconds
  useEffect(() => {
    loadJobs(); // immediate on mount
    const intervalId = setInterval(() => {
      loadJobs();
    }, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const loadJobs = async () => {
    try {
      const list = await apiClient.listJobs();
      setJobs(list);
    } catch (err: any) {
      console.error('Failed to load jobs list:', err);
    }
  };

  const handleUploadSuccess = (fileId: string, filename: string) => {
    console.log("Dashboard: handleUploadSuccess received fileId:", fileId, "filename:", filename);
    setUploadedFile({ id: fileId, name: filename, source: 'upload' });
    setError(null);
  };

  const handleYoutubeImport = async () => {
    if (!youtubeUrl.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      const response = await apiClient.importYoutube(youtubeUrl);
      setUploadedFile({
        id: response.file_id,
        name: response.filename,
        source: 'youtube',
        size: response.size
      });
      setYoutubeUrl('');
    } catch (err: any) {
      console.error('Failed to import YouTube audio:', err);
      setError(err.message || 'Failed to import audio from YouTube. Please check the URL and try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const triggerSeparation = async () => {
    if (!uploadedFile) return;
    
    if (credits < 5.00) {
      setError('Insufficient balance! Each separation requires ₹5.00 INR. Please top up your wallet credits.');
      onOpenTopUp();
      return;
    }
    
    setIsSeparating(true);
    setError(null);
    
    // Optimistically add a placeholder job so the user sees it immediately
    const optimisticJob: Job = {
      job_id: 'pending-' + Date.now(),
      file_id: uploadedFile.id,
      filename: uploadedFile.name,
      status: 'QUEUED' as JobStatus,
      model_type: selectedModel,
      stems: selectedStems,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
      vocals_ready: false,
      instrumental_ready: false,
    };
    setJobs(prev => [optimisticJob, ...prev]);
    
    try {
      await apiClient.triggerSeparate(uploadedFile.id, selectedModel, selectedStems, vocalCleanup, instrumentalCleanup);
      onDeductCredits();
      setUploadedFile(null);
      setVocalCleanup(false);
      // Replace optimistic entry with real job from server
      await loadJobs();
    } catch (err: any) {
      // Remove optimistic entry on failure
      setJobs(prev => prev.filter(j => !j.job_id.startsWith('pending-')));
      setError(err.message || 'Failed to start audio separation. Please try again.');
    } finally {
      setIsSeparating(false);
    }
  };

  const handleDeleteJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setJobToDelete(jobId);
  };

  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;
    try {
      await apiClient.deleteJob(jobToDelete);
      await loadJobs();
    } catch (err: any) {
      setError(err.message || "Failed to delete job.");
    } finally {
      setJobToDelete(null);
    }
  };

  const parseDateSafe = (isoString: string): number => {
    if (!isoString) return now;
    let ts: number;
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !/T.*[+-]\d/.test(isoString)) {
      ts = new Date(isoString + 'Z').getTime();
    } else {
      ts = new Date(isoString).getTime();
    }
    return isNaN(ts) ? now : ts;
  };

  const calcProgress = (job: Job): number => {
    if (job.status === 'COMPLETED') return 100;
    if (job.status === 'FAILED') return 0;
    if (job.status === 'QUEUED') return 5;

    // PROCESSING: use real backend progress if available
    if (job.status === 'PROCESSING') {
      // If backend has reported real progress (>0), use it directly
      if (job.progress && job.progress > 0) {
        return Math.min(99, job.progress);
      }
      // Fallback: time-based estimate from processing_started_at or created_at
      const startMs = job.processing_started_at
        ? parseDateSafe(job.processing_started_at)
        : parseDateSafe(job.created_at);
      let estimatedSeconds = 90;
      if (job.model_type === 'pro_ensemble') estimatedSeconds = 240;
      else if (job.model_type === 'ensemble') estimatedSeconds = 120;
      else if (job.model_type === 'male_female') estimatedSeconds = 100;
      else if (job.model_type === 'medleyvox') estimatedSeconds = 110;
      else if (job.model_type === 'bs_roformer') estimatedSeconds = 80;
      else if (job.model_type === 'melband_roformer') estimatedSeconds = 80;
      else if (job.model_type === 'bve') estimatedSeconds = 70;
      else if (job.model_type === 'demucs') estimatedSeconds = 50;
      const elapsedSeconds = (now - startMs) / 1000;
      return Math.max(5, Math.min(79, Math.round((elapsedSeconds / estimatedSeconds) * 79) + 5));
    }

    return 0;
  };



  return (
    <div className="dashboard-grid">
      {/* Upload Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="glass-panel">
          <h2 className="jobs-section-title">
            <Music size={20} />
            Separate New Audio
          </h2>
          
          {!uploadedFile ? (
            <>
              {/* Tabs for Upload or YouTube */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.25rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('upload');
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'upload' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    color: activeTab === 'upload' ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                  }}
                >
                  <Music size={16} />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('youtube');
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'youtube' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    color: activeTab === 'youtube' ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                  }}
                >
                  <Youtube size={16} style={{ color: activeTab === 'youtube' ? '#ff0000' : 'var(--text-muted)' }} />
                  YouTube URL
                </button>
              </div>

              {activeTab === 'upload' ? (
                <UploadZone 
                  onUploadSuccess={handleUploadSuccess} 
                  onClear={() => setUploadedFile(null)} 
                />
              ) : (
                <div className="youtube-import-zone" style={{
                  border: '2px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-md)',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    width: '4.5rem',
                    height: '4.5rem',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto'
                  }}>
                    <Youtube size={36} style={{ color: '#ff0000' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Import from YouTube</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Downloads & converts video audio to high-quality 320 kbps MP3
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', width: '100%' }}>
                    <input
                      type="text"
                      placeholder="Paste YouTube Video URL..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      disabled={isImporting}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        outline: 'none',
                        minWidth: 0,
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleYoutubeImport}
                      disabled={isImporting || !youtubeUrl.trim()}
                      style={{ padding: '0.75rem 1.25rem' }}
                    >
                      {isImporting ? (
                        <Loader2 className="spinning" size={16} />
                      ) : (
                        'Import'
                      )}
                    </button>
                  </div>
                  
                  {isImporting && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--secondary-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
                      <Loader2 className="spinning" size={12} />
                      Downloading and converting audio... This may take a minute.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="selected-file-card" style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <div style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '8px',
                  background: uploadedFile.source === 'youtube' ? 'rgba(255, 0, 0, 0.1)' : 'rgba(138, 43, 226, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {uploadedFile.source === 'youtube' ? (
                    <Youtube size={20} style={{ color: '#ff0000' }} />
                  ) : (
                    <Music size={20} style={{ color: 'var(--primary-accent)' }} />
                  )}
                </div>
                <div style={{ minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={uploadedFile.name}>
                    {uploadedFile.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--secondary-accent)', marginTop: '0.15rem' }}>
                    {uploadedFile.source === 'youtube' ? 'YouTube Imported' : 'File Uploaded'}
                    {uploadedFile.size ? ` • ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadedFile(null);
                  setYoutubeUrl('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.35rem',
                  borderRadius: '6px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 67, 54, 0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Remove selection"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              
              {/* Dropdown 1: Model Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Separation Model:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="dropdown-select"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="pro_ensemble">🏆 Pro Ensemble — 3-Model Fusion (BS-RoFormer + MelBand + MDX23C)</option>
                  <option value="ensemble">✨ SOTA Hybrid Ensemble (BS-Roformer + MDX-Net)</option>
                  <option value="bs_roformer">🚀 UVR BS-Roformer (Viperx-1297) - SOTA Vocals</option>
                  <option value="melband_roformer">🎵 Mel-Band Roformer (Kim Big Beta 4) - Natural Vocals</option>
                  <option value="mdx23c">💿 MDX23C InstVoc HQ (UVR MDXC) - Punchy Backing Tracks</option>
                  <option value="mdx">🎹 UVR MDX-Net Inst HQ 3 - Pure Instrumental</option>
                  <option value="male_female">👫 SOTA Male/Female Vocal Splitter (2-Stage)</option>
                  <option value="bve">🎙️ Backing Vocals Extraction (Mel-Band Roformer Karaoke) - 3 Stems</option>
                  <option value="medleyvox">👥 Multi-Singer Separation (MedleyVox) - 3 Stems</option>
                  <option value="demucs">🔊 Meta Demucs v4 (Hybrid Transformer) - 2 or 4 Stems</option>
                </select>
              </div>

              {/* Dropdown 2: Stems Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Stems to Separate:</span>
                  {(selectedModel === 'bve' || selectedModel === 'medleyvox') && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      Extracts 3 stems ({selectedModel === 'medleyvox' ? 'Vocalist 1, Vocalist 2, Instrumental' : 'Lead, Backing, Instrumental'})
                    </span>
                  )}
                  {selectedModel === 'male_female' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      Splits duets into Male, Female, and Inst stems
                    </span>
                  )}
                  {selectedModel === 'pro_ensemble' && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      3-model confidence fusion + freq-band blend + phase align
                    </span>
                  )}
                  {['ensemble', 'bs_roformer', 'melband_roformer', 'mdx23c', 'mdx'].includes(selectedModel) && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      Supports 2 stems (Vocals & Inst)
                    </span>
                  )}
                </label>
                <select
                  value={selectedStems}
                  onChange={(e) => setSelectedStems(Number(e.target.value))}
                  disabled={selectedModel !== 'demucs'}
                  className="dropdown-select"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: (selectedModel !== 'demucs') ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: (selectedModel !== 'demucs') ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: (selectedModel !== 'demucs') ? 'not-allowed' : 'pointer',
                  }}
                >
                  {selectedModel === 'bve' || selectedModel === 'male_female' || selectedModel === 'medleyvox' ? (
                    <option value={3}>3 Stems (Lead/Backing/Inst or Vocalist 1/Vocalist 2/Inst)</option>
                  ) : (
                    <>
                      <option value={2}>2 Stems (Vocals & Instrumental)</option>
                      {selectedModel === 'demucs' && <option value={4}>4 Stems (Vocals, Drums, Bass, Other)</option>}
                    </>
                  )}
                </select>
              </div>

              {/* Toggle: Studio Vocal Cleanup */}
              {['pro_ensemble', 'ensemble', 'bs_roformer', 'melband_roformer', 'mdx23c', 'mdx', 'male_female', 'demucs'].includes(selectedModel) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      Studio Vocal Cleanup
                    </label>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Removes room echo & reverb using SOTA De-Reverb
                    </span>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                    <input
                      type="checkbox"
                      checked={vocalCleanup}
                      onChange={(e) => setVocalCleanup(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span className="slider round" style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: vocalCleanup ? 'var(--primary-accent)' : 'rgba(255,255,255,0.1)',
                      transition: '0.3s',
                      borderRadius: '34px',
                      boxShadow: vocalCleanup ? '0 0 8px var(--primary-accent)' : 'none'
                    }}>
                      <span style={{
                        position: 'absolute',
                        height: '14px', width: '14px',
                        left: vocalCleanup ? '22px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '0.3s',
                        borderRadius: '50%'
                      }} />
                    </span>
                  </label>
                </div>
              )}

              {/* Toggle: Instrumental Noise Reduction */}
              {['pro_ensemble', 'ensemble', 'bs_roformer', 'melband_roformer', 'mdx23c', 'mdx', 'male_female', 'demucs', 'bve', 'medleyvox'].includes(selectedModel) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.25rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      Instrumental Vocal Suppress
                    </label>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Wiener filter to suppress vocal bleeding in instrumental
                    </span>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                    <input
                      type="checkbox"
                      checked={instrumentalCleanup}
                      onChange={(e) => setInstrumentalCleanup(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span className="slider round" style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: instrumentalCleanup ? '#00bfff' : 'rgba(255,255,255,0.1)',
                      transition: '0.3s',
                      borderRadius: '34px',
                      boxShadow: instrumentalCleanup ? '0 0 8px #00bfff' : 'none'
                    }}>
                      <span style={{
                        position: 'absolute',
                        height: '14px', width: '14px',
                        left: instrumentalCleanup ? '22px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '0.3s',
                        borderRadius: '50%'
                      }} />
                    </span>
                  </label>
                </div>
              )}

              {/* Educational Model Info Card */}
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(138, 43, 226, 0.03)', border: '1px solid rgba(138, 43, 226, 0.1)', borderRadius: '6px', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                <strong>Model Guide:</strong>{' '}
                {selectedModel === 'ensemble' && 'Blends the best spectrogram transformer (BS-Roformer) and convolutional (MDX-Net) outputs to cancel artifacts and give pristine high-end clarity.'}
                {selectedModel === 'bs_roformer' && 'Uses a Band-Split RoPE Transformer. The absolute highest ranking model on the SOTA leaderboard for separating lead vocalist from dense backing tracks.'}
                {selectedModel === 'melband_roformer' && 'Uses Mel-frequency band splitting to capture warm, organic vocal dynamics without phase cancelation artifacts.'}
                {selectedModel === 'mdx23c' && 'Advanced multi-layer gated networks optimized for separating full-bodied, high-fidelity backing tracks.'}
                {selectedModel === 'mdx' && 'High-performance standard for creating karaoke instrumentals with minimum vocal bleeding.'}
                {selectedModel === 'male_female' && 'Splits mixed duets or vocal groups into individual Male and Female tracks in a 2-stage pipeline.'}
                {selectedModel === 'bve' && 'Splits vocals into main lead tracks and separate choruses or background harmonies.'}
                {selectedModel === 'demucs' && 'Meta’s neural network. Best when you need drums, bass, vocals, and synth/guitar separated into 4 distinct tracks.'}
              </div>

          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', opacity: !uploadedFile ? 0.5 : 1 }}
              onClick={triggerSeparation}
              disabled={isSeparating || !uploadedFile}
              title={!uploadedFile ? 'Upload an audio file first' : ''}
            >
              {isSeparating ? (
                <>
                  <Loader2 className="spinning" size={16} />
                  Queuing Separation Job...
                </>
              ) : (
                <>
                  <Play size={16} fill="#fff" />
                  {uploadedFile ? 'Separate Audio (Deducts ₹5.00 INR)' : '⬆ Upload a file above to separate'}
                </>
              )}
            </button>
          </div>

          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem',
                background: 'rgba(244, 67, 54, 0.05)',
                border: '1px solid rgba(244, 67, 54, 0.1)',
                borderRadius: '8px',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* History / Active Jobs Column */}
      <div className="glass-panel" style={{ height: 'fit-content', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
        <h2 className="jobs-section-title">
          <FileText size={20} />
          Your Jobs
        </h2>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {jobs.length === 0 ? (
            <div className="empty-state">
              <Music className="empty-icon" />
              <p style={{ fontWeight: 500 }}>No audio files separated yet</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Upload an MP3 on the left to start.
              </p>
            </div>
          ) : (
            <div className="jobs-list">
              {jobs.map((job) => {
                const isProcessing = job.status === 'PROCESSING';
                const isQueued = job.status === 'QUEUED';
                const isCompleted = job.status === 'COMPLETED';
                const isFailed = job.status === 'FAILED';
                const progressPct = calcProgress(job);
                const isExpanded = expandedJobs.has(job.job_id);

                // Train stations — plain English, no tech jargon
                const stations = [
                  { label: 'Received',   icon: '📥', pct: 0  },
                  { label: 'Getting Ready', icon: '⚙️', pct: 10 },
                  { label: 'AI Working',  icon: '🤖', pct: 35 },
                  { label: 'Almost Done', icon: '🎵', pct: 70 },
                  { label: 'Finished!',   icon: '✅', pct: 100 },
                ];

                // Which station is the "train" currently at
                const currentStation = isFailed ? -1 : isCompleted ? 4 :
                  stations.reduce((acc, s, i) => progressPct >= s.pct ? i : acc, 0);

                // Friendly one-liner shown collapsed
                const statusLine = isFailed ? '❌ Something went wrong'
                  : isCompleted ? '✅ Ready to download!'
                  : isQueued ? '⏳ Waiting to start...'
                  : progressPct < 35 ? '⚙️ Getting the AI ready...'
                  : progressPct < 70 ? '🤖 AI is separating your audio...'
                  : '🎵 Almost there, finishing up...';

                return (
                  <div
                    key={job.job_id}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px',
                      marginBottom: '0.65rem',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s ease',
                    }}
                  >
                    {/* ── Collapsed header row ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}>
                      {/* Status dot */}
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: isCompleted ? '#4caf50' : isFailed ? '#f44336' : 'var(--primary-accent)',
                        boxShadow: (!isCompleted && !isFailed) ? '0 0 6px var(--primary-accent)' : 'none',
                        animation: (isProcessing || isQueued) ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      }} />

                      {/* File name + status line */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.filename}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {statusLine}
                        </div>
                      </div>

                      {/* Right side: pct OR results button */}
                      {(isProcessing || isQueued) && (
                        <span style={{
                          fontSize: '1rem', fontWeight: 700, flexShrink: 0,
                          background: 'linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))',
                          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                          {progressPct}%
                        </span>
                      )}
                      {isCompleted && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); onViewJob(job.job_id); }}
                        >
                          Open <ChevronRight size={13} />
                        </button>
                      )}
                      {(job.status === 'COMPLETED' || isFailed) && (
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0.2rem', display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: '0.25rem' }}
                          onClick={(e) => handleDeleteJob(job.job_id, e)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      {/* Expand toggle */}
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedJobs(prev => {
                            const next = new Set(prev);
                            if (next.has(job.job_id)) next.delete(job.job_id);
                            else next.add(job.job_id);
                            return next;
                          });
                        }}
                        title={isExpanded ? 'Collapse' : 'See progress'}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    {/* ── Slim progress bar always visible when active ── */}
                    {(isProcessing || isQueued) && (
                      <div style={{ height: '3px', background: 'rgba(255,255,255,0.04)', margin: '0 1rem' }}>
                        <div style={{
                          height: '100%', width: `${progressPct}%`,
                          background: 'linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))',
                          borderRadius: '2px', transition: 'width 0.8s ease-out',
                          boxShadow: '0 0 6px rgba(138,43,226,0.5)',
                        }} />
                      </div>
                    )}

                    {/* ── Expanded: train journey ── */}
                    {isExpanded && (
                      <div style={{ padding: '1rem 1rem 1.1rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        {/* Track row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative' }}>
                          {stations.map((station, idx) => {
                            const reached = isFailed ? false : isCompleted ? true : progressPct >= station.pct;
                            const isTrainHere = !isFailed && !isCompleted && idx === currentStation;
                            const isLast = idx === stations.length - 1;
                            return (
                              <React.Fragment key={idx}>
                                {/* Station */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: isLast ? '0 0 auto' : 1, minWidth: 0 }}>
                                  {/* Circle */}
                                  <div style={{
                                    width: 34, height: 34, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1rem',
                                    background: reached || isCompleted
                                      ? 'linear-gradient(135deg, var(--primary-accent), var(--secondary-accent))'
                                      : 'rgba(255,255,255,0.05)',
                                    border: isTrainHere
                                      ? '2px solid var(--secondary-accent)'
                                      : '2px solid rgba(255,255,255,0.08)',
                                    boxShadow: isTrainHere ? '0 0 12px rgba(0,242,254,0.5)' : 'none',
                                    transition: 'all 0.4s ease',
                                    animation: isTrainHere ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                    flexShrink: 0,
                                    zIndex: 1,
                                  }}>
                                    {station.icon}
                                  </div>
                                  {/* Label */}
                                  <div style={{ fontSize: '0.62rem', color: reached || isCompleted ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '0.4rem', textAlign: 'center', fontWeight: isTrainHere ? 700 : 400, lineHeight: 1.2 }}>
                                    {station.label}
                                  </div>
                                </div>
                                {/* Connector line between stations */}
                                {!isLast && (
                                  <div style={{ flex: 1, height: '3px', marginTop: '15px', background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{
                                      position: 'absolute', top: 0, left: 0, height: '100%',
                                      width: progressPct >= stations[idx + 1].pct ? '100%' : progressPct >= station.pct ? `${Math.round(((progressPct - station.pct) / (stations[idx + 1].pct - station.pct)) * 100)}%` : '0%',
                                      background: 'linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))',
                                      transition: 'width 0.8s ease-out',
                                    }} />
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {jobToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '400px',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '0.75rem',
              borderRadius: '50%',
              background: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.2)',
              color: 'var(--danger)',
              marginBottom: '1rem'
            }}>
              <AlertCircle size={32} />
            </div>
            
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Delete Job?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.75rem', lineHeight: '1.4' }}>
              Are you sure you want to delete this job and all its separated audio files? This action cannot be undone.
            </p>
            
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setJobToDelete(null)}
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmDeleteJob}
                style={{
                  padding: '0.6rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  background: 'rgba(244, 67, 54, 0.2)',
                  borderColor: 'rgba(244, 67, 54, 0.4)',
                  color: 'var(--danger)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(244, 67, 54, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
