import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Send, 
  Flame, 
  RotateCcw, 
  Clock, 
  ShieldAlert, 
  Code,
  AlertCircle
} from 'lucide-react';
import { sendGatewayRequest, resetRateLimitKey, toggleClientStatus } from '../services/api';

const SAMPLE_ROUTES = [
  { path: '/api/v1/client/me', method: 'GET', name: 'Profile & Limits', description: 'Inspects authenticated client and rate limit configuration' },
  { path: '/api/v1/services/users', method: 'GET', name: 'Proxied User Service', description: 'Reverse-proxies to downstream User Microservice' },
  { path: '/api/v1/services/products', method: 'GET', name: 'Proxied Product Catalog', description: 'Reverse-proxies to downstream Product Service' },
  { path: '/api/v1/services/orders', method: 'GET', name: 'Proxied Orders Service', description: 'Reverse-proxies to downstream Order Service' },
  { path: '/api/v1/services/inspect', method: 'GET', name: 'Gateway Header Inspector', description: 'Inspects gateway telemetry headers forwarded to upstream' },
  { path: '/api/v1/gateway/data', method: 'GET', name: 'Native Gateway Metrics', description: 'Fetches gateway operational telemetry' },
];

export default function PlaygroundTab({ clients, metrics, onMetricsUpdate }) {
  // Persist chosen client ID in localStorage
  const [selectedClientId, setSelectedClientId] = useState(() => {
    return localStorage.getItem('nexus_selected_client_id') || '';
  });
  const [apiKey, setApiKey] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(SAMPLE_ROUTES[0].path);
  const [httpMethod, setHttpMethod] = useState('GET');
  const [postBody, setPostBody] = useState('{\n  "name": "Cloud AI Accelerator",\n  "price": 299.00,\n  "stock": 25\n}');
  
  const [loading, setLoading] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [burstProgress, setBurstProgress] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  // Rate limit state
  const [rateLimitState, setRateLimitState] = useState({
    limit: 60,
    remaining: 60,
  });

  // Wall-clock target timestamp for active Redis window expiration
  const windowExpiresAtRef = useRef(null);
  const [ttlDisplay, setTtlDisplay] = useState(60);
  const [isWindowActive, setIsWindowActive] = useState(false);
  const [isRateBlocked, setIsRateBlocked] = useState(false);

  // Current selected client object
  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  // Single unified wall-clock timer: guarantees the box and the red banner NEVER differ by even 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      if (windowExpiresAtRef.current) {
        const remainingSeconds = Math.max(0, Math.ceil((windowExpiresAtRef.current - Date.now()) / 1000));
        
        if (remainingSeconds > 0) {
          setTtlDisplay(remainingSeconds);
        } else {
          // Redis window elapsed: reset state cleanly to full capacity
          windowExpiresAtRef.current = null;
          setIsWindowActive(false);
          setIsRateBlocked(false);
          setTtlDisplay(60);
          setRateLimitState((prev) => ({
            ...prev,
            remaining: prev.limit,
          }));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Ensure a valid client is selected when clients list is loaded/updated
  useEffect(() => {
    if (clients.length === 0) return;

    const currentExists = clients.some((c) => c.id === selectedClientId);
    if (!currentExists) {
      const defaultClient = clients.find((c) => c.tier === 'pro' && c.isActive) || clients[0];
      if (defaultClient) {
        setSelectedClientId(defaultClient.id);
        localStorage.setItem('nexus_selected_client_id', defaultClient.id);
      }
    }
  }, [clients, selectedClientId]);

  // Load the selected client's key into the header input only when the selection itself changes,
  // so the 5s dashboard refresh never overwrites a key the user typed by hand
  useEffect(() => {
    if (selectedClient) setApiKey(selectedClient.apiKey);
  }, [selectedClient?.id, selectedClient?.apiKey]);

  // Sync rate limiter state with selected client and Redis active windows (on mount, refresh, or metrics update)
  useEffect(() => {
    if (!selectedClient) return;

    const tierLimit = selectedClient.rateLimit?.maxRequestsPerMinute || 
      (selectedClient.tier === 'pro' ? 60 : selectedClient.tier === 'enterprise' ? 1000 : 10);

    // Look for this client in the active Redis windows returned by backend
    const activeWindows = metrics?.redis?.activeRateLimitWindows || [];
    const existing = activeWindows.find((w) => w.apiKey === selectedClient.apiKey);

    if (existing && existing.ttlSeconds > 0) {
      windowExpiresAtRef.current = Date.now() + existing.ttlSeconds * 1000;
      setIsWindowActive(true);
      setTtlDisplay(existing.ttlSeconds);
      setIsRateBlocked(existing.isBlocked);
      setRateLimitState({
        limit: existing.maxLimit || tierLimit,
        remaining: existing.isBlocked ? 0 : (existing.remaining != null ? existing.remaining : Math.max(0, tierLimit - existing.currentCount)),
      });
    } else if (!windowExpiresAtRef.current) {
      // No active Redis window and no ongoing local timer
      setIsWindowActive(false);
      setIsRateBlocked(false);
      setTtlDisplay(60);
      setRateLimitState({
        limit: tierLimit,
        remaining: tierLimit,
      });
    }
  }, [selectedClient, metrics]);

  // When user switches client dropdown
  const handleClientChange = (e) => {
    const id = e.target.value;
    setSelectedClientId(id);
    localStorage.setItem('nexus_selected_client_id', id);
    windowExpiresAtRef.current = null;
    setLastResponse(null);
    setIsRateBlocked(false);
  };

  const handleToggleCurrentClientStatus = async () => {
    if (!selectedClient) return;
    await toggleClientStatus(selectedClient.id);
    onMetricsUpdate();
  };

  const executeRequest = async (overrideApiKey = null) => {
    setLoading(true);
    try {
      const activeKey = overrideApiKey !== null ? overrideApiKey : apiKey;
      const res = await sendGatewayRequest({
        path: selectedRoute,
        method: httpMethod,
        apiKey: activeKey,
        body: httpMethod === 'POST' ? JSON.parse(postBody) : null,
      });

      setLastResponse(res);

      if (res.headers.limit !== null) {
        const limit = parseInt(res.headers.limit, 10);
        const remaining = parseInt(res.headers.remaining, 10);
        const resetTtl = parseInt(res.headers.reset || res.headers.retryAfter, 10);

        // Set wall-clock expiration target based on exact Redis TTL
        if (resetTtl > 0) {
          windowExpiresAtRef.current = Date.now() + resetTtl * 1000;
          setIsWindowActive(true);
          setTtlDisplay(resetTtl);
        }

        const blocked = res.status === 429;
        setIsRateBlocked(blocked);

        setRateLimitState({
          limit,
          remaining: blocked ? 0 : remaining,
        });
      } else if (res.status === 429) {
        const retry = res.data?.rateLimit?.resetInSeconds || res.data?.retryAfter || 60;
        windowExpiresAtRef.current = Date.now() + retry * 1000;
        setIsWindowActive(true);
        setTtlDisplay(retry);
        setIsRateBlocked(true);
        setRateLimitState((prev) => ({
          ...prev,
          remaining: 0,
        }));
      }

      onMetricsUpdate();
      return res;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Enough requests to exhaust the remaining quota and trigger a 429 (capped so Enterprise never fires 1000)
  const burstSize = Math.min(Math.max(rateLimitState.remaining + 2, 12), 100);

  // Simulate Rapid-Fire Burst Attack to trigger 429
  const handleBurstSimulation = async () => {
    const total = burstSize;
    setBursting(true);
    setBurstProgress({ current: 0, total });

    for (let i = 1; i <= total; i++) {
      setBurstProgress({ current: i, total });
      await executeRequest();
      await new Promise((r) => setTimeout(r, 100));
    }

    setBursting(false);
    setBurstProgress(null);
  };

  // Reset Redis key and unblock quota
  const handleResetQuota = async () => {
    await resetRateLimitKey(apiKey);
    windowExpiresAtRef.current = null;
    setIsWindowActive(false);
    setIsRateBlocked(false);
    setTtlDisplay(60);
    setLastResponse(null);
    setRateLimitState((prev) => ({
      ...prev,
      remaining: prev.limit,
    }));
    onMetricsUpdate();
  };

  const usedPercentage = rateLimitState.limit > 0
    ? Math.min(100, Math.round(((rateLimitState.limit - rateLimitState.remaining) / rateLimitState.limit) * 100))
    : 0;

  const isBlocked = isRateBlocked && rateLimitState.remaining === 0;
  const isAuthError = lastResponse?.status === 401 || lastResponse?.status === 403;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.3rem', letterSpacing: '-0.02em' }}>
          Interactive API Gateway & Rate Limiter Playground
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Send live requests through authentication and Redis rate limiting, test reverse proxy microservice routing, and trigger burst attacks.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Request Controls */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Zap size={18} color="var(--accent-primary)" />
              <span>Request Configuration</span>
            </h2>

            {selectedClient && (
              <span className={`badge ${selectedClient.isActive ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                {selectedClient.isActive ? '● Active Key' : '✕ Key Revoked'}
              </span>
            )}
          </div>

          {/* Client Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Select Registered Client:
              </label>
              {selectedClient && !selectedClient.isActive && (
                <button
                  onClick={handleToggleCurrentClientStatus}
                  className="btn btn-primary"
                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.725rem' }}
                >
                  Re-activate Key
                </button>
              )}
            </div>
            <select
              className="form-select"
              value={selectedClientId}
              onChange={handleClientChange}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — [{c.tier.toUpperCase()}] ({c.rateLimit?.maxRequestsPerMinute} req/min) {!c.isActive ? '⚠️ (REVOKED)' : '✅ (ACTIVE)'}
                </option>
              ))}
            </select>
          </div>

          {/* API Key Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Active Header Key (x-api-key):
            </label>
            <input
              type="text"
              className="form-input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste or type API key..."
            />
          </div>

          {/* Route Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Target Gateway Route:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.45rem' }}>
              {SAMPLE_ROUTES.map((r) => {
                const isSelected = selectedRoute === r.path;
                return (
                  <div
                    key={r.path}
                    onClick={() => {
                      setSelectedRoute(r.path);
                      setHttpMethod(r.method);
                    }}
                    style={{
                      background: isSelected ? 'rgba(252, 238, 10, 0.12)' : 'rgba(8, 14, 22, 0.6)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: isSelected ? 'var(--accent-primary)' : '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: '#00f0ff', fontFamily: 'var(--font-mono)', marginRight: '0.35rem' }}>{r.method}</span>
                      {r.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.path}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRIMARY ACTION BUTTONS */}
          <div style={{
            display: 'flex',
            gap: '0.65rem',
            marginTop: '0.5rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={() => executeRequest()}
              disabled={loading || bursting}
              className="btn btn-primary"
              style={{ flex: 1, minWidth: '140px', padding: '0.75rem 1rem', fontSize: '0.9rem' }}
            >
              <Send size={17} />
              <span>{loading ? 'Executing...' : 'Send Request'}</span>
            </button>

            <button
              onClick={handleBurstSimulation}
              disabled={loading || bursting}
              className="btn btn-warning"
              style={{ flex: 1, minWidth: '160px', padding: '0.75rem 1rem', fontSize: '0.9rem' }}
              title="Fires enough rapid requests to exhaust the remaining quota and trigger rate limit blocking (429)"
            >
              <Flame size={17} />
              <span>
                {bursting ? `Bursting (${burstProgress?.current}/${burstProgress?.total})...` : `⚡ Simulate Burst (${burstSize} Req)`}
              </span>
            </button>

            <button
              onClick={handleResetQuota}
              className="btn btn-secondary"
              style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}
              title="Reset Redis rate limit key"
            >
              <RotateCcw size={15} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Rate Limit Meter & Response */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Rate Limit Quota Meter Card */}
          <div className={`glass-card ${isBlocked ? 'animate-rate-limit-block' : ''}`} style={{
            borderColor: isBlocked ? 'rgba(255, 0, 60, 0.6)' : 'var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} color={isBlocked ? '#ff3366' : 'var(--accent-primary)'} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  Live Rate Limit Quota Monitor
                </span>
              </div>
              <span className={`badge ${isBlocked ? 'badge-danger' : isAuthError ? 'badge-warning' : 'badge-success'}`}>
                {isBlocked ? 'Quota Blocked (429)' : isAuthError ? `Auth Error (${lastResponse?.status})` : 'Rate Permitted'}
              </span>
            </div>

            {/* Quota Progress Meter */}
            <div style={{ marginBottom: '1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.45rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Requests Remaining: <strong style={{ color: isBlocked ? '#ff3366' : '#34d399' }}>{rateLimitState.remaining}</strong> / {rateLimitState.limit}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  {usedPercentage}% consumed
                </span>
              </div>

              <div className="rate-limit-bar-bg" style={{ height: '10px' }}>
                <div
                  className="rate-limit-bar-fill"
                  style={{
                    width: `${usedPercentage}%`,
                    background: isBlocked
                      ? '#ff003c'
                      : usedPercentage > 80
                      ? '#f59e0b'
                      : 'linear-gradient(90deg, #10b981, #fcee0a)',
                  }}
                />
              </div>
            </div>

            {/* HTTP Rate Limit Headers Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
              <div style={{ background: 'rgba(8, 10, 18, 0.7)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>x-ratelimit-limit</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#f8fafc', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>{rateLimitState.limit}</div>
              </div>

              <div style={{ background: 'rgba(8, 10, 18, 0.7)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>x-ratelimit-remaining</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: isBlocked ? '#ff3366' : '#34d399', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                  {rateLimitState.remaining}
                </div>
              </div>

              <div style={{
                background: isBlocked ? 'rgba(255, 0, 60, 0.15)' : 'rgba(8, 10, 18, 0.7)',
                padding: '0.75rem',
                borderRadius: '10px',
                border: isBlocked ? '1px solid rgba(255, 0, 60, 0.4)' : '1px solid var(--border-subtle)',
                transition: 'all 0.3s ease',
              }}>
                <div style={{ fontSize: '0.7rem', color: isBlocked ? '#ff7799' : 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                  {isBlocked ? 'retry-after / reset' : 'x-ratelimit-reset'}
                </div>
                <div style={{
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  color: isBlocked ? '#ff3366' : isWindowActive ? '#00f0ff' : 'var(--text-dim)',
                  marginTop: '0.2rem',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {ttlDisplay}s
                </div>
              </div>
            </div>

            {/* 429 Retry-After Warning Card (100% Synchronized with Box Above) */}
            {isBlocked && (
              <div style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                background: 'rgba(255, 0, 60, 0.15)',
                border: '1px solid rgba(255, 0, 60, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <ShieldAlert size={20} color="#ff3366" />
                  <span style={{ fontSize: '0.875rem', color: '#ff3366', fontWeight: 700 }}>
                    Rate limit triggered! Retry-After countdown:
                  </span>
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ff3366', fontFamily: 'var(--font-mono)' }}>
                  {ttlDisplay}s
                </span>
              </div>
            )}

            {/* Revoked Key Alert */}
            {lastResponse?.status === 403 && (
              <div style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <AlertCircle size={18} color="#fbbf24" />
                  <span style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 600 }}>
                    This client's API key is revoked! Click "Re-activate Key" to allow requests.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Response Payload Inspector */}
          <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '260px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <Code size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Response Inspector</span>
              </div>

              {lastResponse && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span className={`badge ${lastResponse.status >= 200 && lastResponse.status < 300 ? 'badge-success' : lastResponse.status === 429 ? 'badge-danger' : 'badge-warning'}`}>
                    HTTP {lastResponse.status}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.55rem', borderRadius: '6px', fontFamily: 'var(--font-mono)' }}>
                    {lastResponse.latencyMs}ms
                  </span>
                </div>
              )}
            </div>

            <div style={{
              flex: 1,
              background: 'rgba(6, 8, 14, 0.95)',
              borderRadius: '10px',
              padding: '1rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.825rem',
              color: '#cbd5e1',
              overflowX: 'auto',
              border: '1px solid var(--border-subtle)',
              maxHeight: '260px',
            }}>
              {lastResponse ? (
                <pre style={{ margin: 0 }}>
                  {JSON.stringify(lastResponse.data, null, 2)}
                </pre>
              ) : (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '3.5rem 0' }}>
                  Click <strong>"Send Request"</strong> or <strong>"Simulate Burst"</strong> to inspect live response.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
