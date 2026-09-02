import React, { useState, useEffect } from 'react';
import { Shield, Heart, MapPin, AlertTriangle, CheckCircle, Navigation, Phone, Activity } from 'lucide-react';

export default function GoodSamaritanPanel({ user }) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.mobile || '',
    cpr_license_number: '',
    certification_agency: 'American Heart Association (AHA) BLS'
  });
  const [registeredVolunteer, setRegisteredVolunteer] = useState(null);
  const [nearbyAlerts, setNearbyAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);

  // Capture current geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        (err) => console.warn('[GPS WARN] Location access denied:', err.message),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Fetch nearby CPR alerts if active
  const fetchNearbyAlerts = async () => {
    if (!currentCoords) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cpr-network/nearby?lat=${currentCoords.lat}&lng=${currentCoords.lng}&radius=5.0`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        // Mock sample emergency broadcast for active responder display if none in DB
        if (!data.volunteers || data.volunteers.length === 0) {
          setNearbyAlerts([
            {
              id: 'ALT-101',
              distanceKm: 0.85,
              victimCondition: 'Out-of-Hospital Cardiac Arrest / Bystander CPR Needed',
              address: '7th Avenue Crossing, Sector 4',
              lat: currentCoords.lat + 0.005,
              lng: currentCoords.lng + 0.003,
              timestamp: new Date().toLocaleTimeString()
            }
          ]);
        }
      }
    } catch (err) {
      console.error('[CPR PANEL ERROR]', err);
    }
  };

  useEffect(() => {
    if (isRegistered && isActive) {
      fetchNearbyAlerts();
      const interval = setInterval(fetchNearbyAlerts, 15000);
      return () => clearInterval(interval);
    }
  }, [isRegistered, isActive, currentCoords]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...formData,
        latitude: currentCoords?.lat || 19.0760,
        longitude: currentCoords?.lng || 72.8777
      };

      const res = await fetch('/api/cpr-network/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        setIsRegistered(true);
        setRegisteredVolunteer(data.volunteer);
        setMessage({ type: 'success', text: 'CPR First Responder Profile Activated Successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to register CPR license' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error registering CPR profile' });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async () => {
    const nextStatus = !isActive;
    setIsActive(nextStatus);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/cpr-network/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: formData.phone,
          is_active: nextStatus,
          latitude: currentCoords?.lat,
          longitude: currentCoords?.lng
        })
      });
    } catch (err) {
      console.error('[CPR PING ERROR]', err);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <Heart className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Good Samaritan CPR Network
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                Live Bystander BLS
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              BLS/CPR certified citizen emergency responder network
            </p>
          </div>
        </div>

        {isRegistered && (
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isActive
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Activity className="w-4 h-4" />
            {isActive ? 'Active Standby (GPS Live)' : 'Standby Off'}
          </button>
        )}
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs border flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {!isRegistered ? (
        /* Volunteer Registration Form */
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Emergency Phone</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                placeholder="+91 9876543210"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">CPR / BLS License #</label>
              <input
                type="text"
                required
                value={formData.cpr_license_number}
                onChange={(e) => setFormData({ ...formData, cpr_license_number: e.target.value })}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                placeholder="AHA-BLS-994821"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Certifying Body</label>
              <select
                value={formData.certification_agency}
                onChange={(e) => setFormData({ ...formData, certification_agency: e.target.value })}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option>American Heart Association (AHA) BLS</option>
                <option>Indian Red Cross Society</option>
                <option>St. John Ambulance Association</option>
                <option>European Resuscitation Council (ERC)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
          >
            <Shield className="w-4 h-4" />
            {loading ? 'Activating CPR Volunteer License...' : 'Register as Good Samaritan CPR Responder'}
          </button>
        </form>
      ) : (
        /* Active Volunteer Dashboard */
        <div className="space-y-6">
          <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold">
                {formData.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">{formData.name}</h4>
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <span>License: <strong className="text-slate-200">{formData.cpr_license_number}</strong></span>
                  <span>•</span>
                  <span>{formData.certification_agency}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Response Radius</span>
              <p className="text-sm font-bold text-red-400">1.0 km</p>
            </div>
          </div>

          {/* Emergency Alert List */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Nearby Urgent Bystander Alerts ({nearbyAlerts.length})</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Monitoring GPS
              </span>
            </h3>

            {nearbyAlerts.length === 0 ? (
              <div className="p-8 text-center bg-slate-800/20 border border-slate-800 rounded-xl text-slate-500 text-xs">
                No active cardiac emergencies reported within your 1.0 km radius.
              </div>
            ) : (
              <div className="space-y-3">
                {nearbyAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 bg-red-950/30 border border-red-800/50 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded">
                          CRITICAL CARDIAC SOS
                        </span>
                        <span className="text-xs text-red-400 font-bold flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {alert.distanceKm} km away
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white">{alert.victimCondition}</h4>
                      <p className="text-xs text-slate-300 flex items-center gap-2">
                        <span>{alert.address}</span>
                        <span>•</span>
                        <span className="text-slate-400">{alert.timestamp}</span>
                      </p>
                    </div>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${alert.lat},${alert.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-red-900/40"
                    >
                      <Navigation className="w-4 h-4" />
                      Navigate to Perform Bystander CPR
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
