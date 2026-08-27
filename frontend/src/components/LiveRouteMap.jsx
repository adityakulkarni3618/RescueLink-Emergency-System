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
    } else if (isValidLatLng(destinationMarker)) {
      initialCenter = [destinationMarker.lng || destinationMarker[1], destinationMarker.lat || destinationMarker[0]];
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: theme === 'light' ? MAP_STYLE_LIGHT : MAP_STYLE,
      center: initialCenter,
      zoom: 14,
      pitch: mode === 'corridor' ? 45 : 0,
      bearing: 0
    });

    mapRef.current = map;

    map.on('load', () => {
      // 1. Primary Route Layer
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: routeGeometry || { type: 'LineString', coordinates: [] }
        }
      });
      
      map.addLayer({
        id: 'route-line-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ff3333', 'line-width': 10, 'line-opacity': 0.3 }
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.95 }
      });

      // 2. Secondary Route Layers (to Patient, to Hospital)
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

      updateMarkers();
    });

    return () => {
      map.remove();
    };
  }, []);

  const updateMarkers = () => {
    const map = mapRef.current;
    if (!map) return;

    if (isValidLatLng(ambulancePosition)) {
      const lat = ambulancePosition.lat !== undefined ? ambulancePosition.lat : ambulancePosition[0];
      const lng = ambulancePosition.lng !== undefined ? ambulancePosition.lng : ambulancePosition[1];
      if (!ambulanceMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="font-size: 26px; transform: rotate(${ambulancePosition.heading || 0}deg); filter: drop-shadow(0 0 8px #ff3333);">🚑</div>`;
        ambulanceMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      } else {
        ambulanceMarkerRef.current.setLngLat([lng, lat]);
      }
    }

    if (isValidLatLng(originMarker)) {
      const lat = originMarker.lat !== undefined ? originMarker.lat : originMarker[0];
      const lng = originMarker.lng !== undefined ? originMarker.lng : originMarker[1];
      if (!originMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 24px;">🧍</div>';
        originMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      }
    }

    if (isValidLatLng(destinationMarker)) {
      const lat = destinationMarker.lat !== undefined ? destinationMarker.lat : destinationMarker[0];
      const lng = destinationMarker.lng !== undefined ? destinationMarker.lng : destinationMarker[1];
      if (!destinationMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = '<div style="font-size: 26px;">🏥</div>';
        destinationMarkerRef.current = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      }
    }
  };

  useEffect(() => {
    updateMarkers();
  }, [ambulancePosition, originMarker, destinationMarker, extraAmbulances, extraHospitals, junctions, greenCorridorActive]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '350px' }}>
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
          zIndex: 10
        }}>
          ℹ️ AI corridor signal integration pending municipal partnership.
        </div>
      )}
    </div>
  );
}
