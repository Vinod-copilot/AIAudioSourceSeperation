import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Volume1, RotateCcw, AlertTriangle } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title, subtitle, icon }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize audio element settings
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Restart play state if source changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Audio playback error:", err);
        setError("Unable to play track. Audio format might be loading or blocked by browser.");
      });
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setError(null);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (vol > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const restartAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const handleAudioError = () => {
    setError("Audio load failed. File may be unavailable or corrupted.");
    setIsPlaying(false);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Select appropriate volume icon
  const renderVolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeX size={18} />;
    if (volume < 0.4) return <Volume1 size={18} />;
    return <Volume2 size={18} />;
  };

  return (
    <div className="audio-player-container">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onError={handleAudioError}
        preload="metadata"
      />

      <div className="player-header">
        <div className="player-title">
          {icon}
          <div>
            <div>{title}</div>
            {subtitle && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{subtitle}</div>}
          </div>
        </div>
        
        <button 
          onClick={restartAudio} 
          className="btn btn-secondary" 
          style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
          title="Restart audio"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--danger)', background: 'rgba(244, 67, 54, 0.05)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(244, 67, 54, 0.1)' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="player-controls-row">
        <button className="play-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause fill="#fff" size={18} /> : <Play fill="#fff" size={18} style={{ marginLeft: '2px' }} />}
        </button>

        <div className="timeline-container">
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

        <div className="volume-container">
          <button 
            onClick={toggleMute} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {renderVolumeIcon()}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="volume-bar"
          />
        </div>
      </div>
    </div>
  );
};
