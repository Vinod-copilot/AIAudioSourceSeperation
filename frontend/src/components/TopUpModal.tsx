import React, { useState } from 'react';
import { X, CreditCard, ShieldCheck, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCredits: (amount: number) => void;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({ isOpen, onClose, onAddCredits }) => {
  const [selectedPlan, setSelectedPlan] = useState<{ amount: number; tracks: number } | null>(null);
  const [paymentStep, setPaymentStep] = useState<'plan' | 'paying' | 'success'>('plan');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  if (!isOpen) return null;

  const plans = [
    { amount: 100, tracks: 20, badge: 'Popular', desc: 'Starter package for hobbyists' },
    { amount: 250, tracks: 55, badge: 'Value', desc: 'Great for independent creators' },
    { amount: 500, tracks: 120, badge: 'Studio Pro', desc: 'For studio engineers & DJs' },
  ];

  const handleStartPayment = (plan: { amount: number; tracks: number }) => {
    setSelectedPlan(plan);
    setPaymentStep('paying');

    // Simulate payment processing
    setTimeout(() => {
      onAddCredits(plan.amount);
      setPaymentStep('success');
    }, 2500);
  };

  const handleClose = () => {
    setSelectedPlan(null);
    setPaymentStep('plan');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '500px',
        borderRadius: '16px',
        padding: '2rem',
        position: 'relative',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '1.25rem', right: '1.25rem',
            background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={20} />
        </button>

        {paymentStep === 'plan' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={20} style={{ color: 'var(--primary-accent)' }} />
              Top Up Separation Credits
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Each separation job costs ₹5.00 INR (estimated GPU runtime costs). Choose a package below to add balance:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {plans.map((plan) => (
                <div
                  key={plan.amount}
                  onClick={() => handleStartPayment(plan)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1.25rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 43, 226, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(138, 43, 226, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>₹{plan.amount} INR</span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(138, 43, 226, 0.2)', color: 'var(--primary-accent)', borderRadius: '4px', fontWeight: 600 }}>
                        {plan.badge}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{plan.desc}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 700, color: 'var(--secondary-accent)' }}>
                      ~{plan.tracks} Stems
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      ₹{Math.floor(plan.amount / plan.tracks * 100) / 100} / track
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <ShieldCheck size={14} style={{ color: 'var(--secondary-accent)' }} />
              <span>Payments secured by 256-bit encryption framework. Real payment integration pending.</span>
            </div>
          </div>
        )}

        {paymentStep === 'paying' && selectedPlan && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <Loader2 className="spinning" size={48} style={{ color: 'var(--primary-accent)', margin: '0 auto 1.5rem' }} />
            <h4 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Processing Payment</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Authorizing transaction of <strong>₹{selectedPlan.amount}.00 INR</strong> via mock credit card gateway...
            </p>
            <div style={{ maxWidth: '280px', margin: '0 auto', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={14} />
              <span>Simulated Visa Gateway Processing</span>
            </div>
          </div>
        )}

        {paymentStep === 'success' && selectedPlan && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <CheckCircle2 size={56} style={{ color: 'hsl(142, 70%, 45%)', margin: '0 auto 1.5rem' }} />
            <h4 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: '#fff' }}>Payment Successful!</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Added <strong>₹{selectedPlan.amount}.00 INR</strong> successfully. You have unlocked approximately{' '}
              <strong>{selectedPlan.tracks}</strong> premium GPU track splits.
            </p>
            <button
              onClick={handleClose}
              className="btn btn-primary"
              style={{ padding: '0.75rem 2rem', fontWeight: 700 }}
            >
              Continue Mixing
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
