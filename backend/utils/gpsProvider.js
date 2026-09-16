/**
 * GPSProvider Architecture
 *
 * Provider abstraction for sourcing telemetry locations across RescueLink.
 * Implementations:
 *  - RealGPSProvider (hardware / vehicle IoT gateway)
 *  - MobileBrowserGPSProvider (HTML5 Geolocation API from paramedic mobile client)
 *  - SimulatorGPSProvider (deterministic route/corridor simulation engine)
 */

class GPSProvider {
  constructor(type = 'SIMULATOR') {
    this.type = type;
  }

  /**
   * Format standard telemetry payload with explicit truth-source and status metadata.
   */
  formatTelemetry(data) {
    const now = Date.now();
    const lastTimestamp = data.timestamp || now;
    const isStale = (now - lastTimestamp) > 15000;

    let status = data.status;
    if (!status) {
      if (isStale) {
        status = 'STALE';
      } else if (this.type === 'REAL' || this.type === 'MOBILE') {
        status = 'LIVE';
      } else {
        status = 'SIMULATED';
      }
    }

    const defaultSource = this.type === 'REAL' ? 'GPS' : (this.type === 'MOBILE' ? 'MOBILE_BROWSER_GPS' : 'SIMULATOR');

    return {
      latitude: data.latitude !== null && data.latitude !== undefined ? parseFloat(data.latitude) : null,
      longitude: data.longitude !== null && data.longitude !== undefined ? parseFloat(data.longitude) : null,
      timestamp: lastTimestamp,
      speed: data.speed !== undefined && data.speed !== null && !isNaN(data.speed) ? parseFloat(data.speed) : null,
      heading: data.heading !== undefined && data.heading !== null && !isNaN(data.heading) ? parseFloat(data.heading) : null,
      accuracy: data.accuracy !== undefined && data.accuracy !== null && !isNaN(data.accuracy) ? parseFloat(data.accuracy) : null,
      source: data.source || defaultSource,
      status: isStale ? 'STALE' : status,
      provenance: (this.type === 'REAL' || this.type === 'MOBILE') ? 'REAL' : 'SIMULATED'
    };
  }
}

class RealGPSProvider extends GPSProvider {
  constructor() {
    super('REAL');
  }

  processHardwareFix(fix) {
    if (!fix || fix.lat === undefined || fix.lng === undefined) {
      return {
        latitude: null,
        longitude: null,
        timestamp: Date.now(),
        speed: null,
        heading: null,
        accuracy: null,
        source: 'GPS',
        status: 'UNAVAILABLE',
        provenance: 'REAL'
      };
    }

    return this.formatTelemetry({
      latitude: fix.lat,
      longitude: fix.lng,
      timestamp: fix.timestamp || Date.now(),
      speed: fix.speed,
      heading: fix.heading,
      accuracy: fix.accuracy,
      source: 'GPS',
      status: 'LIVE'
    });
  }
}

class MobileBrowserGPSProvider extends GPSProvider {
  constructor() {
    super('MOBILE');
  }

  processBrowserPosition(pos) {
    if (!pos || !pos.coords) {
      return {
        latitude: null,
        longitude: null,
        timestamp: Date.now(),
        speed: null,
        heading: null,
        accuracy: null,
        source: 'MOBILE_BROWSER_GPS',
        status: 'UNAVAILABLE',
        provenance: 'REAL'
      };
    }

    return this.formatTelemetry({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: pos.timestamp || Date.now(),
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      accuracy: pos.coords.accuracy,
      source: 'MOBILE_BROWSER_GPS',
      status: 'LIVE'
    });
  }

  processBrowserError(err, lastFix = null) {
    const now = Date.now();
    let status = 'UNAVAILABLE';
    let errorMessage = 'GPS unavailable';

    if (err && err.code === 1) { // PERMISSION_DENIED
      status = 'UNAVAILABLE';
      errorMessage = 'Location permission is required for live ambulance tracking. Please enable location permission for this browser.';
    } else if (err && err.code === 2) { // POSITION_UNAVAILABLE
      status = lastFix ? 'STALE' : 'UNAVAILABLE';
      errorMessage = 'GPS position unavailable. Ensure device location service is active.';
    } else if (err && err.code === 3) { // TIMEOUT
      if (lastFix && (now - lastFix.timestamp) <= 15000) {
        status = 'LIVE';
      } else {
        status = lastFix ? 'STALE' : 'UNAVAILABLE';
      }
      errorMessage = 'GPS fix request timed out.';
    }

    return {
      latitude: lastFix ? lastFix.latitude : null,
      longitude: lastFix ? lastFix.longitude : null,
      timestamp: lastFix ? lastFix.timestamp : now,
      speed: lastFix ? lastFix.speed : null,
      heading: lastFix ? lastFix.heading : null,
      accuracy: lastFix ? lastFix.accuracy : null,
      source: 'MOBILE_BROWSER_GPS',
      status,
      provenance: 'REAL',
      error: errorMessage
    };
  }
}

class SimulatorGPSProvider extends GPSProvider {
  constructor() {
    super('SIMULATOR');
  }

  generateSimulatedFix(lat, lng, speed = 40, heading = 90) {
    return this.formatTelemetry({
      latitude: lat,
      longitude: lng,
      timestamp: Date.now(),
      speed,
      heading,
      accuracy: 3,
      source: 'SIMULATOR',
      status: 'SIMULATED'
    });
  }
}

module.exports = {
  GPSProvider,
  RealGPSProvider,
  MobileBrowserGPSProvider,
  SimulatorGPSProvider
};
