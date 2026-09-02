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

    let initialCenter = [12.9716, 77.5946]; // Default Bengaluru [lat, lng]
    if (isValidLatLng(ambulancePosition)) {
      initialCenter = parseLatLng(ambulancePosition);
    } else if (isValidLatLng(originMarker)) {
      initialCenter = parseLatLng(originMarker);
    } else if (isValidLatLng(destinationMarker)) {
      initialCenter = parseLatLng(destinationMarker);
    }

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd'
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
    if (routeGeometry && routeGeometry.coordinates) {
      coords = routeGeometry.coordinates.map(c => [c[1], c[0]]); // GeoJSON [lng, lat] -> Leaflet [lat, lng]
    } else if (Array.isArray(routeGeometry)) {
      coords = routeGeometry.map(p => parseLatLng(p)).filter(Boolean);
    }

    if (coords.length > 0) {
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
    }
  }, [routeGeometry]);

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
        if (isValidLatLng(h.location)) {
          const key = `hosp_${h.id || h.name}`;
          if (!extraMarkersRef.current[key]) {
            const pos = parseLatLng(h.location);
            const iconHtml = `<div style="font-size: 22px; filter: drop-shadow(0 0 6px #00c8ff); text-align: center;">🏥</div>`;
            const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
            extraMarkersRef.current[key] = L.marker(pos, { icon }).addTo(map);
          }
        }
      });
    }

    // Extra Ambulances
    if (extraAmbulances && typeof extraAmbulances === 'object') {
      Object.values(extraAmbulances).forEach(a => {
        if (isValidLatLng(a.location)) {
          const key = `amb_${a.id || a.vehicleNo}`;
          const pos = parseLatLng(a.location);
          const iconHtml = `<div style="font-size: 22px; filter: drop-shadow(0 0 6px #00ff88); text-align: center;">🚑</div>`;
          const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
          if (!extraMarkersRef.current[key]) {
            extraMarkersRef.current[key] = L.marker(pos, { icon }).addTo(map);
          } else {
            extraMarkersRef.current[key].setLatLng(pos);
          }
        }
      });
    }
  }, [ambulancePosition, originMarker, destinationMarker, extraAmbulances, extraHospitals]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '350px', background: '#050d1a' }}>
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
