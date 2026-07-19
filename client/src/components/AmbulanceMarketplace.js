import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ambulanceIcon = L.divIcon({
  className: '',
  html: `<div style="width:40px;height:40px;background:rgba(255,100,50,0.95);border:2px solid #ff6b35;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 25px rgba(255,100,50,0.8);animation:pulse 1s ease infinite">🚑</div><style>@keyframes pulse{0%,100%{box-shadow:0 0 15px rgba(255,100,50,0.5)}50%{box-shadow:0 0 30px rgba(255,100,50,1)}}</style>`,
  iconSize: [40, 40], iconAnchor: [20, 20],
});

export default function AmbulanceMarketplace({ socket, userLocation, onBookAmbulance }) {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('all');
  const [sortBy, setSortBy] = useState('response');
  const [selected, setSelected] = useState(null);
  const [bookingStep, setBookingStep] = useState(null);
  const [mapCenter] = useState(userLocation || { lat: 12.9716, lng: 77.5946 });

  useEffect(() => {
    const loc = userLocation || mapCenter;
    fetch(`${SERVER_URL}/api/marketplace/ambulances?lat=${loc.lat}&lng=${loc.lng}`)
      .then(r => r.json())
      .then(data => { setAmbulances(data); setLoading(false); })
      .catch(() => setLoading(false));

    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [userLocation, mapCenter]);

  const filtered = ambulances
    .filter(a => selectedType === 'all' || a.type.toLowerCase().includes(selectedType.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'response') return a.responseTime - b.responseTime;
      if (sortBy === 'price') return a.basePrice - b.basePrice;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0;
    });

  const TYPE_COLORS = {
    'Advanced Life Support': '#ff6b35',
    'Basic Life Support': '#00c8ff',
    'Air Ambulance': '#aa44ff',
  };

  const handleBook = (amb) => {
    setSelected(amb);
    setBookingStep('confirm');
  };

  const initiatePayment = async () => {
    if (!selected) return;
    try {
      const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('token');
      
      // 1. Create order on backend
      const orderRes = await fetch(`${SERVER_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ amount: selected.basePrice, currency: 'INR', ambulanceId: selected.id })
      });
      const orderData = await orderRes.json();
      if (orderData.error) throw new Error(orderData.error);

      // 2. Open Razorpay Modal
      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'RescueLink Emergency',
        description: `Ambulance Dispatch - ${selected.name}`,
        order_id: orderData.id,
        handler: async function (response) {
          // 3. Verify Payment
          try {
            const verifyRes = await fetch(`${SERVER_URL}/api/payments/verify`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                ambulanceId: selected.id
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              confirmBooking();
            } else {
              alert('Payment verification failed.');
            }
          } catch (e) {
            alert('Verification connection failed.');
          }
        },
        prefill: {
          name: 'RescueLink Emergency User',
          email: 'user@rescuelink.com',
          contact: '+919999999999'
        },
        theme: { color: '#ff6b35' }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert(`Booking Payment Failed: ${err.message}`);
    }
  };

  const confirmBooking = () => {
    if (onBookAmbulance) onBookAmbulance(selected);
    setBookingStep('booked');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(2,8,25,0.95)', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif" }}>
      <style>{`
        @keyframes cardHover { from{transform:translateY(0)} to{transform:translateY(-3px)} }
        @keyframes fadeSlide { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes bookingPulse { 0%,100%{box-shadow:0 0 15px rgba(0,200,255,0.2)} 50%{box-shadow:0 0 30px rgba(0,200,255,0.5)} }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,200,255,0.2)', background: 'rgba(0,200,255,0.04)' }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
          🚑 AMBULANCE MARKETPLACE
        </div>
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
          Like Uber — but for emergency medical transport • {ambulances.filter(a => a.available).length} units available nearby
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {['all', 'ALS', 'BLS', 'Air'].map(t => (
            <button key={t} onClick={() => setSelectedType(t)} style={{
              padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
              background: selectedType === t ? 'rgba(0,200,255,0.2)' : 'transparent',
              border: `1px solid ${selectedType === t ? '#00c8ff' : 'rgba(0,200,255,0.2)'}`,
              color: selectedType === t ? '#00c8ff' : 'rgba(160,200,255,0.5)',
              fontFamily: "'Orbitron'", fontSize: 9, transition: 'all 0.2s'
            }}>{t === 'all' ? 'ALL TYPES' : t}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
          color: '#00c8ff', padding: '6px 10px', fontSize: 11, fontFamily: "'Orbitron'"
        }}>
          <option value="response">Sort: Response Time</option>
          <option value="price">Sort: Price</option>
          <option value="rating">Sort: Rating</option>
        </select>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Map */}
        <div style={{ height: 220, borderBottom: '1px solid rgba(0,200,255,0.15)' }}>
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} style={{ width: '100%', height: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {filtered.filter(a => a.available && a.lat && a.lng).map(amb => (
              <Marker key={amb.id} position={[amb.lat, amb.lng]} icon={ambulanceIcon}>
                <Popup>
                  <div style={{ background: '#050f28', padding: 10, color: '#e0eaff', fontFamily: "'Rajdhani'", minWidth: 160 }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ff6b35', marginBottom: 4 }}>{amb.name}</div>
                    <div style={{ fontSize: 12 }}>⭐ {amb.rating} • {amb.responseTime} min ETA</div>
                    <div style={{ fontSize: 11, color: '#00ff88', marginTop: 4 }}>₹{amb.basePrice} base</div>
                  </div>
                </Popup>
              </Marker>
            ))}
            {userLocation && <Circle center={[userLocation.lat, userLocation.lng]} radius={500} color="#00ff88" fillOpacity={0.1} />}
          </MapContainer>
        </div>

        {/* Ambulance List */}
        <div style={{ padding: '12px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(160,200,255,0.4)' }}>Loading ambulances...</div>
          ) : (
            filtered.map((amb, i) => {
              const typeColor = TYPE_COLORS[amb.type] || '#00c8ff';
              const isSelected = selected?.id === amb.id;
              return (
                <div key={amb.id} onClick={() => setSelected(amb)} style={{
                  background: isSelected ? `${typeColor}15` : 'rgba(5,15,40,0.8)',
                  border: `1px solid ${isSelected ? typeColor + '66' : 'rgba(0,200,255,0.12)'}`,
                  borderRadius: 12, padding: '16px', marginBottom: 12,
                  cursor: 'pointer', transition: 'all 0.2s',
                  animation: `fadeSlide 0.3s ${i * 0.06}s ease both`,
                  opacity: amb.available ? 1 : 0.5
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>
                          {amb.type === 'Air Ambulance' ? '🚁' : amb.type === 'Advanced Life Support' ? '🚑' : '🏥'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{amb.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)' }}>{amb.provider}</div>
                        </div>
                      </div>
                      <div style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                        background: `${typeColor}22`, border: `1px solid ${typeColor}44`,
                        color: typeColor, fontFamily: "'Orbitron'", fontSize: 9
                      }}>{amb.type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: typeColor, fontWeight: 900 }}>
                        {amb.responseTime} <span style={{ fontSize: 10 }}>min</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>ETA</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {amb.features.map((f, fi) => (
                      <span key={fi} style={{
                        padding: '2px 8px', background: 'rgba(0,200,255,0.06)',
                        border: '1px solid rgba(0,200,255,0.15)', borderRadius: 12,
                        fontSize: 10, color: 'rgba(160,200,255,0.6)'
                      }}>{f}</span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <span style={{ color: '#ffb800' }}>⭐ {amb.rating}</span>
                      <span style={{ color: 'rgba(160,200,255,0.5)' }}>{amb.trips.toLocaleString()} trips</span>
                      <span style={{ color: '#00ff88' }}>₹{amb.basePrice} + ₹{amb.pricePerKm}/km</span>
                    </div>
                    {amb.available ? (
                      <button onClick={(e) => { e.stopPropagation(); handleBook(amb); }} style={{
                        padding: '8px 20px', background: `${typeColor}22`, border: `1px solid ${typeColor}66`,
                        borderRadius: 8, color: typeColor, fontFamily: "'Orbitron'", fontSize: 10,
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.05em'
                      }}>BOOK NOW</button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#ff4444', fontFamily: "'Orbitron'" }}>UNAVAILABLE</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Booking Confirmation Modal */}
      {bookingStep === 'confirm' && selected && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,5,20,0.9)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            background: '#0a1526', border: '1px solid rgba(0,200,255,0.4)', borderRadius: 16, padding: 28,
            width: '90%', maxWidth: 400, animation: 'bookingPulse 2s ease infinite'
          }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00c8ff', marginBottom: 16, textAlign: 'center' }}>
              CONFIRM AMBULANCE BOOKING
            </div>
            <div style={{ background: 'rgba(0,200,255,0.05)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', marginBottom: 4 }}>{selected.provider} • {selected.type}</div>
              <div style={{ fontSize: 12, color: '#00ff88' }}>⭐ {selected.rating} • ETA: ~{selected.responseTime} min</div>
              <div style={{ fontSize: 12, color: '#ffb800', marginTop: 8, fontFamily: "'Share Tech Mono'" }}>
                Base: ₹{selected.basePrice} + ₹{selected.pricePerKm}/km
              </div>
              <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', marginTop: 4 }}>
                24/7 Emergency: {selected.contact}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setBookingStep(null)} style={{
                flex: 1, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: 'rgba(160,200,255,0.5)', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
              }}>CANCEL</button>
              <button onClick={initiatePayment} style={{
                flex: 2, padding: 12, background: 'rgba(255,107,53,0.2)', border: '2px solid #ff6b35',
                borderRadius: 8, color: '#ff6b35', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700
              }}>🚑 CONFIRM DISPATCH</button>
            </div>
          </div>
        </div>
      )}

      {bookingStep === 'booked' && selected && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,5,20,0.9)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div style={{ background: '#0a1526', border: '2px solid #00ff88', borderRadius: 16, padding: 32, textAlign: 'center', width: '90%', maxWidth: 380 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🚑</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00ff88', marginBottom: 8 }}>AMBULANCE DISPATCHED!</div>
            <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.7)', lineHeight: 1.6, marginBottom: 20 }}>
              {selected.name} is on the way.<br />
              Estimated arrival: <strong style={{ color: '#ffb800' }}>{selected.responseTime} minutes</strong>
            </div>
            <div style={{ fontSize: 12, color: '#00c8ff', marginBottom: 20 }}>{selected.contact}</div>
            <button onClick={() => { setBookingStep(null); setSelected(null); }} style={{
              width: '100%', padding: 12, background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88',
              borderRadius: 8, color: '#00ff88', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
            }}>DONE</button>
          </div>
        </div>
      )}
    </div>
  );
}
