import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default leaflet icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Safe lat/lng checker
const isValidCoord = (pt) => {
  if (!pt) return false;
  return typeof pt.lat === 'number' && !isNaN(pt.lat) && typeof pt.lng === 'number' && !isNaN(pt.lng);
};

// Map controller to sync camera bounds and zoom
function MapViewController({ ambulancePosition, originMarker, destinationMarker, mode }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const coords = [];
    if (isValidCoord(ambulancePosition)) {
      coords.push([ambulancePosition.lat, ambulancePosition.lng]);
    }
    if (isValidCoord(originMarker)) {
      coords.push([originMarker.lat, originMarker.lng]);
    }
    if (isValidCoord(destinationMarker)) {
      coords.push([destinationMarker.lat, destinationMarker.lng]);
    }

    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [40, 40], maxZoom: 16 });
    } else if (coords.length === 1) {
      map.setView(coords[0], 14);
    }
  }, [map, ambulancePosition, originMarker, destinationMarker, mode]);

  return null;
}

export default function LiveRouteMap({
  routeGeometry,
  ambulancePosition,
  originMarker,
  destinationMarker,
  junctions = [],
  mode = 'driver' // 'driver' | 'hospital' | 'warroom'
}) {
  // Parse route geometry coordinates into [lat, lng] array for Leaflet Polyline
  let polylineCoords = [];
  if (routeGeometry && Array.isArray(routeGeometry.coordinates)) {
    polylineCoords = routeGeometry.coordinates
      .map(coord => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lat = coord[1];
        const lng = coord[0];
        if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
          return [lat, lng];
        }
        return null;
      })
      .filter(c => c !== null);
  }

  // Create custom icons using DivIcon for beautiful, token-free, glowing markers
  const getAmbulanceIcon = (heading = 0) => {
    return new L.DivIcon({
      className: 'custom-leaflet-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div style="font-size: 26px; transform: rotate(${heading}deg); filter: drop-shadow(0 0 8px #ff3333); display: flex; align-items: center; justify-content: center;">🚑</div>`
    });
  };

  const patientIcon = new L.DivIcon({
    className: 'custom-leaflet-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="font-size: 24px; filter: drop-shadow(0 0 6px #ffe600); display: flex; align-items: center; justify-content: center;">🧍</div>`
  });

  const hospitalIcon = new L.DivIcon({
    className: 'custom-leaflet-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="font-size: 26px; filter: drop-shadow(0 0 8px #00ff88); display: flex; align-items: center; justify-content: center;">🏥</div>`
  });

  const getJunctionIcon = (status) => {
    let color = '#aaa';
    let borderGlow = 'rgba(255,255,255,0.2)';
    if (status === 'PRIORITY_REQUESTED' || status === 'PREEMPTING') {
      color = '#ffe600';
      borderGlow = 'rgba(255, 230, 0, 0.6)';
    } else if (status === 'CORRIDOR_ACTIVE' || status === 'ACTIVE') {
      color = '#00ff88';
      borderGlow = 'rgba(0, 255, 136, 0.8)';
    }
    return new L.DivIcon({
      className: 'custom-leaflet-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2px solid #060c1c; box-shadow: 0 0 10px ${borderGlow};"></div>`
    });
  };

  // Safe initial center
  const initialCenter = isValidCoord(ambulancePosition)
    ? [ambulancePosition.lat, ambulancePosition.lng]
    : [12.9716, 77.5946];

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%', 
      minHeight: '300px',
      overflow: 'hidden',
      background: '#040814'
    }}>
      <MapContainer
        center={initialCenter}
        zoom={14}
        style={{ 
          width: '100%', 
          height: '120%', // slightly taller to compensate for tilt clipping
          position: 'absolute', 
          top: '-10%', 
          bottom: 0,
          transform: 'perspective(1000px) rotateX(28deg) translateY(20px)',
          transformOrigin: 'center bottom',
          background: '#040814'
        }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">Carto</a>'
        />

        <MapViewController
          ambulancePosition={ambulancePosition}
          originMarker={originMarker}
          destinationMarker={destinationMarker}
          mode={mode}
        />

        {/* Triple-layer polyline for neon tube light glow effect */}
        {polylineCoords.length > 0 && (
          <>
            <Polyline
              positions={polylineCoords}
              pathOptions={{ color: '#ff1a1a', weight: 16, opacity: 0.15, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={polylineCoords}
              pathOptions={{ color: '#ff3333', weight: 8, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={polylineCoords}
              pathOptions={{ color: '#ffffff', weight: 3, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
          </>
        )}

        {/* Origin / Patient Marker */}
        {isValidCoord(originMarker) && (
          <Marker position={[originMarker.lat, originMarker.lng]} icon={patientIcon}>
            <Popup>
              <div style={{ color: '#fff', background: '#060c1c', padding: '6px', borderRadius: '4px' }}>
                <strong>Patient Location</strong>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination / Hospital Marker */}
        {isValidCoord(destinationMarker) && (
          <Marker position={[destinationMarker.lat, destinationMarker.lng]} icon={hospitalIcon}>
            <Popup>
              <div style={{ color: '#fff', background: '#060c1c', padding: '6px', borderRadius: '4px' }}>
                <strong>Hospital Destination</strong>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Ambulance Marker */}
        {isValidCoord(ambulancePosition) && (
          <Marker
            position={[ambulancePosition.lat, ambulancePosition.lng]}
            icon={getAmbulanceIcon(ambulancePosition.heading || 0)}
          >
            <Popup>
              <div style={{ color: '#fff', background: '#060c1c', padding: '6px', borderRadius: '4px' }}>
                <strong>Ambulance</strong>
              </div>
            </Popup>
          </Marker>
        )}

        {/* AI Corridor Junction Markers */}
        {junctions.map((j, idx) => {
          if (!j.lat || !j.lng) return null;
          return (
            <Marker
              key={j.id || idx}
              position={[j.lat, j.lng]}
              icon={getJunctionIcon(j.status)}
            >
              <Popup>
                <div style={{ color: '#fff', background: '#060c1c', padding: '6px 10px', borderRadius: '4px', fontFamily: 'sans-serif', fontSize: '11px' }}>
                  <strong>{j.name || 'Junction'}</strong><br />
                  Status: <span style={{ color: j.status === 'CORRIDOR_ACTIVE' ? '#00ff88' : '#ffe600' }}>{j.status}</span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Partnership Disclaimer */}
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
        ℹ️ AI corridor signal integration pending municipal partnership.
      </div>
    </div>
  );
}
