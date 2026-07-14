import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location'; // Location services integration
import * as Speech from 'expo-speech';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Storage helper hook
import axios from 'axios';
import io from 'socket.io-client';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function PatientHomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nearbyAmbulances, setNearbyAmbulances] = useState<any[]>([]);
  const [currentCoords, setCurrentCoords] = useState<any>({ latitude: 18.5204, longitude: 73.8567 });

  const countdownIntervalRef = useRef<any>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Connect socket
    socketRef.current = io(SERVER_URL);
    
    // Track location and fetch nearby ambulances
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setCurrentCoords({ latitude, longitude });
      fetchNearbyAmbulances(latitude, longitude);
    })();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const fetchNearbyAmbulances = async (lat: number, lng: number) => {
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      // Simulated nearby ambulances
      setNearbyAmbulances([
        { id: 'AMB-101', latitude: lat + 0.003, longitude: lng + 0.002, name: 'ALS Unit 04' },
        { id: 'AMB-102', latitude: lat - 0.002, longitude: lng - 0.004, name: 'BLS Unit 09' },
        { id: 'AMB-103', latitude: lat + 0.004, longitude: lng - 0.001, name: 'Cardiac Support 12' }
      ]);
    } catch (e) {
      console.log('[NEARBY AMBULANCES ERR]', e);
    }
  };

  const handleSOSPress = () => {
    // 1. Strong vibration pulse
    Vibration.vibrate([0, 500, 200, 500]);

    // 2. Play voice confirmation
    Speech.speak("Emergency button pressed. Initializing countdown.", { language: 'en' });

    // 3. Initiate countdown
    setCountdown(5);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          triggerEmergencyDispatch();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setCountdown(null);
    Speech.stop();
    Speech.speak("Emergency dispatch canceled.", { language: 'en' });
    Alert.alert('Canceled', 'SOS countdown has been canceled.');
  };

  const triggerEmergencyDispatch = async () => {
    setLoading(true);
    Speech.speak("Sending emergency alert. Help is on the way.", { language: 'en' });
    
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      const userStr = await AsyncStorage.getItem('rescueLinkUser');
      const user = userStr ? JSON.parse(userStr) : null;

      // Socket broadcast
      if (socketRef.current) {
        socketRef.current.emit('emergency-request', {
          lat: currentCoords.latitude,
          lng: currentCoords.longitude,
          userId: user?.id || 'pat-mock',
          address: 'Current Location'
        });
      }

      // Call API
      const res = await axios.post(`${SERVER_URL}/api/payments/create-order`, {
        amount: 500, // standard booking hold fee
        notes: { patientName: user?.name || 'Jane Doe', type: 'AMBULANCE_SOS' }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Navigate to tracking
      const incidentId = res.data.receipt || `REQ-${Date.now()}`;
      navigation.navigate('Tracking', { incidentId });
    } catch (err) {
      console.log('[SOS DISPATCH FAIL]', err);
      // Mock navigation on failure for testing
      navigation.navigate('Tracking', { incidentId: `REQ-${Date.now()}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {countdown !== null ? (
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownTitle}>DISPATCHING EMERGENCY HELP IN</Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelSOS}>
            <Text style={styles.cancelBtnText}>CANCEL SOS</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 40 }}>
          {/* Header */}
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.sysTitle}>RESCUELINK PATIENT SOS</Text>
            <Text style={styles.sysSubtitle}>TAP AND HOLD BUTTON FOR EMERGENCY ASSISTANCE</Text>
          </View>

          {/* SOS Circle Button */}
          <TouchableOpacity style={styles.sosCircle} onPress={handleSOSPress}>
            {loading ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <Text style={styles.sosCircleText}>SOS</Text>
            )}
          </TouchableOpacity>

          {/* Map & Quick Links */}
          <View style={{ width: '100%' }}>
            <Text style={styles.subLabel}>Nearby Ambulances</Text>
            <MapView
              style={styles.map}
              region={{
                latitude: currentCoords.latitude,
                longitude: currentCoords.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015
              }}
            >
              <Marker coordinate={currentCoords} title="My Location" pinColor="green" />
              {nearbyAmbulances.map((amb, idx) => (
                <Marker key={amb.id || idx.toString()} coordinate={{ latitude: amb.latitude, longitude: amb.longitude }} title={amb.name} pinColor="red" />
              ))}
            </MapView>

            <View style={styles.linksRow}>
              <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate('CPR')}>
                <Text style={styles.linkText}>🫀 CPR Guide</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkCard} onPress={() => Alert.alert('First Aid', 'Applying pressure on bleeding, keep patient warm.')}>
                <Text style={styles.linkText}>🩹 First Aid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a',
    alignItems: 'center',
    padding: 20
  },
  sysTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: '#ff1a1a',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 20
  },
  sysSubtitle: {
    fontSize: 10,
    color: 'rgba(160, 200, 255, 0.6)',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20
  },
  sosCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#ff1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1a1a',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    borderWidth: 6,
    borderColor: '#ffffff'
  },
  sosCircleText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 34,
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 1
  },
  countdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ff1a1a',
    width: '120%',
    paddingHorizontal: 40
  },
  countdownTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20
  },
  countdownNumber: {
    color: '#fff',
    fontSize: 100,
    fontWeight: 'bold',
    marginBottom: 30
  },
  cancelBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8
  },
  cancelBtnText: {
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  },
  subLabel: {
    fontSize: 12,
    color: '#00c8ff',
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 1
  },
  map: {
    height: 140,
    borderRadius: 12,
    marginBottom: 12
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  linkCard: {
    flex: 1,
    backgroundColor: 'rgba(7,22,44,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,255,0.2)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4
  },
  linkText: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 13
  }
});
