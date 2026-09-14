/**
 * RoutingProvider Architecture
 *
 * Provider abstraction for emergency routing engines.
 * Implementations:
 *  - MapboxRoutingProvider (Mapbox Directions API with live traffic)
 *  - OSRMRoutingProvider (Self-hosted or Public OSRM routing engine)
 *  - OpenRouteServiceProvider (OpenRouteService API)
 *  - FallbackRoutingProvider (Haversine straight-line interpolation)
 */

const { getRealRoute } = require('../services/routing');
const { getSmartRoute, getSmartRouteObjects, getETA, haversineDistance } = require('./osrmService');

class RoutingProvider {
  /**
   * Main unified route calculation method.
   */
  static async calculateRoute(origin, destination) {
    if (!origin || !destination || origin.lat === undefined || destination.lat === undefined) {
      return {
        waypoints: [],
        distanceKm: 0,
        etaMinutes: 0,
        source: 'ESTIMATION',
        status: 'UNAVAILABLE',
        reason: 'Invalid origin or destination coordinates'
      };
    }

    // 1. Try Mapbox if token is configured
    if (process.env.MAPBOX_TOKEN) {
      try {
        const mapboxRoute = await getRealRoute(origin.lat, origin.lng, destination.lat, destination.lng);
        if (mapboxRoute && mapboxRoute.geometry && mapboxRoute.geometry.coordinates) {
          const waypoints = mapboxRoute.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
          return {
            waypoints,
            distanceKm: parseFloat((mapboxRoute.distanceMeters / 1000).toFixed(2)),
            etaMinutes: parseFloat((mapboxRoute.durationSeconds / 60).toFixed(1)),
            steps: mapboxRoute.steps || [],
            provider: 'Mapbox',
            source: 'LIVE',
            status: 'LIVE'
          };
        }
      } catch (err) {
        console.warn('[ROUTING PROVIDER] Mapbox failed, trying secondary engines:', err.message);
      }
    }

    // 2. Try Smart OSRM / ORS
    try {
      const waypoints = await getSmartRouteObjects(origin, destination);
      const etaData = await getETA(origin.lat, origin.lng, destination.lat, destination.lng);

      if (waypoints && waypoints.length > 0) {
        const isFallback = process.env.OSRM_ROUTER_URL ? false : true;
        return {
          waypoints,
          distanceKm: etaData ? etaData.distanceKm : 0,
          etaMinutes: etaData ? etaData.etaMinutes : 0,
          provider: process.env.OSRM_ROUTER_URL ? 'Self-Hosted OSRM' : 'Public OSRM / ORS',
          source: isFallback ? 'ESTIMATED' : 'LIVE',
          status: 'ESTIMATED'
        };
      }
    } catch (err) {
      console.warn('[ROUTING PROVIDER] OSRM/ORS failed, using straight-line fallback:', err.message);
    }

    // 3. Fallback
    const steps = 15;
    const waypoints = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      waypoints.push({
        lat: origin.lat + (destination.lat - origin.lat) * ratio,
        lng: origin.lng + (destination.lng - origin.lng) * ratio
      });
    }

    const distKm = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    return {
      waypoints,
      distanceKm: parseFloat(distKm.toFixed(2)),
      etaMinutes: parseFloat((distKm / 40 * 60).toFixed(1)),
      provider: 'Haversine Fallback Engine',
      source: 'ESTIMATED',
      status: 'ESTIMATED'
    };
  }
}

module.exports = {
  RoutingProvider
};
