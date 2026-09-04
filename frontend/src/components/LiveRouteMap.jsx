import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Helper to check for valid latitude and longitude
const isValidLatLng = (loc) => {
  if (!loc) return false;
  const lat = loc.lat !== undefined ? loc.lat : loc[0];
  const lng = loc.lng !== undefined ? loc.lng : loc[1];
  return typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);
};

const parseLatLng = (loc) => {
  if (!isValidLatLng(loc)) return null;
  const lat = loc.lat !== undefined ? loc.lat : loc[0];
  const lng = loc.lng !== undefined ? loc.lng : loc[1];
  return [lat, lng];
};

export default function LiveRouteMap({
  routeGeometry,
  ambulancePosition,
  originMarker,
  destinationMarker,
  junctions = [],
  mode = 'driver',
  theme = 'dark',
  extraAmbulances = {},
  extraHospitals = {},
  routeToPatient = [],
  routeToHospital = []
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const routeGlowPolylineRef = useRef(null);
  const extraMarkersRef = useRef({});

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Find first valid registered entity for dynamic initial center
    let initialCenter = null;
    if (isValidLatLng(ambulancePosition)) initialCenter = parseLatLng(ambulancePosition);
    else if (isValidLatLng(originMarker)) initialCenter = parseLatLng(originMarker);
    else if (isValidLatLng(destinationMarker)) initialCenter = parseLatLng(destinationMarker);

    if (!initialCenter && extraHospitals && typeof extraHospitals === 'object') {
      const firstHosp = Object.values(extraHospitals).find(h => isValidLatLng(h.location || h.pos || (h.lat && h.lng ? { lat: h.lat, lng: h.lng } : null)));
      if (firstHosp) {
        const hLoc = firstHosp.location || firstHosp.pos || { lat: firstHosp.lat, lng: firstHosp.lng };
        initialCenter = parseLatLng(hLoc);
      }
    }

    if (!initialCenter && extraAmbulances && typeof extraAmbulances === 'object') {
      const firstAmb = Object.values(extraAmbulances).find(a => isValidLatLng(a.location || a.pos || (a.latitude && a.longitude ? { lat: a.latitude, lng: a.longitude } : (a.lat && a.lng ? { lat: a.lat, lng: a.lng } : null))));
      if (firstAmb) {
        const aLoc = firstAmb.location || firstAmb.pos || { lat: firstAmb.latitude || firstAmb.lat, lng: firstAmb.longitude || firstAmb.lng };
        initialCenter = parseLatLng(aLoc);
      }
    }

    if (!initialCenter) initialCenter = [18.5204, 73.8567]; // Pune default center if no entities present

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: theme === 'light' ? '' : 'dark-map-tiles'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Render & Update Route Geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing polylines
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (routeGlowPolylineRef.current) {
      map.removeLayer(routeGlowPolylineRef.current);
      routeGlowPolylineRef.current = null;
    }

    let coords = [];
    if (routeGeometry) {
      let rawList = [];
      if (Array.isArray(routeGeometry)) {
        rawList = routeGeometry;
      } else if (routeGeometry.coordinates && Array.isArray(routeGeometry.coordinates)) {
        rawList = routeGeometry.coordinates.map(c => (Array.isArray(c) ? [c[1], c[0]] : c));
      }

      coords = rawList
        .map(p => parseLatLng(p))
        .filter(p => p !== null && typeof p[0] === 'number' && !isNaN(p[0]) && typeof p[1] === 'number' && !isNaN(p[1]));
    }

    if (coords.length >= 2) {
      try {
        routeGlowPolylineRef.current = L.polyline(coords, {
          color: '#ff3333',
          weight: 10,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        routePolylineRef.current = L.polyline(coords, {
          color: '#ffffff',
          weight: 3,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        map.fitBounds(routePolylineRef.current.getBounds(), { padding: [40, 40] });
      } catch (err) {
        console.warn('[LiveRouteMap] Error rendering polyline bounds:', err);
      }
    } else {
      // Auto-center map on the panel entity position when no route is active
      let targetCenter = null;
      if (mode === 'hospital' && isValidLatLng(destinationMarker)) targetCenter = parseLatLng(destinationMarker);
      else if (mode === 'user' && isValidLatLng(originMarker)) targetCenter = parseLatLng(originMarker);
      else if (mode === 'driver' && isValidLatLng(ambulancePosition)) targetCenter = parseLatLng(ambulancePosition);
      else if (isValidLatLng(ambulancePosition)) targetCenter = parseLatLng(ambulancePosition);
      else if (isValidLatLng(originMarker)) targetCenter = parseLatLng(originMarker);
      else if (isValidLatLng(destinationMarker)) targetCenter = parseLatLng(destinationMarker);

      if (targetCenter) {
        map.setView(targetCenter, 14, { animate: true });
      }
    }
  }, [routeGeometry, ambulancePosition, originMarker, destinationMarker, mode]);

  // 3. Update Markers (Ambulance, Patient, Hospital, Extra Fleet)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Ambulance Marker
    if (isValidLatLng(ambulancePosition)) {
      const pos = parseLatLng(ambulancePosition);
      const heading = ambulancePosition.heading || 0;
      const iconHtml = `<div style="font-size: 28px; transform: rotate(${heading}deg); filter: drop-shadow(0 0 10px #ff3333); text-align: center;">🚑</div>`;
      const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });

      if (!ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current = L.marker(pos, { icon: customIcon }).addTo(map);
      } else {
        ambulanceMarkerRef.current.setLatLng(pos);
        ambulanceMarkerRef.current.setIcon(customIcon);
      }
    }

    // Origin (Patient) Marker
    if (isValidLatLng(originMarker)) {
      const pos = parseLatLng(originMarker);
      const iconHtml = `<div style="font-size: 26px; filter: drop-shadow(0 0 8px #ffb800); text-align: center;">🧍</div>`;
      const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });

      if (!originMarkerRef.current) {
        originMarkerRef.current = L.marker(pos, { icon: customIcon }).addTo(map);
      } else {
        originMarkerRef.current.setLatLng(pos);
      }
    }

    // Destination (Hospital) Marker
    if (isValidLatLng(destinationMarker)) {
      const pos = parseLatLng(destinationMarker);
      const iconHtml = `<div style="font-size: 28px; filter: drop-shadow(0 0 10px #00ff88); text-align: center;">🏥</div>`;
      const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });

      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = L.marker(pos, { icon: customIcon }).addTo(map);
      } else {
        destinationMarkerRef.current.setLatLng(pos);
      }
    }

    // Extra Hospitals
    if (extraHospitals && typeof extraHospitals === 'object') {
      Object.values(extraHospitals).forEach(h => {
        const hLoc = h.location || h.pos || (h.lat && h.lng ? { lat: h.lat, lng: h.lng } : null);
        if (isValidLatLng(hLoc)) {
          const key = `hosp_${h.id || h.name}`;
          const pos = parseLatLng(hLoc);
          const iconHtml = `<div style="font-size: 24px; filter: drop-shadow(0 0 8px #00c8ff); text-align: center;">🏥</div>`;
          const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
          if (!extraMarkersRef.current[key]) {
            const m = L.marker(pos, { icon }).addTo(map);
            m.bindPopup(`<strong style="color:#00c8ff;">🏥 ${h.name}</strong><br/>City: ${h.city || 'Registered Center'}<br/>Beds: ${h.icu_beds || 0} ICU / ${h.total_beds || 0} Total`);
            extraMarkersRef.current[key] = m;
          } else {
            extraMarkersRef.current[key].setLatLng(pos);
          }
        }
      });
    }

    // Extra Ambulances
    if (extraAmbulances && typeof extraAmbulances === 'object') {
      Object.values(extraAmbulances).forEach(a => {
        const aLoc = a.location || a.pos || (a.latitude && a.longitude ? { lat: a.latitude, lng: a.longitude } : (a.lat && a.lng ? { lat: a.lat, lng: a.lng } : null));
        if (isValidLatLng(aLoc)) {
          const key = `amb_${a.id || a.vehicleNo}`;
          const pos = parseLatLng(aLoc);
          const iconHtml = `<div style="font-size: 24px; filter: drop-shadow(0 0 8px #00ff88); text-align: center;">🚑</div>`;
          const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
          if (!extraMarkersRef.current[key]) {
            const m = L.marker(pos, { icon }).addTo(map);
            m.bindPopup(`<strong style="color:#00ff88;">🚑 Unit: ${a.vehicleNo}</strong><br/>Driver: ${a.driverName || 'Paramedic'}<br/>Type: ${a.type || 'ALS'}`);
            extraMarkersRef.current[key] = m;
          } else {
            extraMarkersRef.current[key].setLatLng(pos);
          }
        }
      });
    }
  }, [ambulancePosition, originMarker, destinationMarker, extraAmbulances, extraHospitals]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '350px', background: '#050d1a' }}>
      <style>{`
        .dark-map-tiles {
          filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) !important;
        }
      `}</style>
      <div 
        ref={mapContainerRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          position: 'absolute', 
          top: 0, 
          bottom: 0 
        }} 
      />
      {mode === 'corridor' && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(5, 15, 35, 0.85)',
          border: '1px solid rgba(0, 200, 255, 0.25)',
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: '9px',
          color: '#00c8ff',
          fontFamily: 'monospace',
          zIndex: 1000
        }}>
          ℹ️ AI corridor signal integration active.
        </div>
      )}
    </div>
  );
}
