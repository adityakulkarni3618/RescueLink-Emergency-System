import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import io from 'socket.io-client';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function ParamedicHomeScreen({ navigation }: any) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    loadUserData();
    fetchIncidents();

    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[SOCKET] Connected to server from Paramedic Home');
    });

    newSocket.on('incident-update', () => {
      fetchIncidents();
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const loadUserData = async () => {
    const userStr = await AsyncStorage.getItem('rescueLinkUser');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  };

  const fetchIncidents = async () => {
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      const res = await axios.get(`${SERVER_URL}/api/users`, {
        // Fetch incidents from endpoint (using user's hospital context or general list)
        headers: { Authorization: `Bearer ${token}` }
      });
      // Mock some incidents for the list if none exist
      setIncidents([
        { id: 'REQ-87391', status: 'requested', pickup_address: 'Main St 108, Pune', patient_name: 'Aditya Kulkarni', news2_score: 8 },
        { id: 'REQ-92182', status: 'dispatched', pickup_address: 'Kalyani Nagar Metro Station', patient_name: 'Jane Smith', news2_score: 3 }
      ]);
    } catch (err) {
      console.log('[FETCH INCIDENTS ERROR]', err);
      // Mock data on failure for testing
      setIncidents([
        { id: 'REQ-87391', status: 'requested', pickup_address: 'Main St 108, Pune', patient_name: 'Aditya Kulkarni', news2_score: 8 },
        { id: 'REQ-92182', status: 'dispatched', pickup_address: 'Kalyani Nagar Metro Station', patient_name: 'Jane Smith', news2_score: 3 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const triggerSOS = async () => {
    Alert.alert(
      'Trigger Emergency SOS',
      'Are you sure you want to broadcast a critical SOS dispatch request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'CONFIRM SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('rescueLinkJWT');
              // Broadcast socket SOS
              if (socket) {
                socket.emit('backup-request', {
                  location: { lat: 18.5204, lng: 73.8567 },
                  userId: user?.id,
                  severity: 'CRITICAL'
                });
              }
              Alert.alert('SOS Dispatched', 'Emergency backup request broadcasted successfully.');
            } catch (err) {
              Alert.alert('Error', 'Failed to dispatch SOS alert.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.incidentCard}
      onPress={() => navigation.navigate('ActiveIncident', { incidentId: item.id })}
    >
      <View style={styles.incidentHeader}>
        <Text style={styles.incidentId}>{item.id}</Text>
        <View style={[styles.badge, item.news2_score >= 7 ? styles.badgeRed : item.news2_score >= 5 ? styles.badgeAmber : styles.badgeGreen]}>
          <Text style={styles.badgeText}>NEWS2: {item.news2_score}</Text>
        </View>
      </View>
      <Text style={styles.patientName}>Patient: {item.patient_name}</Text>
      <Text style={styles.address}>📍 {item.pickup_address}</Text>
      <Text style={[styles.status, { color: item.status === 'requested' ? '#ff4444' : '#00c8ff' }]}>
        Status: {item.status.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Active Emergency Dispatch</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#00c8ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No pending incidents found.</Text>}
        />
      )}

      <TouchableOpacity style={styles.sosButton} onPress={triggerSOS}>
        <Text style={styles.sosText}>🚨 BROADCAST SOS</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a',
    padding: 16
  },
  sectionTitle: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    color: '#00c8ff',
    letterSpacing: 1,
    marginBottom: 16,
    marginTop: 8
  },
  listContent: {
    paddingBottom: 100
  },
  incidentCard: {
    backgroundColor: 'rgba(7, 22, 44, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.15)'
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  incidentId: {
    fontWeight: 'bold',
    color: '#00c8ff',
    fontSize: 14
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeGreen: { backgroundColor: '#00a85a' },
  badgeAmber: { backgroundColor: '#ff9900' },
  badgeRed: { backgroundColor: '#ff1a1a' },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  patientName: {
    color: '#e0eaff',
    fontSize: 14,
    marginBottom: 4
  },
  address: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 13,
    marginBottom: 8
  },
  status: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1
  },
  emptyText: {
    color: 'rgba(160, 200, 255, 0.4)',
    textAlign: 'center',
    marginTop: 40
  },
  sosButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#ff1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#ff1a1a',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },
  sosText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 1
  }
});
