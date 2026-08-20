import React from 'react';
import { Layers, Database, Cpu, RefreshCw, Terminal } from 'lucide-react';

export default function Navbar({ health, onRefresh, loading, currentTheme, setTheme }) {
  const isDbUp = !health || health?.database?.connected;
  const isRedisUp = !health || health?.redis?.status === 'HEALTHY' || health?.redis?.status === 'UP';
  const redisLabel = health?.redis?.engine?.includes('Memory') ? 'In-Memory (6379)' : 'Docker (6379)';

  const themes = [
    { id: 'cyberpunk', label: 'Cyberpunk', icon: '⚡' },
    { id: 'aurora', label: 'Emerald Matrix', icon: '🌿' },
  ];

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.85rem 2rem',
      background: 'rgba(8, 10, 18, 0.9)',
      backdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      gap: '1.5rem',
    }}>
      {/* Brand & Stack Logo (Matching Browser Tab Icon) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flexShrink: 0 }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '11px',
          background: 'linear-gradient(135deg, #00d8ff 0%, #6366f1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px rgba(0, 216, 255, 0.35)',
          flexShrink: 0,
        }}>
          <Layers size={21} color="#ffffff" strokeWidth={2.4} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', whiteSpace: 'nowrap' }}>
            NexusGateway
          </span>
          <span style={{
            fontSize: '0.675rem',
            fontWeight: 800,
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--accent-primary)',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            border: '1px solid var(--border-glow)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}>
            v1.0
          </span>
        </div>
      </div>

      {/* Right Side: Single horizontal top line */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {/* Theme Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          background: 'rgba(10, 10, 20, 0.9)',
          padding: '0.25rem 0.45rem',
          borderRadius: '9px',
          border: '1px solid var(--border-subtle)',
        }}>
          <Terminal size={13} color="var(--text-dim)" style={{ marginLeft: '0.2rem', marginRight: '0.1rem' }} />
          {themes.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-dim)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title={t.label}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* PostgreSQL Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(10, 10, 20, 0.9)',
          padding: '0.4rem 0.75rem',
          borderRadius: '9px',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.775rem',
        }}>
          <Database size={13} color={isDbUp ? '#10b981' : '#ff003c'} />
          <span style={{ color: 'var(--text-muted)' }}>Postgres:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 800, color: isDbUp ? '#34d399' : '#ff3366', fontFamily: 'var(--font-mono)' }}>
            <span className={`pulse-dot ${isDbUp ? 'online' : 'offline'}`} />
            {isDbUp ? 'Connected' : 'Offline'}
          </span>
        </div>

        {/* Redis Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(10, 10, 20, 0.9)',
          padding: '0.4rem 0.75rem',
          borderRadius: '9px',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.775rem',
        }}>
          <Cpu size={13} color={isRedisUp ? '#10b981' : '#f59e0b'} />
          <span style={{ color: 'var(--text-muted)' }}>Redis:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 800, color: isRedisUp ? '#34d399' : '#fbbf24', fontFamily: 'var(--font-mono)' }}>
            <span className={`pulse-dot ${isRedisUp ? 'online' : 'degraded'}`} />
            {isRedisUp ? redisLabel : 'Degraded'}
          </span>
        </div>

        {/* Refresh / Sync Button */}
        <button
          onClick={onRefresh}
          className="btn btn-secondary"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.775rem' }}
          title="Refresh Metrics"
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Sync</span>
        </button>
      </div>
    </header>
  );
}
