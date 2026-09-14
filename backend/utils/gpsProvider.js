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

    return {
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      timestamp: lastTimestamp,
      speed: data.speed !== undefined ? parseFloat(data.speed) : 0,
      heading: data.heading !== undefined ? parseFloat(data.heading) : 0,
      accuracy: data.accuracy !== undefined ? parseFloat(data.accuracy) : 5,
      source: data.source || (this.type === 'REAL' ? 'GPS' : (this.type === 'MOBILE' ? 'DEVICE' : 'SIMULATOR')),
      status: isStale ? 'STALE' : status
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
        speed: 0,
        heading: 0,
        accuracy: null,
        source: 'GPS',
        status: 'UNAVAILABLE'
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
        speed: 0,
        heading: 0,
        accuracy: null,
        source: 'DEVICE',
        status: 'UNAVAILABLE'
      };
    }

    return this.formatTelemetry({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: pos.timestamp || Date.now(),
      speed: pos.coords.speed || 0,
      heading: pos.coords.heading || 0,
      accuracy: pos.coords.accuracy || 10,
      source: 'DEVICE',
      status: 'LIVE'
    });
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
