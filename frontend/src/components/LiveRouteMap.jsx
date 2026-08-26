import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set public token from process env
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || "pk.eyJ1IjoiYWxleGFuZGVyLWNvZGVyIiwiYSI6ImNsdzd4djh6YjB5dTkya3FlcWhtYjBjdW4ifQ.p5vWp1869O7m8zK4KkhiGTw";
mapboxgl.accessToken = MAPBOX_TOKEN;

export default function LiveRouteMap({
  routeGeometry,
  ambulancePosition,
  originMarker,
  destinationMarker,
  junctions = [],
  mode = 'driver' // 'driver' | 'hospital' | 'warroom'
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const junctionMarkersRef = useRef([]);

  useEffect(() => {
    // Initialize Mapbox map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Glowing futuristic dark style
    const initialCenter = ambulancePosition && typeof ambulancePosition.lng === 'number' && !isNaN(ambulancePosition.lng) && typeof ambulancePosition.lat === 'number' && !isNaN(ambulancePosition.lat)
      ? [ambulancePosition.lng, ambulancePosition.lat]
      : [77.5946, 12.9716];

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Glowing futuristic dark style
      center: initialCenter,
      zoom: 14,
      pitch: 45, // futuristic 3D perspective angle
      antialias: true
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add a source and layer for the glowing route line
      if (routeGeometry) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: routeGeometry
          }
        });

        // Glowing outer route layer
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ff3333',
            'line-width': 8,
            'line-opacity': 0.3
          }
        });

        // Solid inner route layer
        map.addLayer({
          id: 'route-solid',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ff3333',
            'line-width': 4,
            'line-opacity': 0.9
          }
        });
      }
    });

    return () => {
      map.remove();
    };
  }, []);

  // Sync route line updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('route');
    if (source && routeGeometry) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: routeGeometry
      });
    } else if (!source && routeGeometry && map.loaded()) {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: routeGeometry
        }
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ff3333', 'line-width': 8, 'line-opacity': 0.3 }
      });
      map.addLayer({
        id: 'route-solid',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ff3333', 'line-width': 4, 'line-opacity': 0.9 }
      });
    }
  }, [routeGeometry]);

  // Sync Markers and Camera Position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Ambulance Marker
    if (ambulancePosition && typeof ambulancePosition.lng === 'number' && !isNaN(ambulancePosition.lng) && typeof ambulancePosition.lat === 'number' && !isNaN(ambulancePosition.lat)) {
      if (!ambulanceMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'mapbox-ambulance-marker';
        el.innerHTML = `<div style="font-size: 26px; transform: rotate(${ambulancePosition.heading || 0}deg); filter: drop-shadow(0 0 8px #ff3333);">🚑</div>`;

        ambulanceMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([ambulancePosition.lng, ambulancePosition.lat])
          .addTo(map);
      } else {
        ambulanceMarkerRef.current.setLngLat([ambulancePosition.lng, ambulancePosition.lat]);
        const inner = ambulanceMarkerRef.current.getElement().querySelector('div');
        if (inner) {
          inner.style.transform = `rotate(${ambulancePosition.heading || 0}deg)`;
        }
      }

      // Camera auto-follow in Driver Mode
      if (mode === 'driver') {
        map.flyTo({
          center: [ambulancePosition.lng, ambulancePosition.lat],
          speed: 0.8
        });
      }
    }

    // 2. Origin/Patient Marker
    if (originMarker && typeof originMarker.lng === 'number' && !isNaN(originMarker.lng) && typeof originMarker.lat === 'number' && !isNaN(originMarker.lat)) {
      if (!originMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 24px; filter: drop-shadow(0 0 6px #ffe600);">🧍</div>';
        originMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([originMarker.lng, originMarker.lat])
          .addTo(map);
      } else {
        originMarkerRef.current.setLngLat([originMarker.lng, originMarker.lat]);
      }
    }

    // 3. Destination/Hospital Marker
    if (destinationMarker && typeof destinationMarker.lng === 'number' && !isNaN(destinationMarker.lng) && typeof destinationMarker.lat === 'number' && !isNaN(destinationMarker.lat)) {
      if (!destinationMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 26px; filter: drop-shadow(0 0 8px #00ff88);">🏥</div>';
        destinationMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([destinationMarker.lng, destinationMarker.lat])
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat([destinationMarker.lng, destinationMarker.lat]);
      }
    }

    // Camera fitting bounds in Hospital or War Room modes
    if (mode !== 'driver') {
      const coords = [];
      if (ambulancePosition && typeof ambulancePosition.lng === 'number' && !isNaN(ambulancePosition.lng) && typeof ambulancePosition.lat === 'number' && !isNaN(ambulancePosition.lat)) {
        coords.push([ambulancePosition.lng, ambulancePosition.lat]);
      }
      if (originMarker && typeof originMarker.lng === 'number' && !isNaN(originMarker.lng) && typeof originMarker.lat === 'number' && !isNaN(originMarker.lat)) {
        coords.push([originMarker.lng, originMarker.lat]);
      }
      if (destinationMarker && typeof destinationMarker.lng === 'number' && !isNaN(destinationMarker.lng) && typeof destinationMarker.lat === 'number' && !isNaN(destinationMarker.lat)) {
        coords.push([destinationMarker.lng, destinationMarker.lat]);
      }

      if (coords.length > 1) {
        const bounds = coords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      }
    }
  }, [ambulancePosition, originMarker, destinationMarker, mode]);

  // Sync AI Corridor Junction Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old junction markers
    junctionMarkersRef.current.forEach(m => m.remove());
    junctionMarkersRef.current = [];

    // Render new junctions
    junctions.forEach(j => {
      if (!j.lat || !j.lng) return;

      const el = document.createElement('div');
      el.className = 'mapbox-junction-marker';
      
      let color = '#aaa';
      let borderGlow = 'rgba(255,255,255,0.2)';
      if (j.status === 'PRIORITY_REQUESTED') {
        color = '#ffe600';
        borderGlow = 'rgba(255, 230, 0, 0.6)';
      } else if (j.status === 'CORRIDOR_ACTIVE') {
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

      const marker = new mapboxgl.Marker(el)
        .setLngLat([j.lng, j.lat])
        .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
          <div style="color: #fff; background: #060c1c; padding: 6px 10px; border-radius: 4px; font-family: sans-serif; font-size: 11px;">
            <strong>${j.name || 'Junction'}</strong><br/>
            Status: <span style="color: ${color}">${j.status}</span>
          </div>
        `))
        .addTo(map);

      junctionMarkersRef.current.push(marker);
    });
  }, [junctions]);

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
