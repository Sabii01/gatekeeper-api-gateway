import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Search, 
  Globe
} from 'lucide-react';
import { fetchTrafficLogs } from '../services/api';

export default function TrafficLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetchTrafficLogs(100);
      if (res.success) {
        setLogs(res.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Live auto-polling every 3 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.route.toLowerCase().includes(search.toLowerCase()) ||
      l.clientIp.toLowerCase().includes(search.toLowerCase()) ||
      (l.client?.email && l.client.email.toLowerCase().includes(search.toLowerCase()));

    let matchesStatus = true;
    if (statusFilter === '2xx') matchesStatus = l.statusCode >= 200 && l.statusCode < 300;
    if (statusFilter === '429') matchesStatus = l.statusCode === 429;
    if (statusFilter === '401') matchesStatus = l.statusCode === 401 || l.statusCode === 403;
    if (statusFilter === 'proxied') matchesStatus = l.route.includes('/services/');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.3rem', letterSpacing: '-0.02em' }}>
            Live Gateway Traffic & Latency Stream
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Real-time activity log tracking incoming client IP addresses, route execution, status codes, and latency.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.5rem 0.95rem' }}
          >
            <span className={`pulse-dot ${autoRefresh ? 'online' : 'offline'}`} />
            <span>{autoRefresh ? 'Live Stream Active' : 'Stream Paused'}</span>
          </button>

          <button onClick={loadLogs} className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by route, client IP, or user email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Requests' },
            { id: '2xx', label: '2xx Success' },
            { id: '429', label: '429 Rate Limited' },
            { id: '401', label: '401/403 Auth Failed' },
            { id: 'proxied', label: 'Proxied Services' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className="btn btn-secondary"
              style={{
                padding: '0.5rem 0.85rem',
                fontSize: '0.775rem',
                background: statusFilter === f.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(12, 18, 28, 0.7)',
                borderColor: statusFilter === f.id ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)',
                color: statusFilter === f.id ? 'var(--accent-primary-light)' : 'var(--text-muted)',
                fontWeight: statusFilter === f.id ? 700 : 500,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Traffic Stream Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Client IP</th>
                <th>Method & Route</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Caller & Tier</th>
                <th>Rate Quota</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const is2xx = log.statusCode >= 200 && log.statusCode < 300;
                const is429 = log.statusCode === 429;
                const is401 = log.statusCode === 401 || log.statusCode === 403;

                return (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#cbd5e1' }}>
                        <Globe size={13} color="var(--text-dim)" />
                        <span>{log.clientIp}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          background: log.method === 'POST' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                          color: log.method === 'POST' ? '#34d399' : '#22d3ee',
                        }}>
                          {log.method}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>
                          {log.route}
                        </span>
                        {log.route.includes('/services/') && (
                          <span className="badge badge-free" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                            proxied
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${is2xx ? 'badge-success' : is429 ? 'badge-danger' : is401 ? 'badge-warning' : 'badge-danger'}`}>
                        {log.statusCode} {is429 ? '429 Blocked' : is2xx ? 'OK' : ''}
                      </span>
                    </td>

                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        color: log.latencyMs < 50 ? '#34d399' : log.latencyMs < 150 ? '#fbbf24' : '#fb7185',
                      }}>
                        {log.latencyMs} ms
                      </span>
                    </td>

                    <td>
                      <div>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.85rem' }}>
                          {log.client?.email || 'Anonymous'}
                        </span>
                        {log.client?.tier && (
                          <span className={`badge badge-${log.client.tier}`} style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>
                            {log.client.tier}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {log.rateLimit ? (
                        <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                          rem: <strong style={{ color: is429 ? '#fb7185' : '#34d399' }}>{log.rateLimit.remaining}</strong>/{log.rateLimit.limit}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                    <Activity size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <div>No traffic logs matching selected filters.</div>
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
