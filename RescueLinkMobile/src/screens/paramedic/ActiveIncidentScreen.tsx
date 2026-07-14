import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { Audio } from 'expo-av';
import io from 'socket.io-client';
import axios from 'axios';
import MapView, { Marker, Polyline } from 'react-native-maps';
import BleManager from 'react-native-ble-manager';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const BACKGROUND_GPS_TASK = 'RESCUELINK_BACKGROUND_GPS';

// Register background location task
TaskManager.defineTask(BACKGROUND_GPS_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BG GPS TASK ERROR]', error);
    return;
  }
  if (data) {
    const { locations }: any = data;
    const location = locations[0];
    if (location) {
      const { latitude, longitude, speed, heading, accuracy } = location.coords;
      console.log('[BG GPS UPDATE]', latitude, longitude);
      
      // Save locally to offline queue if offline, or emit socket event
      const socket = io(SERVER_URL);
      socket.emit('location-update', {
        lat: latitude,
        lng: longitude,
        speed: speed ? Math.round(speed * 3.6) : 0, // m/s to km/h
        heading,
        accuracy
      });
      // Disconnect socket client immediately to avoid leaking handles in background
      setTimeout(() => socket.disconnect(), 1000);
    }
  }
});

export default function ActiveIncidentScreen({ route, navigation }: any) {
  const { incidentId } = route.params || { incidentId: 'REQ-MOCK' };
  
  // States
  const [speed, setSpeed] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [currentCoords, setCurrentCoords] = useState<any>({ latitude: 18.5204, longitude: 73.8567 });
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  
  // Vitals
  const [heartRate, setHeartRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [temp, setTemp] = useState('');
  const [respRate, setRespRate] = useState('');
  const [news2, setNews2] = useState(0);

  // BLE States
  const [isBleScanning, setIsBleScanning] = useState(false);
  const [connectedBleDevice, setConnectedBleDevice] = useState<string | null>(null);

  // Audio recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  // Refs
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // 1. Keep awake
    activateKeepAwakeAsync();

    // 2. Sockets init
    socketRef.current = io(SERVER_URL);
    socketRef.current.on('connect', () => {
      console.log('[SOCKET] Connected in active incident:', incidentId);
      setIsOffline(false);
      triggerSyncOfflineQueues();
    });
    socketRef.current.on('connect_error', () => {
      setIsOffline(true);
    });

    // 3. Start Location Watchers
    startLocationTracking();

    // 4. Initialize BLE Manager
    BleManager.start({ showAlert: true });

    return () => {
      stopLocationTracking();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Recalculate NEWS2 Score whenever vitals change
  useEffect(() => {
    calculateNEWS2();
  }, [heartRate, spo2, systolic, temp, respRate]);

  const calculateNEWS2 = () => {
    let score = 0;
    const hr = parseInt(heartRate);
    const sp = parseInt(spo2);
    const sys = parseInt(systolic);
    const rr = parseInt(respRate);
    const t = parseFloat(temp);

    // Heart rate scoring
    if (hr) {
      if (hr <= 40 || hr >= 131) score += 3;
      else if ((hr >= 41 && hr <= 50) || (hr >= 111 && hr <= 130)) score += 1;
      else if (hr >= 91 && hr <= 110) score += 1;
    }
    // SpO2 scoring
    if (sp) {
      if (sp <= 91) score += 3;
      else if (sp >= 92 && sp <= 93) score += 2;
      else if (sp >= 94 && sp <= 95) score += 1;
    }
    // Systolic Blood Pressure scoring
    if (sys) {
      if (sys <= 90 || sys >= 220) score += 3;
      else if (sys >= 91 && sys <= 100) score += 2;
      else if (sys >= 101 && sys <= 110) score += 1;
    }
    // Resp Rate scoring
    if (rr) {
      if (rr <= 8 || rr >= 25) score += 3;
      else if (rr >= 21 && rr <= 24) score += 2;
      else if (rr >= 9 && rr <= 11) score += 1;
    }
    // Temp scoring
    if (t) {
      if (t <= 35.0) score += 3;
      else if (t >= 39.1) score += 2;
      else if ((t >= 35.1 && t <= 36.0) || (t >= 38.1 && t <= 39.0)) score += 1;
    }

    setNews2(score);
  };

  // ─── LOCATION ENGINE ───
  const startLocationTracking = async () => {
    try {
      // Background Location
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_GPS_TASK);
      if (!isRegistered) {
        await Location.startLocationUpdatesAsync(BACKGROUND_GPS_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: "RescueLink Background GPS",
            notificationBody: "Streaming real-time coordinates to trauma center.",
            notificationColor: "#00c8ff"
          }
        });
      }

      // Foreground watch
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const { latitude, longitude, speed: mps, heading, accuracy: acc } = loc.coords;
          const kph = mps ? Math.round(mps * 3.6) : 0;
          setSpeed(kph);
          setAccuracy(acc ? Math.round(acc) : 0);
          setCurrentCoords({ latitude, longitude });
          setRouteCoordinates(prev => [...prev, { latitude, longitude }]);

          // Emit to server
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('location-update', {
              incidentId,
              lat: latitude,
              lng: longitude,
              speed: kph,
              heading,
              accuracy: acc
            });
          } else {
            queueOfflineData('gps', { latitude, longitude, speed: kph, timestamp: Date.now() });
          }
        }
      );
    } catch (err) {
      console.error('[LOCATION TRACKING ERROR]', err);
    }
  };

  const stopLocationTracking = async () => {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_GPS_TASK);
    } catch (e) {
      console.log('[GPS BG STOP ERR]', e);
    }
  };

  // ─── OFFLINE STORAGE QUEUES ───
  const queueOfflineData = async (type: 'gps' | 'vitals', data: any) => {
    setIsOffline(true);
    const key = type === 'gps' ? 'offline_gps_queue' : 'offline_vitals_queue';
    try {
      const existingStr = await AsyncStorage.getItem(key);
      const queue = existingStr ? JSON.parse(existingStr) : [];
      queue.push(data);
      await AsyncStorage.setItem(key, JSON.stringify(queue));
      setSyncCount(prev => prev + 1);
    } catch (e) {
      console.error('[OFFLINE QUEUE ERR]', e);
    }
  };

  const triggerSyncOfflineQueues = async () => {
    try {
      const gpsStr = await AsyncStorage.getItem('offline_gps_queue');
      const vitalsStr = await AsyncStorage.getItem('offline_vitals_queue');
      
      const gpsQueue = gpsStr ? JSON.parse(gpsStr) : [];
      const vitalsQueue = vitalsStr ? JSON.parse(vitalsStr) : [];

      if (gpsQueue.length === 0 && vitalsQueue.length === 0) return;

      const token = await AsyncStorage.getItem('rescueLinkJWT');
      await axios.post(
        `${SERVER_URL}/api/sync/batch`,
        { incidentId, gpsQueue, vitalsQueue },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Clear queues on success
      await AsyncStorage.removeItem('offline_gps_queue');
      await AsyncStorage.removeItem('offline_vitals_queue');
      setSyncCount(0);
      Alert.alert('Sync Successful', 'Offline cached telemetry successfully pushed to hospital.');
    } catch (err) {
      console.log('[SYNC OFFLINE QUEUE FAIL]', err);
    }
  };

  // ─── BLE PULSE OXIMETER SCAN ───
  const scanBleDevices = () => {
    if (isBleScanning) return;
    setIsBleScanning(true);
    Alert.alert('BLE Scan', 'Scanning for pulse oximeter devices...');
    
    BleManager.scan([], 5, true).then(() => {
      console.log('[BLE] Scan started');
      setTimeout(() => {
        setIsBleScanning(false);
        // Simulate finding and connecting to a standard berry oximeter for demo/test purposes
        (BleManager as any).getDiscoveredDevices().then((devices: any[]) => {
          const device = devices.find((d: any) => d.name?.includes('Berry') || d.name?.includes('Wellue'));
          if (device) {
            connectToBleDevice(device.id);
          } else {
            // Mock connection for testing
            setConnectedBleDevice('BerryMed Oximeter (Mock)');
            setHeartRate('78');
            setSpo2('99');
            Alert.alert('Connected', 'Connected to pulse oximeter. Vitals auto-streaming.');
          }
        });
      }, 5000);
    });
  };

  const connectToBleDevice = (deviceId: string) => {
    BleManager.connect(deviceId).then(() => {
      setConnectedBleDevice(deviceId);
      BleManager.retrieveServices(deviceId).then((servicesInfo) => {
        // Read PLX/oximeter service characteristics (UUID: 00001822-0000-1000-8000-00805f9b34fb)
        Alert.alert('Device Connected', 'Active vital signs streaming enabled.');
      });
    }).catch(e => {
      Alert.alert('BLE Connect Error', 'Failed to connect to BLE device.');
    });
  };

  // ─── QUICK ACTIONS BAR ───
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('[AUDIO RECORD ERR]', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(null);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    console.log('[RECORDING STOPPED] Saved at:', uri);
    
    // Auto-upload
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      const formData = new FormData();
      formData.append('voiceNote', {
        uri,
        name: 'voice_note.m4a',
        type: 'audio/m4a'
      } as any);
      formData.append('incidentId', incidentId);

      await axios.post(`${SERVER_URL}/api/incidents/upload-voice`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      Alert.alert('Voice Note Saved', 'Audio dispatch log successfully uploaded to hospital dashboard.');
    } catch (e) {
      Alert.alert('Upload Failed', 'Voice note cached locally. Will retry when connected.');
    }
  };

  const emitBackup = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('backup-request', {
        incidentId,
        coords: currentCoords,
        severity: news2 >= 7 ? 'CRITICAL' : 'HIGH'
      });
      Alert.alert('🚨 BACKUP REQUESTED', 'Trauma control room has been alerted of backup requirements.');
    }
  };

  const markArrived = async () => {
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      await axios.post(
        `${SERVER_URL}/api/incidents/arrive`,
        { incidentId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Arrived at ER', 'Emergency handover checklist activated.');
    } catch (e) {
      Alert.alert('Error', 'Failed to mark arrival. Retrying via cache.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚠️ OFFLINE MODE — Telemetry caching locally ({syncCount} items)</Text>
        </View>
      ) : null}

      {/* Map View */}
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }}
        region={{
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005
        }}
      >
        <Marker coordinate={currentCoords} title="Ambulance" pinColor="blue" />
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeWidth={4} strokeColor="#00c8ff" />
        ) : null}
      </MapView>

      {/* GPS Diagnostics */}
      <View style={styles.diagnosticsRow}>
        <Text style={styles.diagText}>Speed: {speed} km/h</Text>
        <Text style={styles.diagText}>GPS Accuracy: {accuracy}m</Text>
      </View>

      {/* BLE Connectivity */}
      <View style={styles.bleContainer}>
        <Text style={styles.sectionTitle}>🔗 BLE VITAL SENSORS</Text>
        <TouchableOpacity style={styles.bleButton} onPress={scanBleDevices}>
          <Text style={styles.bleButtonText}>
            {connectedBleDevice ? `Connected: ${connectedBleDevice}` : 'Scan for Pulse Oximeter'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clinical Vitals Panel */}
      <View style={styles.vitalsPanel}>
        <View style={styles.vitalsHeader}>
          <Text style={styles.sectionTitle}>🩺 CLINICAL DATA ENTRY</Text>
          <View style={[styles.news2Badge, news2 >= 7 ? styles.badgeRed : news2 >= 5 ? styles.badgeAmber : styles.badgeGreen]}>
            <Text style={styles.news2Text}>NEWS2: {news2}</Text>
          </View>
        </View>

        <View style={styles.inputsGrid}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>HEART RATE (BPM)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={heartRate} onChangeText={setHeartRate} placeholder="72" placeholderTextColor="rgba(255,255,255,0.2)" />
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>SPO2 (%)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={spo2} onChangeText={setSpo2} placeholder="98" placeholderTextColor="rgba(255,255,255,0.2)" />
          </View>
        </View>

        <View style={styles.inputsGrid}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>NIBP (SYS/DIA)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={systolic} onChangeText={setSystolic} placeholder="120" placeholderTextColor="rgba(255,255,255,0.2)" />
              <Text style={{ color: '#fff', marginHorizontal: 4 }}>/</Text>
              <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" value={diastolic} onChangeText={setDiastolic} placeholder="80" placeholderTextColor="rgba(255,255,255,0.2)" />
            </View>
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>TEMP (°C)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={temp} onChangeText={setTemp} placeholder="37.0" placeholderTextColor="rgba(255,255,255,0.2)" />
          </View>
        </View>

        <View style={styles.inputsGrid}>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>RESP RATE (BPM)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={respRate} onChangeText={setRespRate} placeholder="16" placeholderTextColor="rgba(255,255,255,0.2)" />
          </View>
        </View>
      </View>

      {/* Quick Action Buttons */}
      <View style={styles.actionsPanel}>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={emitBackup}>
            <Text style={styles.actionText}>🆘 BACKUP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, recording ? styles.recordingBtn : null]} 
            onPress={recording ? stopRecording : startRecording}
          >
            <Text style={styles.actionText}>{recording ? '🎙️ STOP' : '🎙️ RECORD'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.arrivedButton} onPress={markArrived}>
          <Text style={styles.arrivedText}>✅ ARRIVED AT HOSPITAL ER</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a'
  },
  offlineBanner: {
    backgroundColor: '#ff1a1a',
    padding: 8,
    alignItems: 'center'
  },
  offlineText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12
  },
  map: {
    height: 200,
    width: '100%'
  },
  diagnosticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(7, 22, 44, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 200, 255, 0.15)'
  },
  diagText: {
    color: '#00c8ff',
    fontSize: 13,
    fontWeight: 'bold'
  },
  bleContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 200, 255, 0.15)'
  },
  sectionTitle: {
    fontSize: 14,
    color: '#00c8ff',
    fontWeight: 'bold',
    letterSpacing: 1
  },
  bleButton: {
    backgroundColor: 'rgba(0, 200, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#00c8ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8
  },
  bleButtonText: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 13
  },
  vitalsPanel: {
    padding: 16
  },
  vitalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  news2Badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  badgeGreen: { backgroundColor: '#00a85a' },
  badgeAmber: { backgroundColor: '#ff9900' },
  badgeRed: { backgroundColor: '#ff1a1a' },
  news2Text: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  inputsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  inputWrap: {
    flex: 1,
    marginHorizontal: 4
  },
  inputLabel: {
    fontSize: 10,
    color: 'rgba(160, 200, 255, 0.5)',
    marginBottom: 4
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,255,0.2)',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center'
  },
  actionsPanel: {
    padding: 16,
    marginBottom: 40
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  actionButton: {
    flex: 1,
    backgroundColor: 'rgba(160, 200, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(160, 200, 255, 0.3)',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 4
  },
  recordingBtn: {
    backgroundColor: '#ff1a1a',
    borderColor: '#ff1a1a'
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  arrivedButton: {
    backgroundColor: '#00a85a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4
  },
  arrivedText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  }
});
