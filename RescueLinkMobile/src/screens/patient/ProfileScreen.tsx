import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Profile storage hook

export default function PatientProfileScreen() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userStr = await AsyncStorage.getItem('rescueLinkUser');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  };

  const unlinkAbha = () => {
    Alert.alert('Unlink ABHA', 'Are you sure you want to remove your linked ABHA Health ID?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'UNLINK',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Success', 'ABHA Number unlinked successfully.');
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name || 'Jane Doe'}</Text>
        <Text style={styles.role}>RESCUELINK REGISTERED PATIENT</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>ABHA HEALTH ID NUMBER</Text>
        <Text style={styles.val}>{user?.abha_number || '91-1234-5678-9012'}</Text>
        
        <TouchableOpacity style={styles.unlinkBtn} onPress={unlinkAbha}>
          <Text style={styles.unlinkText}>Unlink Health Card</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a',
    padding: 20
  },
  card: {
    backgroundColor: 'rgba(7, 22, 44, 0.8)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)'
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e0eaff',
    textAlign: 'center'
  },
  role: {
    fontSize: 10,
    color: '#00c8ff',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: 'bold',
    letterSpacing: 1
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 200, 255, 0.15)',
    marginVertical: 20
  },
  label: {
    fontSize: 10,
    color: 'rgba(160, 200, 255, 0.5)',
    marginBottom: 4,
    letterSpacing: 1
  },
  val: {
    fontSize: 16,
    color: '#00c8ff',
    fontWeight: 'bold',
    fontFamily: 'Orbitron_700Bold',
    marginBottom: 16
  },
  unlinkBtn: {
    backgroundColor: 'rgba(255, 26, 26, 0.1)',
    borderWidth: 1,
    borderColor: '#ff1a1a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 8
  },
  unlinkText: {
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontSize: 12
  }
});
