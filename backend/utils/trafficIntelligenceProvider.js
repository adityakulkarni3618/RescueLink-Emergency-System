/**
 * TrafficIntelligenceProvider Architecture
 *
 * Provider abstraction for traffic incident and obstruction detection.
 * Implementations:
 *  - MunicipalAPIProvider (City Traffic Control Department Incident Feed)
 *  - TrafficAPIProvider (Third-party traffic incident feed API)
 *  - OperatorReportedProvider (Manual obstruction reported by control room operator)
 *  - SimulatorTrafficProvider (Simulated traffic incident engine for corridors)
 */

class TrafficIntelligenceProvider {
  static formatIncident(eventData, source = 'SIMULATOR') {
    return {
      incidentId: eventData.incidentId || `INC-${Date.now()}`,
      corridorId: eventData.corridorId || null,
      segmentIndex: eventData.segmentIndex !== undefined ? eventData.segmentIndex : 0,
      severity: eventData.severity || 'HIGH',
      description: eventData.description || 'Road obstruction reported ahead',
      location: eventData.location || { lat: 0, lng: 0 },
      source: source,
      status: (source === 'MUNICIPAL_API' || source === 'TRAFFIC_PROVIDER' || source === 'OPERATOR') ? 'LIVE' : 'SIMULATED',
      timestamp: new Date().toISOString()
    };
  }
}

class MunicipalAPIProvider extends TrafficIntelligenceProvider {
  static processFeed(event) {
    if (!event) return null;
    return this.formatIncident(event, 'MUNICIPAL_API');
  }
}

class OperatorReportedProvider extends TrafficIntelligenceProvider {
  static processReport(event) {
    if (!event) return null;
    return this.formatIncident(event, 'OPERATOR');
  }
}

class SimulatorTrafficProvider extends TrafficIntelligenceProvider {
  static createSimulatedObstruction(corridorId, segmentIndex = 1) {
    return this.formatIncident({
      incidentId: `SIM-OBST-${corridorId}-${Date.now()}`,
      corridorId,
      segmentIndex,
      severity: 'CRITICAL',
      description: 'Simulated multi-vehicle accident blocking primary corridor lane'
    }, 'SIMULATOR');
  }
}

module.exports = {
  TrafficIntelligenceProvider,
  MunicipalAPIProvider,
  OperatorReportedProvider,
  SimulatorTrafficProvider
};
