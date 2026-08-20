import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

export default function HospitalAnalytics({ hospitalId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [occupancy, setOccupancy] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem('rescuelink_token');
    const headers = { Authorization: `Bearer ${token}` };

    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, occupancyRes, diagRes] = await Promise.all([
          fetch('/api/analytics', { headers }),
          fetch('/api/analytics/occupancy', { headers }),
          fetch('/api/analytics/diagnostics', { headers }).then(r => r.ok ? r.json() : null)
        ]);

        if (!statsRes.ok || !occupancyRes.ok) {
          throw new Error('Failed to fetch analytics statistics');
        }

        const statsData = await statsRes.json();
        const occupancyData = await occupancyRes.json();

        setStats(statsData);
        setOccupancy(occupancyData);
        if (diagRes) setDiagnostics(diagRes);
        setError(null);
      } catch (err) {
        console.error('[ANALYTICS FETCH ERROR]', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [hospitalId]);

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#00c8ff', fontFamily: "'Orbitron'" }}>
        <div style={{ fontSize: 18, animation: 'pulse-opacity 1s infinite' }}>📊 INITIALIZING REAL-TIME INFRASTRUCTURE LEDGER...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#ff4444', fontFamily: "'Orbitron'", padding: 20, textAlign: 'center', background: 'rgba(255,0,0,0.05)', border: '1px solid #ff4444', borderRadius: 8 }}>
        <div>⚠️ ANALYTICS SYNCHRONIZATION FAILED</div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  // Display defaults if backend fallback returned empty data
  const responseData = stats?.responseData || [];
  const incidents = stats?.mockIncidents || [];
  const successRate = stats?.successRate || 95;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { title: 'TOTAL MISSIONS', value: stats?.totalMissions || 0, color: '#00c8ff', icon: '🚑' },
          { title: 'STABILIZED CASES', value: stats?.completedMissions || 0, color: '#00ff88', icon: '💚' },
          { title: 'ACTIVE INCIDENTS', value: stats?.activeMissions || 0, color: '#ffb800', icon: '📡' },
          { title: 'SUCCESS RATE', value: `${successRate}%`, color: successRate >= 90 ? '#00ff88' : '#ffb800', icon: '📈' },
        ].map((c, idx) => (
          <div key={idx} style={{
            background: 'rgba(10,22,48,0.75)', border: `1px solid rgba(0,200,255,0.15)`,
            borderRadius: 10, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.05em' }}>{c.title}</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Orbitron'", color: c.color, marginTop: 6 }}>{c.value}</div>
            </div>
            <div style={{ fontSize: 24 }}>{c.icon}</div>
          </div>
        ))}
      </div>

      {/* Response Time & Incidents Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <div style={{ background: 'rgba(10,22,48,0.75)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', margin: '0 0 15px', letterSpacing: '0.05em' }}>📈 METRIC ANALYSIS: TRANSIT LATENCY & LOAD RATE</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={responseData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00c8ff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00c8ff" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" style={{ fontSize: 10, fontFamily: "'Share Tech Mono'" }} />
                <YAxis stroke="rgba(255,255,255,0.3)" style={{ fontSize: 10, fontFamily: "'Share Tech Mono'" }} />
                <Tooltip contentStyle={{ background: '#050d1a', border: '1px solid #00c8ff', fontSize: 11, borderRadius: 6 }} />
                <Area type="monotone" dataKey="avgResponseTimeMin" name="Avg ETA (Mins)" stroke="#00c8ff" strokeWidth={2} fillOpacity={1} fill="url(#colorResponse)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Real-time Diagnostics container */}
        <div style={{ background: 'rgba(10,22,48,0.75)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', margin: '0 0 10px', letterSpacing: '0.05em' }}>📡 SERVER TELEMETRY & DIAGNOSTICS</h3>
          {diagnostics ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>HEALTH STATUS</span>
                <span style={{ fontSize: 12, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>● OPERATIONAL</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>ACTIVE INGESTION CLIENTS</span>
                <span style={{ fontSize: 12, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>{diagnostics.diagnostics?.socketConnectionsCount || 0} Connected</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>DATABASE PING</span>
                <span style={{ fontSize: 12, color: diagnostics.diagnostics?.database?.status === 'healthy' ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>
                  {diagnostics.diagnostics?.database?.responseTimeMs || 0} ms ({diagnostics.diagnostics?.database?.status})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>SYSTEM UPTIME</span>
                <span style={{ fontSize: 12, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>{Math.floor(diagnostics.uptime / 3600)}h {Math.floor((diagnostics.uptime % 3600) / 60)}m</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(160,200,255,0.4)', fontSize: 12, fontFamily: "'Share Tech Mono'", padding: 30 }}>
              WAITING FOR DIAGNOSTICS STREAM...
            </div>
          )}
        </div>
      </div>

      {/* Bed Occupancy Grid & Recent logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr', gap: 20 }}>
        {/* Bed occupancy rates */}
        <div style={{ background: 'rgba(10,22,48,0.75)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', margin: '0 0 15px', letterSpacing: '0.05em' }}>🛏️ REGIONAL HOSPITAL CAPACITY OVERVIEW</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {occupancy.map((h, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold' }}>{h.name}</span>
                  <span style={{ color: h.occupancyRate > 85 ? '#ff4444' : '#00ff88', fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>{h.occupancyRate}% Occupied</span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${h.occupancyRate}%`, height: '100%', background: h.occupancyRate > 85 ? 'linear-gradient(90deg, #ffb800, #ff4444)' : 'linear-gradient(90deg, #00ff88, #00c8ff)', borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(160,200,255,0.5)', marginTop: 6, fontFamily: "'Share Tech Mono'" }}>
                  <span>ICU Available: {h.availableIcu} / {h.icuBeds}</span>
                  <span>General Available: {h.availableBeds} / {h.totalBeds}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Heatmap/Logs Explorer */}
        <div style={{ background: 'rgba(10,22,48,0.75)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', margin: '0 0 15px', letterSpacing: '0.05em' }}>📋 AUDIT & RECENT INCIDENTS TRANSIT LOG</h3>
          <div style={{ overflowY: 'auto', maxHeight: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incidents.map((inc, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: 4, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', color: '#e0eaff' }}>{inc.type}</div>
                  <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>Hospital: {inc.hospital} · Time: {inc.time}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono'", color: '#00c8ff', background: 'rgba(0,200,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{inc.response}</span>
                  <span style={{ fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold', color: inc.outcome === 'Stabilised' ? '#00ff88' : inc.outcome === 'Cancelled' ? '#ff4444' : '#ffb800' }}>{inc.outcome.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
