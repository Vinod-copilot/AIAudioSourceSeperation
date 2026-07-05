import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Download, Disc, Sliders, Music, Zap, Loader2, Check, AlertCircle } from 'lucide-react';
import { apiClient } from '../services/api';

const GoogleDriveIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M7.71 3.5H16.29L22 13.5H13.42L7.71 3.5Z" fill="#FFD04B" />
    <path d="M13.42 13.5H22L16.29 23.5H7.71L13.42 13.5Z" fill="#0066DA" />
    <path d="M7.71 3.5L2 13.5L7.71 23.5L13.42 13.5L7.71 3.5Z" fill="#00A85D" />
  </svg>
);

interface StemTrack {
  id: string;
  url: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}

interface MixerConsoleProps {
  stems: StemTrack[];
  originalUrl: string;
  title: string;
  jobId: string;
}

export const MixerConsole: React.FC<MixerConsoleProps> = ({ stems, originalUrl, title, jobId }) => {
  // Google Drive upload states per track id
  const [driveStatus, setDriveStatus] = useState<{ [key: string]: 'idle' | 'uploading' | 'success' | 'error' }>({});
  const [driveUrl, setDriveUrl] = useState<{ [key: string]: string }>({});
  const [driveError, setDriveError] = useState<string | null>(null);

  // Load Google Identity Services SDK if not present
  useEffect(() => {
    if ((window as any).google?.accounts?.oauth2) return;
    
    if (!document.getElementById('google-gsi-script')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleGoogleDriveUpload = async (trackId: string) => {
    // Reset track status
    setDriveStatus(prev => ({ ...prev, [trackId]: 'uploading' }));
    setDriveError(null);
    
    const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    
    // If client ID is missing, we are in Demo/Mock Mode
    if (!googleClientId) {
      console.log("[Demo Mode] Simulating Google Drive upload for track:", trackId);
      try {
        const res = await apiClient.uploadTrackToGoogleDrive(jobId, trackId, "mock-token");
        setDriveUrl(prev => ({ ...prev, [trackId]: res.view_url }));
        setDriveStatus(prev => ({ ...prev, [trackId]: 'success' }));
      } catch (err: any) {
        setDriveStatus(prev => ({ ...prev, [trackId]: 'error' }));
        setDriveError(err.message || 'Failed to upload to Google Drive.');
      }
      return;
    }
    
    // In Production Mode, trigger Google Identity OAuth2 token request
    try {
      const googleObj = (window as any).google;
      if (!googleObj?.accounts?.oauth2) {
        throw new Error('Google Identity Services SDK is not loaded. Please try again.');
      }
      
      const tokenClient = googleObj.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            setDriveStatus(prev => ({ ...prev, [trackId]: 'error' }));
            setDriveError(tokenResponse.error_description || 'Google authorization failed.');
            return;
          }
          
          if (!tokenResponse.access_token) {
            setDriveStatus(prev => ({ ...prev, [trackId]: 'error' }));
            setDriveError('No access token returned from Google.');
            return;
          }
          
          try {
            // Call backend to perform upload using the access token
            const res = await apiClient.uploadTrackToGoogleDrive(jobId, trackId, tokenResponse.access_token);
            setDriveUrl(prev => ({ ...prev, [trackId]: res.view_url }));
            setDriveStatus(prev => ({ ...prev, [trackId]: 'success' }));
          } catch (err: any) {
            setDriveStatus(prev => ({ ...prev, [trackId]: 'error' }));
            setDriveError(err.message || 'Failed to upload to Google Drive.');
          }
        },
      });
      
      tokenClient.requestAccessToken();
    } catch (err: any) {
      setDriveStatus(prev => ({ ...prev, [trackId]: 'error' }));
      setDriveError(err.message || 'Google OAuth initialization failed.');
    }
  };
  // Stems audio refs
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  // Original audio ref for bypass mode
  const originalRef = useRef<HTMLAudioElement | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  
  // Modes: 'stems' or 'original'
  const [mixMode, setMixMode] = useState<'stems' | 'original'>('stems');

  // Track Mix States (Volume, Mute, Solo)
  const [trackStates, setTrackStates] = useState<{
    [key: string]: { volume: number; isMuted: boolean; isSoloed: boolean };
  }>({});

  // Initialize track states
  useEffect(() => {
    const initialStates: typeof trackStates = {};
    stems.forEach((track) => {
      initialStates[track.id] = { volume: 0.8, isMuted: false, isSoloed: false };
    });
    setTrackStates(initialStates);
  }, [stems]);

  // Synchronize audio metadata
  useEffect(() => {
    // Reset play state when stems change
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackSpeed(1.0);
  }, [stems, originalUrl]);

  // Synchronize and monitor duration dynamically across all audio tracks
  useEffect(() => {
    const updateDuration = () => {
      let maxDuration = 0;
      if (originalRef.current && !isNaN(originalRef.current.duration) && originalRef.current.duration > 0) {
        maxDuration = originalRef.current.duration;
      }
      
      stems.forEach((track) => {
        const audio = audioRefs.current[track.id];
        if (audio && !isNaN(audio.duration) && audio.duration > maxDuration) {
          maxDuration = audio.duration;
        }
      });

      if (maxDuration > 0) {
        setDuration(maxDuration);
      }
    };

    // Check immediately if cached metadata is already present
    updateDuration();

    // Attach event listeners to all audio elements to monitor when duration is loaded or changed
    const elements: HTMLAudioElement[] = [];
    if (originalRef.current) {
      elements.push(originalRef.current);
    }
    stems.forEach((track) => {
      const audio = audioRefs.current[track.id];
      if (audio) {
        elements.push(audio);
      }
    });

    elements.forEach((el) => {
      el.addEventListener('durationchange', updateDuration);
      el.addEventListener('loadedmetadata', updateDuration);
      el.addEventListener('loadeddata', updateDuration);
    });

    return () => {
      elements.forEach((el) => {
        el.removeEventListener('durationchange', updateDuration);
        el.removeEventListener('loadedmetadata', updateDuration);
        el.removeEventListener('loadeddata', updateDuration);
      });
    };
  }, [stems, originalUrl]);

  // Check if at least one track is soloed
  const isAnyTrackSoloed = Object.values(trackStates).some((t) => t.isSoloed);

  // Update volume and mute states for all audio elements
  useEffect(() => {
    if (mixMode === 'original') {
      // Mute all stems, unmute original
      stems.forEach((track) => {
        const audio = audioRefs.current[track.id];
        if (audio) {
          audio.volume = 0;
          audio.muted = true;
        }
      });
      if (originalRef.current) {
        originalRef.current.volume = masterVolume;
        originalRef.current.muted = false;
      }
    } else {
      // Mute original, set stems based on individual settings and solo status
      if (originalRef.current) {
        originalRef.current.volume = 0;
        originalRef.current.muted = true;
      }
      
      stems.forEach((track) => {
        const audio = audioRefs.current[track.id];
        if (audio) {
          const state = trackStates[track.id];
          if (!state) return;

          let targetVolume = 0;
          let targetMuted = false;
          
          if (isAnyTrackSoloed) {
            // If soloed, play at current volume, otherwise mute
            targetVolume = state.isSoloed ? state.volume * masterVolume : 0;
            targetMuted = !state.isSoloed;
          } else {
            // Standard volume unless muted
            targetVolume = state.isMuted ? 0 : state.volume * masterVolume;
            targetMuted = state.isMuted;
          }
          
          audio.volume = targetVolume;
          audio.muted = targetMuted;
        }
      });
    }
  }, [stems, trackStates, masterVolume, mixMode, isAnyTrackSoloed]);

  // Apply playback speed to all elements
  useEffect(() => {
    stems.forEach((track) => {
      const audio = audioRefs.current[track.id];
      if (audio) audio.playbackRate = playbackSpeed;
    });
    if (originalRef.current) {
      originalRef.current.playbackRate = playbackSpeed;
    }
  }, [stems, playbackSpeed]);

  // Sync Timer loop (runs while playing to prevent audio drift)
  useEffect(() => {
    if (!isPlaying) return;

    const intervalId = setInterval(() => {
      let leaderTime = 0;
      let ended = false;
      
      // Determine the current playback time from active audio element
      if (mixMode === 'original') {
        if (originalRef.current) {
          leaderTime = originalRef.current.currentTime;
          setCurrentTime(leaderTime);
          ended = originalRef.current.ended;
        }
      } else {
        // Find the first valid HTMLAudioElement to act as the sync leader
        const firstId = stems[0]?.id;
        const leader = audioRefs.current[firstId];
        if (leader) {
          leaderTime = leader.currentTime;
          setCurrentTime(leaderTime);
          ended = leader.ended;
          
          // Ensure all other audio elements are locked to the leader
          stems.forEach((track) => {
            const follower = audioRefs.current[track.id];
            if (follower && follower !== leader) {
              const diff = Math.abs(follower.currentTime - leaderTime);
              // If out of sync by more than 150ms, force correction
              if (diff > 0.15) {
                follower.currentTime = leaderTime;
              }
            }
          });
        }
      }

      if (ended) {
        setIsPlaying(false);
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [isPlaying, stems, mixMode]);

  // Play / Pause toggler
  const handlePlayPause = () => {
    const playPromises: Promise<void>[] = [];
    
    if (isPlaying) {
      // Pause everything
      stems.forEach((track) => {
        const audio = audioRefs.current[track.id];
        if (audio) audio.pause();
      });
      if (originalRef.current) originalRef.current.pause();
      setIsPlaying(false);
    } else {
      // Play matching mode
      if (mixMode === 'original') {
        if (originalRef.current) {
          originalRef.current.currentTime = currentTime;
          const promise = originalRef.current.play();
          if (promise) playPromises.push(promise);
        }
      } else {
        stems.forEach((track) => {
          const audio = audioRefs.current[track.id];
          if (audio) {
            audio.currentTime = currentTime;
            const promise = audio.play();
            if (promise) playPromises.push(promise);
          }
        });
      }
      
      Promise.all(playPromises)
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Audio playback error:", err));
    }
  };

  // Handle timeline seek
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    
    stems.forEach((track) => {
      const audio = audioRefs.current[track.id];
      if (audio) audio.currentTime = targetTime;
    });
    if (originalRef.current) {
      originalRef.current.currentTime = targetTime;
    }
  };

  // Handle initial metadata load (to extract track length)
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    if (audio.duration && audio.duration > duration) {
      setDuration(audio.duration);
    }
  };

  const handleRestart = () => {
    stems.forEach((track) => {
      const audio = audioRefs.current[track.id];
      if (audio) audio.currentTime = 0;
    });
    if (originalRef.current) originalRef.current.currentTime = 0;
    setCurrentTime(0);
    
    if (!isPlaying) {
      handlePlayPause();
    }
  };

  const updateTrackMix = (trackId: string, updates: Partial<{ volume: number; isMuted: boolean; isSoloed: boolean }>) => {
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        ...updates,
      },
    }));
  };

  // Format seconds into MM:SS
  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem', background: 'var(--panel-bg)', borderRadius: 'var(--radius-lg)' }}>
      {/* Audio Element Declarations */}
      <audio
        ref={originalRef}
        src={originalUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        preload="auto"
      />
      {stems.map((track) => (
        <audio
          key={track.id}
          ref={(el) => (audioRefs.current[track.id] = el)}
          src={track.url}
          onLoadedMetadata={handleLoadedMetadata}
          preload="auto"
        />
      ))}

      {/* Mixer Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <span className="status-badge" style={{ background: 'var(--primary-glow)', color: '#fff', marginBottom: '0.5rem', border: 'none' }}>
            <Zap size={10} fill="#fff" /> Synchronized DJ Mixer
          </span>
          <h3 style={{ fontSize: '1.4rem' }}>{title}</h3>
        </div>

        {/* Bypass Mode Selector */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '0.25rem', borderRadius: '8px' }}>
          <button
            className={`btn`}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.8rem',
              borderRadius: '6px',
              background: mixMode === 'original' ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: mixMode === 'original' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: 'none',
            }}
            onClick={() => setMixMode('original')}
          >
            <Disc size={12} style={{ marginRight: '4px' }} /> Original Mix
          </button>
          <button
            className={`btn`}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.8rem',
              borderRadius: '6px',
              background: mixMode === 'stems' ? 'var(--primary-accent)' : 'transparent',
              color: mixMode === 'stems' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              boxShadow: 'none',
            }}
            onClick={() => setMixMode('stems')}
          >
            <Sliders size={12} style={{ marginRight: '4px' }} /> Separate Stems
          </button>
        </div>
      </div>

      {/* Master Controller Deck */}
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          
          {/* Global Play/Pause */}
          <button className="play-btn" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause fill="#fff" size={18} /> : <Play fill="#fff" size={18} style={{ marginLeft: '2px' }} />}
          </button>

          {/* Seeker / Timeline */}
          <div className="timeline-container" style={{ flex: 1 }}>
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className="seek-bar"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Master Volume */}
            <div className="volume-container" style={{ width: '120px' }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Master Volume">
                {masterVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="volume-bar"
              />
            </div>

            {/* Tempo Control (Speed fader) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '65px' }}>
                Speed: {playbackSpeed.toFixed(1)}x
              </span>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                style={{ width: '80px', height: '4px', cursor: 'pointer' }}
              />
            </div>

            {/* Global Restart */}
            <button
              onClick={handleRestart}
              className="btn btn-secondary"
              style={{ padding: '0.5rem', borderRadius: '6px' }}
              title="Restart"
            >
              <RotateCcw size={14} />
            </button>
          </div>

        </div>
      </div>

      {driveError && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          background: 'rgba(244, 67, 54, 0.08)',
          border: '1px solid rgba(244, 67, 54, 0.2)',
          borderRadius: '8px',
          color: 'var(--danger)',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} />
          <span>{driveError}</span>
        </div>
      )}

      {/* Multi-Track Channel Board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: mixMode === 'original' ? 0.4 : 1, transition: 'opacity 0.3s ease' }}>
        {stems.map((track) => {
          const state = trackStates[track.id] || { volume: 0.8, isMuted: false, isSoloed: false };
          
          // Determine active volume display
          const isAudible = isPlaying && !state.isMuted && (!isAnyTrackSoloed || state.isSoloed);

          return (
            <div
              key={track.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.25rem',
                padding: '1.25rem',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderLeft: `4px solid ${track.color}`,
                borderRadius: '8px',
                transition: 'all 0.3s ease',
              }}
            >
              {/* Channel Label & Icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '200px', minWidth: '150px' }}>
                <div style={{ color: track.color, display: 'flex', alignItems: 'center' }}>
                  {track.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{track.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Channel</div>
                </div>
              </div>

              {/* Dynamic Equalizer level meter */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '24px', width: '50px', justifyContent: 'center' }}>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '3px',
                      height: isAudible ? `${Math.floor(Math.random() * 20) + 4}px` : '4px',
                      backgroundColor: track.color,
                      borderRadius: '1px',
                      transition: isAudible ? 'height 0.15s ease' : 'height 0.3s ease',
                      animation: isAudible ? `bounceEqualizer 0.5s ease-in-out infinite alternate ${i * 0.1}s` : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Volume Controller fader */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '150px' }}>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onClick={() => updateTrackMix(track.id, { isMuted: !state.isMuted })}
                  title={state.isMuted ? "Unmute" : "Mute"}
                >
                  {state.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={mixMode === 'original'}
                  value={state.volume}
                  onChange={(e) => updateTrackMix(track.id, { volume: parseFloat(e.target.value), isMuted: false })}
                  style={{ flex: 1, height: '4px', cursor: mixMode === 'original' ? 'not-allowed' : 'pointer' }}
                />
              </div>

              {/* Mute (M) & Solo (S) buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn`}
                  style={{
                    width: '32px',
                    height: '32px',
                    padding: 0,
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: state.isMuted ? 'var(--danger)' : 'rgba(255,255,255,0.03)',
                    color: state.isMuted ? '#fff' : 'var(--text-muted)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: state.isMuted ? '0 0 10px rgba(244,67,54,0.4)' : 'none',
                    cursor: mixMode === 'original' ? 'not-allowed' : 'pointer',
                  }}
                  disabled={mixMode === 'original'}
                  onClick={() => updateTrackMix(track.id, { isMuted: !state.isMuted })}
                  title="Mute Channel"
                >
                  M
                </button>
                <button
                  className={`btn`}
                  style={{
                    width: '32px',
                    height: '32px',
                    padding: 0,
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: state.isSoloed ? 'var(--secondary-accent)' : 'rgba(255,255,255,0.03)',
                    color: state.isSoloed ? '#000' : 'var(--text-muted)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: state.isSoloed ? '0 0 10px rgba(0,242,254,0.4)' : 'none',
                    cursor: mixMode === 'original' ? 'not-allowed' : 'pointer',
                  }}
                  disabled={mixMode === 'original'}
                  onClick={() => updateTrackMix(track.id, { isSoloed: !state.isSoloed })}
                  title="Solo Channel"
                >
                  S
                </button>
              </div>

              {/* Actions: Google Drive & Download */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {driveStatus[track.id] === 'success' ? (
                  <a
                    href={driveUrl[track.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{
                      padding: '0.5rem',
                      borderRadius: '6px',
                      background: 'rgba(0, 168, 93, 0.15)',
                      border: '1px solid rgba(0, 168, 93, 0.3)',
                      color: '#00a85d',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                    title="View in Google Drive"
                  >
                    <Check size={14} />
                    <GoogleDriveIcon size={14} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGoogleDriveUpload(track.id)}
                    disabled={driveStatus[track.id] === 'uploading'}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.5rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '32px'
                    }}
                    title={driveStatus[track.id] === 'uploading' ? "Uploading to Google Drive..." : "Upload to Google Drive"}
                  >
                    {driveStatus[track.id] === 'uploading' ? (
                      <Loader2 className="spinning" size={14} />
                    ) : (
                      <GoogleDriveIcon size={14} />
                    )}
                  </button>
                )}

                <a
                  href={`${track.url}?download=true`}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem', borderRadius: '6px' }}
                  title={`Download ${track.label}`}
                  download
                >
                  <Download size={14} />
                </a>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};
