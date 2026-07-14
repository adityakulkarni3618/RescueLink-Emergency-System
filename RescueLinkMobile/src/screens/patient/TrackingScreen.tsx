import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import io from 'socket.io-client';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function TrackingScreen({ route, navigation }: any) {
  const { incidentId } = route.params || { incidentId: 'REQ-MOCK' };

  const [ambulanceLocation, setAmbulanceLocation] = useState<any>({ latitude: 18.5234, longitude: 73.8587 });
  const [patientLocation] = useState<any>({ latitude: 18.5204, longitude: 73.8567 });
  const [eta, setEta] = useState(5); // minutes
  const [ambulanceDetails, setAmbulanceDetails] = useState({
    name: 'ALS Rescue Alpha',
    regNo: 'MH-12-QQ-1088',
    paramedicName: 'Dr. Aditya',
    phone: '+91 99999 88888'
  });

  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = io(SERVER_URL);

    socketRef.current.on('connect', () => {
      console.log('[SOCKET] Connected to Tracking Screen:', incidentId);
      // Join incident room
      socketRef.current.emit('join-mission', { incidentId });
    });

    socketRef.current.on('location-update', (data: any) => {
      if (data && data.lat && data.lng) {
        setAmbulanceLocation({ latitude: data.lat, longitude: data.lng });
        if (data.eta) setEta(data.eta);
      }
    });

    socketRef.current.on('mission-status-update', (data: any) => {
      if (data.status === 'arrived') {
        Alert.alert('Ambulance Arrived', 'The paramedic team has arrived at your location.', [
          { text: 'OK', onPress: () => navigation.navigate('PatientHome') }
        ]);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Emergency Request',
      'Are you sure you want to cancel the ambulance dispatch?',
      [
        { text: 'NO', style: 'cancel' },
        {
          text: 'YES, CANCEL',
          style: 'destructive',
          onPress: () => {
            if (socketRef.current) {
              socketRef.current.emit('cancel-mission', { incidentId });
            }
            Alert.alert('Canceled', 'The ambulance dispatch has been canceled.');
            navigation.navigate('PatientHome');
          }
        }
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Track my emergency ambulance in real-time here: ${SERVER_URL}/track/${incidentId}`
      });
    } catch (e) {
      console.log('Share error', e);
    }
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        style={styles.map}
        region={{
          latitude: (patientLocation.latitude + ambulanceLocation.latitude) / 2,
          longitude: (patientLocation.longitude + ambulanceLocation.longitude) / 2,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015
        }}
      >
        <Marker coordinate={patientLocation} title="My Location" pinColor="green" />
        <Marker coordinate={ambulanceLocation} title="Ambulance" pinColor="red" />
        <Polyline
          coordinates={[patientLocation, ambulanceLocation]}
          strokeWidth={4}
          strokeColor="#00c8ff"
        />
      </MapView>

      {/* Tracking Card */}
      <View style={styles.card}>
        <Text style={styles.etaTitle}>AMBULANCE ARRIVING IN</Text>
        <Text style={styles.etaValue}>{eta} MINS</Text>

        <View style={styles.divider} />

        <Text style={styles.detailLabel}>AMBULANCE DETAILS</Text>
        <Text style={styles.detailText}>{ambulanceDetails.name} • {ambulanceDetails.regNo}</Text>
        <Text style={styles.detailText}>Paramedic: {ambulanceDetails.paramedicName}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>CANCEL REQUEST</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareText}>🔗 SHARE LINK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a'
  },
  map: {
    ...StyleSheet.absoluteFill
  },
  card: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(7, 22, 44, 0.95)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.25)'
  },
  etaTitle: {
    fontSize: 10,
    color: '#00c8ff',
    letterSpacing: 2,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  etaValue: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 200, 255, 0.15)',
    marginVertical: 14
  },
  detailLabel: {
    fontSize: 9,
    color: 'rgba(160, 200, 255, 0.6)',
    letterSpacing: 1,
    marginBottom: 4
  },
  detailText: {
    color: '#e0eaff',
    fontSize: 13,
    marginBottom: 2
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 26, 26, 0.1)',
    borderWidth: 1,
    borderColor: '#ff1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 6
  },
  cancelText: {
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontSize: 12
  },
  shareBtn: {
    flex: 1,
    backgroundColor: 'rgba(0, 200, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#00c8ff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 6
  },
  shareText: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 12
  }
});
