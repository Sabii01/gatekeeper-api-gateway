import React from 'react';
import { 
  Activity, 
  ShieldAlert, 
  Cpu, 
  Clock, 
  Layers, 
  CheckCircle2, 
  Zap, 
  Users, 
  Server,
  Sparkles
} from 'lucide-react';

export default function OverviewTab({ metrics, clients, setActiveTab }) {
  const gateway = metrics?.gateway || {};
  const redis = metrics?.redis || {};

  const totalRequests = gateway.totalRequestsHandled || 0;
  const blockedRequests = gateway.totalRequestsBlocked || 0;
  const activeKeys = redis.totalActiveRateLimitKeys || 0;
  const avgLatency = gateway.averageLatencyMs || 0;

  const freeReqs = gateway.tierBreakdown?.free || 0;
  const proReqs = gateway.tierBreakdown?.pro || 0;
  const enterpriseReqs = gateway.tierBreakdown?.enterprise || 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 50%, rgba(14, 22, 34, 0.7) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem',
        padding: '2rem 2.2rem',
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            <Sparkles size={13} />
            <span>High-Performance Edge Gateway</span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '0.4rem' }}>
            API Gateway & Rate Limiter Control Center
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '720px', lineHeight: 1.6 }}>
            Unified API Gateway with PostgreSQL authentication, atomic Redis sliding/fixed window rate limiting, and reverse proxy forwarder to downstream microservices.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button onClick={() => setActiveTab('playground')} className="btn btn-primary">
            <Zap size={16} />
            <span>Open Playground</span>
          </button>
          <button onClick={() => setActiveTab('clients')} className="btn btn-secondary">
            <Users size={16} />
            <span>Manage Clients</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.4rem',
      }}>
        {/* Total Handled */}
        <div className="glass-card glass-card-interactive">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Handled
            </span>
            <div style={{ padding: '0.55rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.14)', color: '#34d399' }}>
              <Activity size={19} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
            {totalRequests.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
            <CheckCircle2 size={14} />
            <span>{gateway.successfulRequests || 0} Successful (2xx)</span>
          </div>
        </div>

        {/* 429 Blocked */}
        <div className="glass-card glass-card-interactive">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Rate-Limited (429s)
            </span>
            <div style={{ padding: '0.55rem', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.14)', color: '#fb7185' }}>
              <ShieldAlert size={19} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: blockedRequests > 0 ? '#fb7185' : '#f8fafc', marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
            {blockedRequests.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-dim)' }}>
            <span>Blocked via Redis Tier Threshold</span>
          </div>
        </div>

        {/* Active Redis Keys */}
        <div className="glass-card glass-card-interactive">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Redis Windows
            </span>
            <div style={{ padding: '0.55rem', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.14)', color: '#22d3ee' }}>
              <Cpu size={19} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
            {activeKeys}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#22d3ee', fontWeight: 600 }}>
            <span>Live sliding keys in Redis</span>
          </div>
        </div>

        {/* Avg Latency */}
        <div className="glass-card glass-card-interactive">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.775rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Average Latency
            </span>
            <div style={{ padding: '0.55rem', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24' }}>
              <Clock size={19} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
            {avgLatency} <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)' }}>ms</span>
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-dim)' }}>
            <span>Gateway processing overhead</span>
          </div>
        </div>
      </div>

      {/* Tier Distribution & Architecture */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.75rem' }}>
        {/* Tier Distribution */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Layers size={19} color="#34d399" />
            <span>Traffic Breakdown by Subscription Tier</span>
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Free Tier */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.45rem' }}>
                <span style={{ fontWeight: 700, color: '#22d3ee' }}>Free Tier (10 req/min)</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{freeReqs} reqs</span>
              </div>
              <div className="rate-limit-bar-bg">
                <div 
                  className="rate-limit-bar-fill"
                  style={{ 
                    width: `${totalRequests > 0 ? (freeReqs / totalRequests) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #06b6d4, #22d3ee)',
                  }} 
                />
              </div>
            </div>

            {/* Pro Tier */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.45rem' }}>
                <span style={{ fontWeight: 700, color: '#34d399' }}>Pro Tier (60 req/min)</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{proReqs} reqs</span>
              </div>
              <div className="rate-limit-bar-bg">
                <div 
                  className="rate-limit-bar-fill"
                  style={{ 
                    width: `${totalRequests > 0 ? (proReqs / totalRequests) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #10b981, #34d399)',
                  }} 
                />
              </div>
            </div>

            {/* Enterprise Tier */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.45rem' }}>
                <span style={{ fontWeight: 700, color: '#fbbf24' }}>Enterprise Tier (1000 req/min)</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{enterpriseReqs} reqs</span>
              </div>
              <div className="rate-limit-bar-bg">
                <div 
                  className="rate-limit-bar-fill"
                  style={{ 
                    width: `${totalRequests > 0 ? (enterpriseReqs / totalRequests) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Architecture Pipeline */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Server size={19} color="#38bdf8" />
            <span>Gateway Execution Pipeline</span>
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'rgba(8, 14, 22, 0.6)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>1</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>Traffic Logger Middleware</div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)' }}>Captures IP, route, method, and records high-resolution latency.</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'rgba(8, 14, 22, 0.6)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>2</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>API Key Auth (PostgreSQL)</div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)' }}>Validates `x-api-key`, verifies active status, and loads client tier rules.</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'rgba(8, 14, 22, 0.6)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>3</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>Atomic Redis Rate Limiter</div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)' }}>Executes atomic INCR & sets x-ratelimit-* headers. Returns 429 if exceeded.</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'rgba(8, 14, 22, 0.6)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem' }}>4</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>Reverse Proxy Forwarder</div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)' }}>Intersperses telemetry headers and forwards to target microservices.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
