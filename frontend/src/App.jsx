import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import OverviewTab from './components/OverviewTab';
import ClientsTab from './components/ClientsTab';
import PlaygroundTab from './components/PlaygroundTab';
import RedisInspectorTab from './components/RedisInspectorTab';
import TrafficLogsTab from './components/TrafficLogsTab';
import { fetchHealth, fetchClients, fetchAdminMetrics } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState('cyberpunk'); // 'cyberpunk' | 'aurora'
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  // Sync theme with body data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [healthData, metricsData, clientsData] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchAdminMetrics().catch(() => null),
        fetchClients().catch(() => ({ clients: [] })),
      ]);

      if (healthData) setHealth(healthData);
      if (metricsData) setMetrics(metricsData);
      if (clientsData?.clients) setClients(clientsData.clients);
    } catch (e) {
      console.error('Failed to load gateway data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto refresh metrics every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clientCount={clients.length}
        blockedCount={metrics?.gateway?.totalRequestsBlocked || 0}
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <Navbar
          health={health}
          onRefresh={loadData}
          loading={loading}
          currentTheme={theme}
          setTheme={setTheme}
        />

        <main className="content-area">
          <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
            <OverviewTab
              metrics={metrics}
              clients={clients}
              setActiveTab={setActiveTab}
            />
          </div>

          <div style={{ display: activeTab === 'clients' ? 'block' : 'none' }}>
            <ClientsTab
              clients={clients}
              onClientsUpdated={loadData}
            />
          </div>

          <div style={{ display: activeTab === 'playground' ? 'block' : 'none' }}>
            <PlaygroundTab
              clients={clients}
              metrics={metrics}
              onMetricsUpdate={loadData}
            />
          </div>

          <div style={{ display: activeTab === 'redis' ? 'block' : 'none' }}>
            <RedisInspectorTab
              metrics={metrics}
              onRefresh={loadData}
            />
          </div>

          <div style={{ display: activeTab === 'logs' ? 'block' : 'none' }}>
            <TrafficLogsTab />
          </div>
        </main>
      </div>
    </div>
  );
}
