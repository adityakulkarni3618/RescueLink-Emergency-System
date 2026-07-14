import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ParamedicProfileScreen({ navigation }: any) {
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

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out of the RescueLink system?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'LOG OUT',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('rescueLinkJWT');
            await AsyncStorage.removeItem('rescueLinkUser');
            // Navigate back to auth flow or force reload
            Alert.alert('Logged Out', 'Session ended successfully. Please restart the app.');
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name || 'Medical Officer'}</Text>
        <Text style={styles.role}>{user?.role?.toUpperCase() || 'PARAMEDIC'}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>EMAIL ADDRESS</Text>
        <Text style={styles.val}>{user?.email || 'paramedic@rescuelink.com'}</Text>
        <Text style={styles.label}>MOBILE NUMBER</Text>
        <Text style={styles.val}>{user?.mobile || '+91 98765 43210'}</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>🔒 SECURE LOGOUT</Text>
      </TouchableOpacity>
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
    borderColor: 'rgba(0, 200, 255, 0.2)',
    marginBottom: 20
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e0eaff',
    textAlign: 'center'
  },
  role: {
    fontSize: 11,
    color: '#00c8ff',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: 'bold',
    letterSpacing: 2
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
    fontSize: 14,
    color: '#e0eaff',
    marginBottom: 16
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 26, 26, 0.1)',
    borderWidth: 1,
    borderColor: '#ff1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center'
  },
  logoutText: {
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  }
});
