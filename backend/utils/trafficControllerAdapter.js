/**
 * Traffic Controller Adapter Architecture
 *
 * Provides a clean interface between RescueLink Emergency Corridor Coordination Layer
 * and signal controllers.
 *
 * Defaults to CONTROLLER_MODE = 'SIMULATED'.
 * Disclaimed for simulation / demonstration only.
 */

class TrafficControllerAdapter {
  constructor(mode = process.env.CONTROLLER_MODE || 'SIMULATED') {
    this.mode = mode;
    this.simulatedFailures = new Set(); // Junction IDs forced to fail for testing/simulation
  }

  /**
   * Inject or remove simulated failure state for a specific junction (for testing/demo)
   */
  setSimulatedFailure(junctionId, fail = true) {
    if (fail) {
      this.simulatedFailures.add(junctionId);
    } else {
      this.simulatedFailures.delete(junctionId);
    }
  }

  clearSimulatedFailures() {
    this.simulatedFailures.clear();
  }

  /**
   * Request preemption lock for a junction
   */
  async requestPreemption(junction) {
    const jId = junction.junction_id || junction.id;
    if (this.simulatedFailures.has(jId)) {
      return {
        success: false,
        controllerStatus: 'FAILED',
        reason: 'Controller acknowledgement timeout / preemption rejected by local ITS controller node',
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      controllerStatus: 'ACKNOWLEDGED',
      latencyMs: Math.floor(Math.random() * 40) + 15,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Activate preemption green phase on approach
   */
  async activatePreemption(junction) {
    const jId = junction.junction_id || junction.id;
    if (this.simulatedFailures.has(jId)) {
      return {
        success: false,
        controllerStatus: 'FAILED',
        reason: 'Signal state switch failure at controller hardware',
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: true,
      controllerStatus: 'ACTIVE',
      phase: 'PREEMPT_GREEN',
      latencyMs: Math.floor(Math.random() * 35) + 10,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Confirm ambulance has entered/passed passage threshold
   */
  async confirmAmbulancePassage(junction) {
    return {
      success: true,
      controllerStatus: 'PASSAGE_CONFIRMED',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Begin clearing preemption phase after ambulance passage
   */
  async clearPreemption(junction) {
    return {
      success: true,
      controllerStatus: 'CLEARING',
      safetyClearanceSec: 3,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Restore normal traffic signal cycle
   */
  async restoreNormalSignal(junction) {
    return {
      success: true,
      controllerStatus: 'ONLINE',
      mode: 'NORMAL_CYCLE',
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton controller instance
const defaultControllerAdapter = new TrafficControllerAdapter();

module.exports = {
  TrafficControllerAdapter,
  defaultControllerAdapter
};
