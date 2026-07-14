import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function DriverHomeScreen({ navigation }: any) {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    // Simulated jobs matching available ambulance dispatches
    setJobs([
      { id: 'JOB-9018', destination: 'City Cardiac Hospital, Pune', distance: '4.8 km', status: 'assigned' },
      { id: 'JOB-3122', destination: 'Jupiter Emergency Center', distance: '7.2 km', status: 'pending' }
    ]);
  };

  const acceptJob = (jobId: string) => {
    Alert.alert('Job Accepted', 'Ready for dispatch. Proceeding to navigation.', [
      {
        text: 'START NAVIGATION',
        onPress: () => navigation.navigate('Navigation', { jobId })
      }
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.id}>{item.id}</Text>
        <Text style={styles.distance}>{item.distance}</Text>
      </View>
      <Text style={styles.dest}>Destination: {item.destination}</Text>
      <TouchableOpacity style={styles.button} onPress={() => acceptJob(item.id)}>
        <Text style={styles.btnText}>ACCEPT DISPATCH →</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Available Dispatch Jobs</Text>
      <FlatList
        data={jobs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
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
    fontSize: 16,
    color: '#00c8ff',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 16
  },
  card: {
    backgroundColor: 'rgba(7, 22, 44, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.15)'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  id: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 14
  },
  distance: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 13
  },
  dest: {
    color: '#e0eaff',
    fontSize: 14,
    marginBottom: 12
  },
  button: {
    backgroundColor: '#00c8ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center'
  },
  btnText: {
    color: '#050d1a',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1
  }
});
