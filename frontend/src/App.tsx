import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ResultPage } from './components/ResultPage';
import { LoginPage } from './components/LoginPage';
import { TopUpModal } from './components/TopUpModal';
import { Music2, LogOut, Wallet, Plus } from 'lucide-react';

type ViewMode = 'dashboard' | 'result';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  
  // Session authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [user, setUser] = useState<{ name: string; email: string; avatarUrl?: string } | null>(() => {
    const saved = localStorage.getItem('userProfile');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Credits in INR state (defaults to ₹50.00 free credits for initial testing)
  const [credits, setCredits] = useState<number>(() => {
    const saved = localStorage.getItem('userCredits');
    return saved ? parseFloat(saved) : 50.00;
  });

  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('userCredits', credits.toFixed(2));
  }, [credits]);

  const handleLoginSuccess = (profile: { name: string; email: string; avatarUrl?: string }) => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userProfile', JSON.stringify(profile));
    setUser(profile);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userProfile');
    setUser(null);
    setIsLoggedIn(false);
  };

  const handleAddCredits = (amount: number) => {
    setCredits((prev) => prev + amount);
  };

  const handleDeductCredits = (amount: number) => {
    setCredits((prev) => Math.max(0, prev - amount));
  };

  const handleViewJob = (jobId: string) => {
    setActiveJobId(jobId);
    setViewMode('result');
  };

  const handleBackToDashboard = () => {
    setViewMode('dashboard');
    setActiveJobId(null);
  };

  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="logo-container">
          <Music2 className="logo-icon" />
          <div>
            <h1 className="app-title" style={{ margin: 0 }}>AI Audio Separator</h1>
            <p className="app-subtitle" style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>
              Separate vocals and instrumentals using Meta's Demucs & Modal GPU functions
            </p>
          </div>
        </div>

        {isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Google User Profile Avatar */}
            {user && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '0.35rem 0.85rem 0.35rem 0.5rem',
                borderRadius: '50px',
                marginRight: '0.25rem'
              }}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(138, 43, 226, 0.4)' }} />
                ) : (
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary-accent), var(--secondary-accent))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#fff',
                    border: '1px solid rgba(138, 43, 226, 0.4)'
                  }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.15 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>{user.name}</span>
                  <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{user.email}</span>
                </div>
              </div>
            )}

            {/* Credits Display Pill */}
            <div 
              onClick={() => setIsTopUpOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(138, 43, 226, 0.1)',
                border: '1px solid rgba(138, 43, 226, 0.25)',
                padding: '0.5rem 0.85rem',
                borderRadius: '50px',
                fontSize: '0.875rem',
                fontWeight: 700,
                color: 'var(--primary-accent)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(138, 43, 226, 0.15)';
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(138, 43, 226, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Wallet size={16} />
              <span>₹{credits.toFixed(2)} INR</span>
              <span style={{
                background: 'var(--primary-accent)',
                color: '#fff',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 'bold',
              }}>
                <Plus size={10} />
              </span>
            </div>

            {/* Logout Button */}
            <button 
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '50px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main View Router */}
      <main style={{ flex: 1 }}>
        {!isLoggedIn ? (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        ) : viewMode === 'dashboard' ? (
          <Dashboard 
            onViewJob={handleViewJob} 
            credits={credits}
            onDeductCredits={() => handleDeductCredits(5.00)}
            onOpenTopUp={() => setIsTopUpOpen(true)}
          />
        ) : (
          activeJobId && (
            <ResultPage jobId={activeJobId} onBack={handleBackToDashboard} />
          )
        )}
      </main>

      <TopUpModal 
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        onAddCredits={handleAddCredits}
      />

      {/* Footer */}
      <footer style={{ marginTop: '4rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p>Powered by Meta Demucs, Modal Serverless GPU, and FastAPI.</p>
      </footer>
    </div>
  );
}

export default App;
