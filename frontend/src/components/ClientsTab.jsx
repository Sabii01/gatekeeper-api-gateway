import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Key, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Trash2, 
  Search, 
  Sparkles,
  X
} from 'lucide-react';
import { registerClient, toggleClientStatus, deleteClient } from '../services/api';

export default function ClientsTab({ clients, onClientsUpdated }) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', tier: 'pro' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [revealedKeys, setRevealedKeys] = useState({});
  const [newlyCreatedClient, setNewlyCreatedClient] = useState(null);

  const handleCopy = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleReveal = (id) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await registerClient(formData);
      if (res.success) {
        setNewlyCreatedClient(res.client);
        setFormData({ name: '', email: '', tier: 'pro' });
        setIsModalOpen(false);
        onClientsUpdated();
      } else {
        setErrorMsg(res.message || 'Failed to register client');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await toggleClientStatus(id);
      onClientsUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete client "${name}" and revoke their API key?`)) {
      try {
        await deleteClient(id);
        onClientsUpdated();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const filteredClients = clients.filter((c) => {
    const matchesSearch = 
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.apiKey.toLowerCase().includes(search.toLowerCase());
    const matchesTier = tierFilter === 'all' || c.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.3rem', letterSpacing: '-0.02em' }}>
            Registered Clients & API Keys
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage users, provision cryptographically secure API keys, and configure tier-based rate limits.
          </p>
        </div>

        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
          <UserPlus size={16} />
          <span>Register New Client</span>
        </button>
      </div>

      {/* Success Notification after New Key Generation */}
      {newlyCreatedClient && (
        <div className="glass-card animate-fade-in" style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
          borderColor: 'rgba(16, 185, 129, 0.4)',
          boxShadow: '0 0 25px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.5rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Sparkles size={18} color="#34d399" />
              <span style={{ fontWeight: 800, color: '#34d399', fontSize: '1rem' }}>
                Client Registered & Cryptographic Key Generated!
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Client <strong>{newlyCreatedClient.name}</strong> ({newlyCreatedClient.tier.toUpperCase()}) is active and ready to authenticate immediately.
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className="api-key-box" style={{ background: 'rgba(6, 10, 16, 0.95)', color: '#34d399', fontSize: '0.85rem' }}>
                {newlyCreatedClient.apiKey}
              </div>
              <button 
                onClick={() => handleCopy(newlyCreatedClient.apiKey)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                {copiedKey === newlyCreatedClient.apiKey ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                <span>{copiedKey === newlyCreatedClient.apiKey ? 'Copied!' : 'Copy Key'}</span>
              </button>
            </div>
          </div>

          <button 
            onClick={() => setNewlyCreatedClient(null)} 
            className="btn btn-secondary" 
            style={{ padding: '0.45rem', borderRadius: '50%' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Search by client name, email, or API key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['all', 'free', 'pro', 'enterprise'].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className="btn btn-secondary"
              style={{
                padding: '0.55rem 0.95rem',
                fontSize: '0.8rem',
                textTransform: 'capitalize',
                background: tierFilter === t ? 'rgba(16, 185, 129, 0.15)' : 'rgba(12, 18, 28, 0.7)',
                borderColor: tierFilter === t ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)',
                color: tierFilter === t ? 'var(--accent-primary-light)' : 'var(--text-muted)',
                fontWeight: tierFilter === t ? 700 : 500,
              }}
            >
              {t === 'all' ? 'All Tiers' : `${t} Tier`}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Client Details</th>
                <th>Subscription Tier</th>
                <th>Rate Limit</th>
                <th>API Key</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => {
                const isRevealed = revealedKeys[client.id];
                const displayKey = isRevealed 
                  ? client.apiKey 
                  : `${client.apiKey.substring(0, 12)}••••••••••••••••${client.apiKey.substring(client.apiKey.length - 4)}`;

                return (
                  <tr key={client.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.925rem' }}>{client.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>{client.email}</div>
                    </td>

                    <td>
                      <span className={`badge badge-${client.tier}`}>
                        {client.tier}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                        {client.rateLimit?.maxRequestsPerMinute || 10} req/min
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        burst capacity: {client.rateLimit?.burstCapacity || 0}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <div className="api-key-box">
                          <span>{displayKey}</span>
                        </div>
                        <button
                          onClick={() => toggleReveal(client.id)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', background: 'transparent' }}
                          title={isRevealed ? 'Hide' : 'Reveal'}
                        >
                          {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => handleCopy(client.apiKey)}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', background: 'transparent' }}
                          title="Copy Key"
                        >
                          {copiedKey === client.apiKey ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${client.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {client.isActive ? 'Active' : 'Revoked'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleToggleStatus(client.id)}
                          className={`btn ${client.isActive ? 'btn-danger' : 'btn-primary'}`}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                        >
                          {client.isActive ? 'Revoke' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(client.id, client.name)}
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.55rem', color: '#fb7185' }}
                          title="Delete Client"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                    No clients found matching your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registration Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1.5rem',
        }}>
          <div className="glass-card animate-fade-in" style={{
            width: '100%',
            maxWidth: '540px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-glow)',
            boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.8)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <UserPlus size={22} color="var(--accent-primary-light)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  Register New Client & API Key
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="btn btn-secondary" 
                style={{ padding: '0.4rem', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                padding: '0.85rem',
                borderRadius: '8px',
                color: '#fb7185',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
              }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                  Client Name / Company
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Quantum Corp, Dev Systems"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                  Contact Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. developer@acmequantum.com"
                  className="form-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                  Subscription Tier & Rate Quota
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  {[
                    { id: 'free', name: 'Free Tier', limit: '10 req/min', color: '#22d3ee' },
                    { id: 'pro', name: 'Pro Tier', limit: '60 req/min', color: '#34d399' },
                    { id: 'enterprise', name: 'Enterprise', limit: '1000 req/min', color: '#fbbf24' },
                  ].map((t) => {
                    const isSelected = formData.tier === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setFormData({ ...formData, tier: t.id })}
                        style={{
                          background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(8, 14, 22, 0.6)',
                          border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                          borderRadius: '12px',
                          padding: '0.85rem 0.5rem',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: t.color }}>{t.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>{t.limit}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  <Key size={16} />
                  <span>{submitting ? 'Generating Key...' : 'Generate API Key & Register'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
