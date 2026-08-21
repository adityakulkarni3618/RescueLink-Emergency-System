import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { mapTilesCache } from '../utils/IndexedDBBridge';

// Subclass Leaflet L.TileLayer to intercept and cache geographic tile streams
if (typeof window !== 'undefined' && L) {
  L.TileLayer.Offline = L.TileLayer.extend({
    createTile: function (coords, done) {
      const tile = document.createElement('img');
      const url = this.getTileUrl(coords);
      const tileKey = `${coords.z}_${coords.x}_${coords.y}`;

      mapTilesCache.get(tileKey).then(cached => {
        if (cached && cached.base64) {
          tile.src = cached.base64;
          done(null, tile);
        } else {
          // Fetch normally and cache to IndexedDB bridge
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error('Network tile load failed');
              return res.blob();
            })
            .then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = reader.result;
                tile.src = base64;
                mapTilesCache.enqueue({ tileKey, base64 }).catch(() => {});
                done(null, tile);
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              // Graceful fallback placeholder for uncached dead zones
              tile.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" style="background:%230a1020;border:1px solid %2300c8ff22"><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2300c8ff66" font-family="monospace" font-size="10">OFFLINE GRID</text></svg>';
              done(null, tile);
            });
        }
      }).catch(() => {
        tile.src = url;
        done(null, tile);
      });

      return tile;
    }
  });
}

/**
 * Custom React-Leaflet component replacing default TileLayer to cache tiles for offline dead zones.
 */
export default function OfflineTileLayer({ url, attribution }) {
  const map = useMap();

  useEffect(() => {
    if (typeof window === 'undefined' || !L || !L.TileLayer.Offline) return;

    const layer = new L.TileLayer.Offline(url, {
      attribution: attribution || '&copy; OpenStreetMap contributors',
      crossOrigin: true
    });
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, url, attribution]);

  return null;
}
