import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Zap, 
  Cpu, 
  Activity, 
  ShieldCheck,
  Radio
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients & API Keys', icon: Users },
  { id: 'playground', label: 'Gateway Playground', icon: Zap, liveBadge: true },
  { id: 'redis', label: 'Redis Key Inspector', icon: Cpu },
  { id: 'logs', label: 'Live Traffic Logs', icon: Activity },
];

export default function Sidebar({ activeTab, setActiveTab, clientCount, blockedCount }) {
  return (
    <aside style={{
      width: '270px',
      background: 'rgba(8, 14, 22, 0.85)',
      backdropFilter: 'blur(24px)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '1.75rem 1.1rem',
      flexShrink: 0,
    }}>
      <div>
        <div style={{
          padding: '0.4rem 0.75rem',
          marginBottom: '1.25rem',
          fontSize: '0.725rem',
          fontWeight: 800,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Gateway Management
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: isActive ? '1px solid var(--border-glow)' : '1px solid transparent',
                  background: isActive 
                    ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.14) 0%, rgba(6, 182, 212, 0.06) 100%)' 
                    : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.875rem',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  textAlign: 'left',
                  boxShadow: isActive ? '0 4px 15px -2px rgba(16, 185, 129, 0.15)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Icon size={18} color={isActive ? 'var(--accent-primary)' : '#94a3b8'} />
                  <span>{item.label}</span>
                </div>

                {item.id === 'clients' && clientCount !== undefined && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    color: '#94a3b8',
                    fontWeight: 700,
                  }}>
                    {clientCount}
                  </span>
                )}

                {item.liveBadge && (
                  <span style={{
                    fontSize: '0.65rem',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '9999px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                  }}>
                    LIVE
                  </span>
                )}

                {item.id === 'overview' && blockedCount > 0 && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(244, 63, 94, 0.2)',
                    color: '#fb7185',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontWeight: 700,
                  }}>
                    {blockedCount} 429s
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Gateway Engine Info Footer */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(12, 18, 28, 0.8) 0%, rgba(16, 185, 129, 0.05) 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '14px',
        padding: '1.1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Radio size={16} color="var(--accent-primary)" />
          <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#f8fafc' }}>Active Protection</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.45 }}>
          Atomic Redis window rate limiter & reverse proxy proxying downstream microservices.
        </p>
      </div>
    </aside>
  );
}
