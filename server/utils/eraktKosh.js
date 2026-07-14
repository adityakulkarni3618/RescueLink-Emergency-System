const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

/**
 * eRaktKosh (National Blood Transfusion Council) integration service.
 * Handles querying nationwide blood banks, stock lookup, dispatch matching, and status tracking.
 */
class ERaktKoshService {
  constructor() {
    this.apiKey = process.env.ERAKTKOSH_API_KEY || 'MOCK_ERAKTKOSH_KEY';
    this.apiUrl = process.env.ERAKTKOSH_API_URL || 'https://mock.eraktkosh.in/api';
    this.isMock = this.apiKey === 'MOCK_ERAKTKOSH_KEY';
  }

  /**
   * Search nearby blood banks by location and blood group.
   */
  async getBloodBanks(lat, lng, radiusKm = 15) {
    if (this.isMock) {
      console.log(`[ERAKTKOSH MOCK] Fetching blood banks near: ${lat}, ${lng} within ${radiusKm}km`);
      // Return beautiful, premium local mock database
      return [
        {
          id: 'BB-001',
          name: 'Red Cross Society Blood Bank',
          phone: '+919845012345',
          lat: Number(lat) + 0.012,
          lng: Number(lng) - 0.008,
          emergency24x7: true,
          inventory: {
            'O-': 12, 'O+': 20, 'A-': 0, 'A+': 15, 'B-': 2, 'B+': 18, 'AB-': 1, 'AB+': 8
          }
        },
        {
          id: 'BB-002',
          name: 'Metro City Hospital Blood Center',
          phone: '+919886054321',
          lat: Number(lat) - 0.009,
          lng: Number(lng) + 0.015,
          emergency24x7: true,
          inventory: {
            'O-': 0, 'O+': 8, 'A-': 5, 'A+': 10, 'B-': 6, 'B+': 12, 'AB-': 0, 'AB+': 4
          }
        },
        {
          id: 'BB-003',
          name: 'Govt General Hospital Blood Bank',
          phone: '+919448099887',
          lat: Number(lat) + 0.005,
          lng: Number(lng) + 0.002,
          emergency24x7: false,
          inventory: {
            'O-': 3, 'O+': 25, 'A-': 1, 'A+': 30, 'B-': 0, 'B+': 22, 'AB-': 2, 'AB+': 15
          }
        }
      ];
    }

    try {
      const response = await axios.get(`${this.apiUrl}/blood-banks/search`, {
        params: {
          apiKey: this.apiKey,
          latitude: lat,
          longitude: lng,
          radius: radiusKm
        }
      });
      return response.data;
    } catch (err) {
      console.error('[ERAKTKOSH ERROR] Failed to fetch blood banks:', err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Dispatch blood units to a destination hospital.
   */
  async requestDispatch(bloodBankId, bloodType, unitsCount, destinationHospitalId) {
    if (this.isMock) {
      console.log(`[ERAKTKOSH MOCK] Blood dispatch requested: ${unitsCount} units of ${bloodType} from ${bloodBankId} to ${destinationHospitalId}`);
      return {
        dispatchId: `DISPATCH-RL-${Date.now()}`,
        status: 'DISPATCHED',
        bloodBankId,
        bloodType,
        unitsCount,
        destinationHospitalId,
        etaMins: 12,
        courierMobile: '+919900887766'
      };
    }

    try {
      const response = await axios.post(`${this.apiUrl}/dispatch/request`, {
        apiKey: this.apiKey,
        bloodBankId,
        bloodType,
        unitsCount,
        destinationHospitalId
      });
      return response.data;
    } catch (err) {
      console.error('[ERAKTKOSH ERROR] Dispatch request failed:', err.response?.data || err.message);
      throw err;
    }
  }
}

module.exports = new ERaktKoshService();
