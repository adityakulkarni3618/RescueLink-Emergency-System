import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';

export default function NavigationScreen({ route, navigation }: any) {
  const { jobId } = route.params || { jobId: 'JOB-MOCK' };

  // Navigation states
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(60);
  const [currentCoords, setCurrentCoords] = useState<any>({ latitude: 18.5204, longitude: 73.8567 });
  const [hospitalCoords] = useState<any>({ latitude: 18.5304, longitude: 73.8667 });
  const [instruction, setInstruction] = useState('Drive straight on Pune-Nashik Highway');
  const [nextInstruction, setNextInstruction] = useState('In 300m, turn left towards ER Entrance');
  const [distanceRemaining, setDistanceRemaining] = useState('1.2 km');
  const [signalStatus, setSignalStatus] = useState('Cleared ✅');
  const [eta, setEta] = useState('04:30');
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isNightMode, setIsNightMode] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Sound ref
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // 1. Enable location tracking
    let locationWatcher: any = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      locationWatcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
        (loc) => {
          const kph = loc.coords.speed ? Math.round(loc.coords.speed * 3.6) : 0;
          setSpeed(kph);
          setCurrentCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      );
    })();

    // 2. Set night mode dynamically based on time
    const hour = new Date().getHours();
    if (hour >= 19 || hour < 7) {
      setIsNightMode(true);
    }

    // 3. Start simulated speech directions
    const speechInterval = setInterval(() => {
      if (isVoiceEnabled) {
        Speech.speak(`${instruction}. Speed is ${speed} kilometers per hour. ETA is ${eta.split(':')[0]} minutes.`, {
          rate: 1.0,
          pitch: 1.0,
          language: 'en'
        });
      }
    }, 15000);

    // 4. Simulate an incoming emergency alert message
    const alertTimeout = setTimeout(() => {
      triggerEmergencyAlert('Hospital ER Alert: Prepare Bay 3 - Cardiac Arrest Incoming.');
    }, 10000);

    return () => {
      if (locationWatcher) locationWatcher.remove();
      clearInterval(speechInterval);
      clearTimeout(alertTimeout);
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, [instruction, speed, eta, isVoiceEnabled]);

  const triggerEmergencyAlert = async (msg: string) => {
    setAlertMessage(msg);
    try {
      // Load and play alert sound
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/alert.mp3'), // Placeholder: must exist or map to fallback
        { shouldPlay: true, isLooping: false }
      );
      soundRef.current = sound;
      await sound.playAsync();
    } catch (e) {
      console.log('[AUDIO ALARM ERR]', e);
    }
  };

  const toggleVoice = () => {
    setIsVoiceEnabled(!isVoiceEnabled);
    Speech.stop();
  };

  return (
    <View style={styles.container}>
      {/* Full screen Map */}
      <MapView
        style={styles.map}
        customMapStyle={isNightMode ? darkMapStyle : []}
        region={{
          latitude: (currentCoords.latitude + hospitalCoords.latitude) / 2,
          longitude: (currentCoords.longitude + hospitalCoords.longitude) / 2,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        }}
      >
        <Marker coordinate={currentCoords} title="Ambulance" pinColor="blue" />
        <Marker coordinate={hospitalCoords} title="Hospital ER" pinColor="red" />
        <Polyline
          coordinates={[currentCoords, hospitalCoords]}
          strokeWidth={4}
          strokeColor="#00c8ff"
          lineDashPattern={[5, 5]}
        />
      </MapView>

      {/* Turn-by-Turn Card */}
      <View style={styles.navigationCard}>
        <Text style={styles.navLabel}>NAVIGATION FEED</Text>
        <Text style={styles.instructionText}>{instruction}</Text>
        <Text style={styles.nextText}>{nextInstruction}</Text>
        <View style={styles.progressBarBg}>
          <View style={styles.progressBar} />
        </View>
      </View>

      {/* HUD Panel Left: Green Corridor */}
      <View style={styles.hudLeft}>
        <Text style={styles.hudLabel}>GREEN CORRIDOR</Text>
        <Text style={styles.corridorValue}>Signal: {signalStatus}</Text>
        <Text style={styles.etaText}>ETA: {eta}</Text>
      </View>

      {/* HUD Panel Right: Speedometer */}
      <View style={styles.hudRight}>
        <View style={[styles.speedCircle, speed > speedLimit ? styles.speedAlert : styles.speedNormal]}>
          <Text style={styles.speedNumber}>{speed}</Text>
          <Text style={styles.speedUnit}>KM/H</Text>
        </View>
        <Text style={styles.limitText}>Limit: {speedLimit}</Text>
      </View>

      {/* Voice control button */}
      <TouchableOpacity style={styles.voiceBtn} onPress={toggleVoice}>
        <Text style={styles.voiceText}>{isVoiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}</Text>
      </TouchableOpacity>

      {/* Emergency Alert Popup */}
      {alertMessage && (
        <View style={styles.alertPopup}>
          <Text style={styles.alertTitle}>⚠️ EMERGENCY DISPATCH ALERT</Text>
          <Text style={styles.alertBody}>{alertMessage}</Text>
          <TouchableOpacity style={styles.alertClose} onPress={() => setAlertMessage(null)}>
            <Text style={styles.alertCloseText}>ACKNOWLEDGE & CLOSE</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#07162c" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#07162c" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#80a0ff" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#112a4c" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#0a1e36" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020914" }] }
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a'
  },
  map: {
    ...StyleSheet.absoluteFill
  },
  navigationCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(7, 22, 44, 0.9)',
    borderWidth: 1,
    borderColor: '#00c8ff',
    borderRadius: 12,
    padding: 16
  },
  navLabel: {
    fontSize: 9,
    color: '#00c8ff',
    letterSpacing: 2,
    fontWeight: 'bold',
    marginBottom: 4
  },
  instructionText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold'
  },
  nextText: {
    fontSize: 12,
    color: 'rgba(160, 200, 255, 0.7)',
    marginTop: 4
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden'
  },
  progressBar: {
    width: '60%',
    height: '100%',
    backgroundColor: '#00c8ff'
  },
  hudLeft: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(7, 22, 44, 0.9)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)',
    width: 130
  },
  hudLabel: {
    fontSize: 8,
    color: 'rgba(160, 200, 255, 0.6)',
    fontWeight: 'bold',
    letterSpacing: 1
  },
  corridorValue: {
    color: '#00ff88',
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 4
  },
  etaText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 4
  },
  hudRight: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: 'rgba(7, 22, 44, 0.9)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)',
    alignItems: 'center'
  },
  speedCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3
  },
  speedNormal: {
    borderColor: '#00ff88'
  },
  speedAlert: {
    borderColor: '#ff1a1a'
  },
  speedNumber: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18
  },
  speedUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 8,
    fontWeight: 'bold'
  },
  limitText: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 10,
    marginTop: 4
  },
  voiceBtn: {
    position: 'absolute',
    bottom: 150,
    right: 20,
    backgroundColor: 'rgba(7, 22, 44, 0.9)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.3)'
  },
  voiceText: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 11
  },
  alertPopup: {
    position: 'absolute',
    inset: 20,
    backgroundColor: '#ff1a1a',
    borderRadius: 16,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }
  },
  alertTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center'
  },
  alertBody: {
    color: '#e0eaff',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24
  },
  alertClose: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24
  },
  alertCloseText: {
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontSize: 13
  }
});
