import React, { useState } from 'react';
import { Lock, User, Music2, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (profile: { name: string; email: string; avatarUrl?: string }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Google Login simulation states
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [customEmailMode, setCustomEmailMode] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const hasGoogleClientId = !!googleClientId;

  React.useEffect(() => {
    if (!hasGoogleClientId) return;

    const handleCredentialResponse = async (response: any) => {
      const idToken = response.credential;
      setGoogleLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: idToken }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Google sign-in token verification failed.');
        }

        const profile = await res.json();
        onLoginSuccess({
          name: profile.name,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate Google account on server.');
      } finally {
        setGoogleLoading(false);
      }
    };

    const loadGsiScript = () => {
      if (document.getElementById('google-gsi-script')) {
        initializeGoogleSignIn();
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initializeGoogleSignIn();
      };
      script.onerror = () => {
        setError('Failed to load Google Sign-In SDK. Check your internet connection.');
      };
      document.head.appendChild(script);
    };

    const initializeGoogleSignIn = () => {
      const googleObj = (window as any).google;
      if (!googleObj?.accounts?.id) {
        console.error('Google Accounts GSI library not loaded.');
        return;
      }

      googleObj.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: false,
      });

      const btnContainer = document.getElementById('google-signin-button-container');
      if (btnContainer) {
        googleObj.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'large',
          width: btnContainer.clientWidth || 340,
          text: 'signin_with',
          shape: 'rectangular',
        });
      }
    };

    loadGsiScript();

  }, [hasGoogleClientId, googleClientId, onLoginSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      if (username === 'user' && password === 'user') {
        onLoginSuccess({
          name: 'Demo User',
          email: 'user@demo.com'
        });
      } else {
        setError('Invalid username or password. (Hint: user/user)');
        setLoading(false);
      }
    }, 800);
  };

  const handleGoogleSelect = (profile: { name: string; email: string; avatarUrl?: string }) => {
    setGoogleLoading(true);
    setTimeout(() => {
      setGoogleLoading(false);
      setShowGoogleModal(false);
      onLoginSuccess(profile);
    }, 1200);
  };

  const handleCustomGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customName) return;

    // Use initial letter as avatar if none is present
    handleGoogleSelect({
      name: customName,
      email: customEmail
    });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '1rem',
      position: 'relative'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2.5rem',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(138, 43, 226, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        textAlign: 'center',
      }}>
        {/* Header Icon */}
        <div style={{
          display: 'inline-flex',
          padding: '1rem',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(0, 242, 254, 0.2))',
          border: '1px solid rgba(138, 43, 226, 0.3)',
          marginBottom: '1.5rem',
        }}>
          <Music2 size={36} style={{ color: 'var(--primary-accent)' }} />
        </div>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 800,
          marginBottom: '0.5rem',
          background: 'linear-gradient(90deg, #fff, var(--text-muted))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Welcome Back
        </h2>
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          marginBottom: '2rem',
        }}>
          Sign in to access premium GPU audio separation
        </p>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 0, 0, 0.08)',
            border: '1px solid rgba(255, 0, 0, 0.2)',
            padding: '0.75rem',
            borderRadius: '6px',
            color: 'var(--danger)',
            fontSize: '0.825rem',
            textAlign: 'left',
            marginBottom: '1.5rem',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Username Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Enter 'user'"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.25rem',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="Enter 'user'"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.25rem',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.95rem',
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Separator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          margin: '1.5rem 0',
          color: 'var(--text-muted)',
          fontSize: '0.8rem'
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
          <span style={{ padding: '0 0.75rem' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }}></div>
        </div>

        {/* Google Sign-in Button Container */}
        {hasGoogleClientId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
            <div id="google-signin-button-container" style={{ width: '100%', minHeight: '44px', display: 'flex', justifyContent: 'center' }}></div>
            {googleLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-accent)', fontSize: '0.85rem' }}>
                <span className="spinning" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }}></span>
                <span>Authenticating secure Google token...</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setShowGoogleModal(true);
                setCustomEmailMode(false);
              }}
              style={{
                width: '100%',
                padding: '0.8rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {/* Google Logo SVG */}
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', background: 'var(--primary-accent)', borderRadius: '50%' }}></span>
              <span>Demo Mode active. Add VITE_GOOGLE_CLIENT_ID to .env for real login.</span>
            </div>
          </div>
        )}
      </div>

      {/* Google Account Selector Modal */}
      {showGoogleModal && (
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
            maxWidth: '440px',
            padding: '2.5rem',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            position: 'relative'
          }}>
            {/* Google Identity Logo */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '0.2rem' }}>
              <svg width="74" height="24" viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.25 18.25C4.14 18.25 0 14.15 0 9.125C0 4.1 4.14 0 9.25 0C12.04 0 14.02 1.1 15.53 2.53L13.77 4.29C12.7 3.28 11.26 2.5 9.25 2.5C5.58 2.5 2.71 5.47 2.71 9.125C2.71 12.78 5.58 15.75 9.25 15.75C11.64 15.75 13 14.8 13.87 13.93C14.58 13.22 15.04 12.19 15.22 10.78H9.25V8.34H17.65C17.74 8.78 17.79 9.3 17.79 9.87C17.79 11.75 17.28 14.07 15.63 15.72C14.02 17.38 11.97 18.25 9.25 18.25Z" fill="#fff"/>
                <path d="M28.45 12.5C28.45 15.86 25.92 18.25 22.75 18.25C19.58 18.25 17.05 15.86 17.05 12.5C17.05 9.14 19.58 6.75 22.75 6.75C25.92 6.75 28.45 9.14 28.45 12.5ZM25.79 12.5C25.79 10.42 24.3 8.99 22.75 8.99C21.2 8.99 19.71 10.42 19.71 12.5C19.71 14.55 21.2 16.01 22.75 16.01C24.3 16.01 25.79 14.55 25.79 12.5Z" fill="#fff"/>
                <path d="M40.95 12.5C40.95 15.86 38.42 18.25 35.25 18.25C32.08 18.25 29.55 15.86 29.55 12.5C29.55 9.14 32.08 6.75 35.25 6.75C38.42 6.75 40.95 9.14 40.95 12.5ZM38.29 12.5C38.29 10.42 36.8 8.99 35.25 8.99C33.7 8.99 32.21 10.42 32.21 12.5C32.21 14.55 33.7 16.01 35.25 16.01C36.8 16.01 38.29 14.55 38.29 12.5Z" fill="#fff"/>
                <path d="M52.95 7.15V17.38C52.95 21.6 50.46 23.33 47.16 23.33C44.13 23.33 42.31 21.3 41.62 19.72L43.94 18.75C44.35 19.75 45.39 20.93 47.16 20.93C49.27 20.93 50.58 19.62 50.58 17.17V16.36H50.49C49.85 17.15 48.51 17.84 46.99 17.84C43.83 17.84 41.25 15.08 41.25 11.75C41.25 8.39 43.83 5.66 46.99 5.66C48.51 5.66 49.85 6.33 50.49 7.1H50.58V7.15H52.95ZM50.85 11.75C50.85 9.7 49.27 8.19 47.43 8.19C45.59 8.19 44.01 9.7 44.01 11.75C44.01 13.77 45.59 15.31 47.43 15.31C49.27 15.31 50.85 13.77 50.85 11.75Z" fill="#fff"/>
                <path d="M56.85 1V17.84H54.19V1H56.85Z" fill="#fff"/>
                <path d="M68.45 13.88L70.5 15.25C69.84 16.23 68.16 18.25 65.05 18.25C61.2 18.25 58.75 15.3 58.75 12.5C58.75 9.49 61.28 6.75 64.71 6.75C68.13 6.75 69.83 9.4 70.38 10.74L70.64 11.39L61.76 15.06C62.44 16.4 63.49 17.1 65.05 17.1C66.61 17.1 67.63 16.32 68.45 13.88ZM61.35 12.35L67.62 9.75C67.28 8.94 66.32 8.36 64.89 8.36C63.02 8.37 61.27 10.02 61.35 12.35Z" fill="#fff"/>
              </svg>
            </div>

            {googleLoading ? (
              <div style={{ padding: '3rem 0' }}>
                {/* 4-Color Google Spinner */}
                <div className="google-spinner" style={{
                  width: '50px',
                  height: '50px',
                  border: '4px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  borderTopColor: '#4285F4',
                  borderRightColor: '#34A853',
                  borderBottomColor: '#FBBC05',
                  borderLeftColor: '#EA4335',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 1.5rem auto'
                }}></div>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Signing you in</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Connecting securely to Google Accounts...</p>
              </div>
            ) : !customEmailMode ? (
              <>
                <h3 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Choose an account
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                  to continue to <strong style={{ color: 'var(--primary-accent)' }}>AI Audio Separator</strong>
                </p>

                {/* Account List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {/* Account 1 */}
                  <div
                    onClick={() => handleGoogleSelect({
                      name: 'Alex Mercer',
                      email: 'alex.mercer@gmail.com',
                      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'
                    })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    className="google-account-row"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80"
                      alt="Alex Mercer"
                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>Alex Mercer</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>alex.mercer@gmail.com</div>
                    </div>
                  </div>

                  {/* Account 2 */}
                  <div
                    onClick={() => handleGoogleSelect({
                      name: 'Sarah Jenkins',
                      email: 'sarah.jenkins@gmail.com',
                      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80'
                    })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    className="google-account-row"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80"
                      alt="Sarah Jenkins"
                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>Sarah Jenkins</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>sarah.jenkins@gmail.com</div>
                    </div>
                  </div>

                  {/* Add Account Option */}
                  <div
                    onClick={() => setCustomEmailMode(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    className="google-account-row"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)'
                    }}>
                      <User size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>Use another account</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sign in with a different Google account</div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              // Custom Gmail account input form
              <form onSubmit={handleCustomGoogleSubmit} style={{ textAlign: 'left' }}>
                <h3 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>
                  Sign in
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem', textAlign: 'center' }}>
                  with your Google Account
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                  {/* Custom Name */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Custom Email */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Email address
                    </label>
                    <input
                      type="email"
                      placeholder="name@gmail.com"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setCustomEmailMode(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--primary-accent)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      padding: '0.6rem 1.5rem',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.9rem'
                    }}
                  >
                    Next
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
