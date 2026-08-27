import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, MAP_STYLE_LIGHT } from '../config/mapConfig';

mapboxgl.accessToken = MAPBOX_TOKEN;

// Helper to check for valid latitude and longitude
const isValidLatLng = (loc) => {
  if (!loc) return false;
  const lat = loc.lat !== undefined ? loc.lat : loc[0];
  const lng = loc.lng !== undefined ? loc.lng : loc[1];
  return typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);
};

export default function LiveRouteMap({
  routeGeometry,
  ambulancePosition,
  originMarker,
  destinationMarker,
  junctions = [],
  mode = 'driver', // 'driver' | 'hospital' | 'warroom' | 'user'
  theme = 'dark',
  extraAmbulances = {},
  extraHospitals = {},
  hazards = [],
  incidents = [],
  locationHistory = [],
  greenCorridorActive = false,
  routeToPatient = [],
  routeToHospital = []
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  
  // Track dynamically created markers in a dictionary
  const dynamicMarkersRef = useRef({});

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Determine initial center
    let initialCenter = [77.5946, 12.9716]; // Default to Bengaluru
    if (isValidLatLng(ambulancePosition)) {
      initialCenter = [ambulancePosition.lng || ambulancePosition[1], ambulancePosition.lat || ambulancePosition[0]];
    } else if (isValidLatLng(originMarker)) {
      initialCenter = [originMarker.lng || originMarker[1], originMarker.lat || originMarker[0]];
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: theme === 'light' ? MAP_STYLE_LIGHT : MAP_STYLE,
      center: initialCenter,
      zoom: mode === 'warroom' ? 11 : 14,
      pitch: mode === 'warroom' ? 0 : 45,
      antialias: true
    });

    mapRef.current = map;

    map.on('load', () => {
      // 1. Primary Route Layers
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: routeGeometry || { type: 'LineString', coordinates: [] }
        }
      });

      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ff3333',
          'line-width': 8,
          'line-opacity': 0.3
        }
      });

      map.addLayer({
        id: 'route-solid',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ff3333',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // 2. Extra Routes for WarRoom/Hospital (Ambulance-to-Patient & Patient-to-Hospital)
      map.addSource('routeToPatientSrc', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: routeToPatient.map(p => [p[1], p[0]]) }
        }
      });
      map.addLayer({
        id: 'route-patient-layer',
        type: 'line',
        source: 'routeToPatientSrc',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00ff88', 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [2, 2] }
      });

      map.addSource('routeToHospitalSrc', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: routeToHospital.map(p => [p[1], p[0]]) }
        }
      });
      map.addLayer({
        id: 'route-hospital-layer',
        type: 'line',
        source: 'routeToHospitalSrc',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00c8ff', 'line-width': 4, 'line-opacity': 0.8 }
      });

      // 3. Location History Layer
      map.addSource('historySrc', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: locationHistory.map(p => [p.lng || p[1], p.lat || p[0]]) }
        }
      });
      map.addLayer({
        id: 'history-layer',
        type: 'line',
        source: 'historySrc',
        paint: { 'line-color': '#00c8ff', 'line-width': 3, 'line-opacity': 0.5 }
      });

      // Trigger initial markers draw
      updateMarkers();
    });

    return () => {
      map.remove();
    };
  }, []);

  // Sync theme updates
  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.setStyle(theme === 'light' ? MAP_STYLE_LIGHT : MAP_STYLE);
    }
  }, [theme]);

  // Sync primary route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('route');
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: routeGeometry || { type: 'LineString', coordinates: [] }
      });
    }
  }, [routeGeometry]);

  // Sync secondary route lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const srcPat = map.getSource('routeToPatientSrc');
    if (srcPat) {
      srcPat.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeToPatient.map(p => [p[1] || p.lng, p[0] || p.lat]) }
      });
    }

    const srcHosp = map.getSource('routeToHospitalSrc');
    if (srcHosp) {
      srcHosp.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeToHospital.map(p => [p[1] || p.lng, p[0] || p.lat]) }
      });
    }
  }, [routeToPatient, routeToHospital]);

  // Sync history line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('historySrc');
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: locationHistory.map(p => [p.lng || p[1] || p.lng, p.lat || p[0] || p.lat]) }
      });
    }
  }, [locationHistory]);

  // Update all markers
  const updateMarkers = () => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Primary Ambulance Marker
    if (isValidLatLng(ambulancePosition)) {
      const lat = ambulancePosition.lat !== undefined ? ambulancePosition.lat : ambulancePosition[0];
      const lng = ambulancePosition.lng !== undefined ? ambulancePosition.lng : ambulancePosition[1];
      if (!ambulanceMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'mapbox-ambulance-marker';
        el.innerHTML = `<div style="font-size: 26px; transform: rotate(${ambulancePosition.heading || 0}deg); filter: drop-shadow(0 0 8px #ff3333);">🚑</div>`;

        ambulanceMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        ambulanceMarkerRef.current.setLngLat([lng, lat]);
        const inner = ambulanceMarkerRef.current.getElement().querySelector('div');
        if (inner) {
          inner.style.transform = `rotate(${ambulancePosition.heading || 0}deg)`;
        }
      }

      if (mode === 'driver') {
        map.flyTo({ center: [lng, lat], speed: 0.8 });
      }
    } else {
      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.remove();
        ambulanceMarkerRef.current = null;
      }
    }

    // 2. Primary Origin/Patient Marker
    if (isValidLatLng(originMarker)) {
      const lat = originMarker.lat !== undefined ? originMarker.lat : originMarker[0];
      const lng = originMarker.lng !== undefined ? originMarker.lng : originMarker[1];
      if (!originMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 24px; filter: drop-shadow(0 0 6px #ffe600);">🧍</div>';
        originMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        originMarkerRef.current.setLngLat([lng, lat]);
      }
    } else {
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
    }

    // 3. Primary Destination/Hospital Marker
    if (isValidLatLng(destinationMarker)) {
      const lat = destinationMarker.lat !== undefined ? destinationMarker.lat : destinationMarker[0];
      const lng = destinationMarker.lng !== undefined ? destinationMarker.lng : destinationMarker[1];
      if (!destinationMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 26px; filter: drop-shadow(0 0 8px #00ff88);">🏥</div>';
        destinationMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat([lng, lat]);
      }
    } else {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }
    }

    // 4. Dynamic Extra Markers (hospitals, extra ambulances, etc.)
    const nextMarkers = {};

    // render extra ambulances
    Object.entries(extraAmbulances || {}).forEach(([id, amb]) => {
      if (!isValidLatLng(amb.location)) return;
      const key = `amb_${id}`;
      const lat = amb.location.lat !== undefined ? amb.location.lat : amb.location[0];
      const lng = amb.location.lng !== undefined ? amb.location.lng : amb.location[1];
      
      let marker = dynamicMarkersRef.current[key];
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'mapbox-extra-amb-marker';
        el.innerHTML = `<div style="font-size: 20px; opacity: ${amb.available ? 0.9 : 0.5};">🚑</div>`;
        marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div style="color:#fff; background:#060c1c; padding:6px; border-radius:4px; font-size:10px;">
              <strong>${amb.driverName || amb.name || 'Ambulance'}</strong><br/>
              Status: ${amb.available ? '<span style="color:#00ff88">AVAILABLE</span>' : '<span style="color:#ff3333">BUSY</span>'}
            </div>
          `))
          .addTo(map);
      } else {
        marker.setLngLat([lng, lat]);
      }
      nextMarkers[key] = marker;
    });

    // render extra hospitals
    const hospitalsArr = Array.isArray(extraHospitals) ? extraHospitals : Object.values(extraHospitals || {});
    hospitalsArr.forEach((h, idx) => {
      const pos = h.pos || h.location || h;
      if (!isValidLatLng(pos)) return;
      const key = `hosp_${h.id || idx}`;
      const lat = pos.lat !== undefined ? pos.lat : pos[0];
      const lng = pos.lng !== undefined ? pos.lng : pos[1];

      let marker = dynamicMarkersRef.current[key];
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'mapbox-extra-hosp-marker';
        el.innerHTML = '<div style="font-size: 20px;">🏥</div>';
        marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div style="color:#fff; background:#060c1c; padding:6px; border-radius:4px; font-size:10px; min-width:120px;">
              <strong>${h.name || 'Hospital'}</strong><br/>
              ${h.contactInfo ? `Contact: ${h.contactInfo}` : ''}
            </div>
          `))
          .addTo(map);
      } else {
        marker.setLngLat([lng, lat]);
      }
      nextMarkers[key] = marker;
    });

    // render junctions
    junctions.forEach((j, idx) => {
      if (!isValidLatLng(j)) return;
      const key = `junct_${j.id || idx}`;
      const lat = j.lat !== undefined ? j.lat : j[0];
      const lng = j.lng !== undefined ? j.lng : j[1];

      let marker = dynamicMarkersRef.current[key];
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'mapbox-junction-marker';
        
        let color = '#aaa';
        let borderGlow = 'rgba(255,255,255,0.2)';
        if (j.status === 'PRIORITY_REQUESTED') {
          color = '#ffe600';
          borderGlow = 'rgba(255, 230, 0, 0.6)';
        } else if (j.status === 'CORRIDOR_ACTIVE' || j.status === 'CLEARED' || greenCorridorActive) {
          color = '#00ff88';
          borderGlow = 'rgba(0, 255, 136, 0.8)';
        }

        el.innerHTML = `
          <div style="
            width: 14px; height: 14px; border-radius: 50%;
            background: ${color}; border: 2px solid #060c1c;
            box-shadow: 0 0 10px ${borderGlow};
          "></div>
        `;

        marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div style="color: #fff; background: #060c1c; padding: 6px 10px; border-radius: 4px; font-size: 11px;">
              <strong>${j.name || `Junction #${idx + 1}`}</strong><br/>
              Status: <span style="color: ${color}">${j.status || 'ACTIVE'}</span>
            </div>
          `))
          .addTo(map);
      } else {
        marker.setLngLat([lng, lat]);
      }
      nextMarkers[key] = marker;
    });

    // Clean up markers that are no longer needed
    Object.keys(dynamicMarkersRef.current).forEach(key => {
      if (!nextMarkers[key]) {
        dynamicMarkersRef.current[key].remove();
      }
    });
    dynamicMarkersRef.current = nextMarkers;

    // Fit bounds in non-driver mode if multiple points exist
    if (mode !== 'driver') {
      const coords = [];
      if (isValidLatLng(ambulancePosition)) coords.push([ambulancePosition.lng || ambulancePosition[1], ambulancePosition.lat || ambulancePosition[0]]);
      if (isValidLatLng(originMarker)) coords.push([originMarker.lng || originMarker[1], originMarker.lat || originMarker[0]]);
      if (isValidLatLng(destinationMarker)) coords.push([destinationMarker.lng || destinationMarker[1], destinationMarker.lat || destinationMarker[0]]);

      if (coords.length > 1) {
        const bounds = coords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      }
    }
  };

  // Sync marker triggers
  useEffect(() => {
    updateMarkers();
  }, [ambulancePosition, originMarker, destinationMarker, extraAmbulances, extraHospitals, junctions, greenCorridorActive]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, bottom: 0 }} />
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
        zIndex: 10
      }}>
        ℹ️ AI corridor signal integration pending municipal partnership.
      </div>
    </div>
  );
}
