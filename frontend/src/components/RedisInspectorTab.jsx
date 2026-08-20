import React, { useState } from 'react';
import { 
  Cpu, 
  RotateCcw, 
  Trash2, 
  RefreshCw, 
  Clock, 
  Search
} from 'lucide-react';
import { resetRateLimitKey } from '../services/api';

export default function RedisInspectorTab({ metrics, onRefresh }) {
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const redisInfo = metrics?.redis || {};
  const activeWindows = redisInfo.activeRateLimitWindows || [];

  const handleResetSingle = async (apiKey) => {
    setActionLoading(true);
    try {
      await resetRateLimitKey(apiKey);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlushAll = async () => {
    if (window.confirm('Are you sure you want to flush ALL active Redis rate limit counters?')) {
      setActionLoading(true);
      try {
        await resetRateLimitKey(null);
        onRefresh();
      } catch (e) {
        console.error(e);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const filteredWindows = activeWindows.filter((w) =>
    w.apiKey.toLowerCase().includes(search.toLowerCase()) ||
    w.clientName.toLowerCase().includes(search.toLowerCase()) ||
    w.clientEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.3rem', letterSpacing: '-0.02em' }}>
            Live Redis Rate Limit Key Inspector
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Direct real-time inspection of active Redis rate-limiting keys, atomic counters, and TTL countdowns.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onRefresh} className="btn btn-secondary">
            <RefreshCw size={14} />
            <span>Refresh Scan</span>
          </button>
          <button onClick={handleFlushAll} disabled={actionLoading} className="btn btn-danger">
            <Trash2 size={14} />
            <span>Flush All Redis Counters</span>
          </button>
        </div>
      </div>

      {/* Redis Engine Telemetry Card */}
      <div className="glass-card" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.25rem',
        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
        borderColor: 'rgba(6, 182, 212, 0.3)',
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Redis Engine</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#22d3ee', marginTop: '0.2rem' }}>
            {redisInfo.engine || 'Docker Redis Server'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Engine Status</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="pulse-dot online" />
            {redisInfo.status || 'HEALTHY'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Active Sliding Windows</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.1rem', letterSpacing: '-0.02em' }}>
            {redisInfo.totalActiveRateLimitKeys || 0} keys
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ padding: '0.95rem 1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search live Redis keys by API key, client name, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Live Redis Keys Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Redis Key & API Key</th>
                <th>Client Profile</th>
                <th>Current Count / Limit</th>
                <th>Quota Consumed</th>
                <th>Window TTL</th>
                <th>Rate State</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWindows.map((w) => (
                <tr key={w.redisKey}>
                  <td>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399', fontSize: '0.875rem' }}>
                      {w.redisKey}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>
                      {w.apiKey}
                    </div>
                  </td>

                  <td>
                    <div style={{ fontWeight: 700, color: '#f8fafc' }}>{w.clientName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                      {w.clientEmail} <span className={`badge badge-${w.tier}`} style={{ fontSize: '0.65rem', marginLeft: '0.35rem' }}>{w.tier}</span>
                    </div>
                  </td>

                  <td>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: w.isBlocked ? '#fb7185' : '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                      {w.currentCount} <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>/ {w.maxLimit}</span>
                    </div>
                  </td>

                  <td style={{ width: '160px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' }}>
                      {w.percentUsed}% used
                    </div>
                    <div className="rate-limit-bar-bg">
                      <div
                        className="rate-limit-bar-fill"
                        style={{
                          width: `${w.percentUsed}%`,
                          background: w.isBlocked ? '#f43f5e' : w.percentUsed > 80 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  </td>

                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#22d3ee', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      <Clock size={14} />
                      <span>{w.ttlSeconds}s</span>
                    </div>
                  </td>

                  <td>
                    <span className={`badge ${w.isBlocked ? 'badge-danger' : 'badge-success'}`}>
                      {w.isBlocked ? 'Blocked (429)' : 'Permitted'}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleResetSingle(w.apiKey)}
                      disabled={actionLoading}
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                      title="Reset counter in Redis"
                    >
                      <RotateCcw size={12} />
                      <span>Reset Key</span>
                    </button>
                  </td>
                </tr>
              ))}

              {filteredWindows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                    <Cpu size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <div>No active rate limit keys currently in Redis memory.</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Send a request in the Playground to create a live rate limit window!</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
