import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function ChronicLogScreen() {
  const [bloodGlucose, setBloodGlucose] = useState('');
  const [systolicBp, setSystolicBp] = useState('');
  const [diastolicBp, setDiastolicBp] = useState('');
  const [inhalerUsage, setInhalerUsage] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      const userStr = await AsyncStorage.getItem('rescueLinkUser');
      if (!token || !userStr) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }
      
      const user = JSON.parse(userStr);
      const patientId = user.patient_id || user.id;

      if (!patientId) {
        Alert.alert('Error', 'Patient profile not found.');
        return;
      }

      const payload = {
        patient_id: patientId,
        blood_glucose: bloodGlucose ? parseFloat(bloodGlucose) : null,
        systolic_bp: systolicBp ? parseInt(systolicBp) : null,
        diastolic_bp: diastolicBp ? parseInt(diastolicBp) : null,
        asthma_inhaler_usage: inhalerUsage ? parseInt(inhalerUsage) : 0,
        symptoms: symptoms || '',
        medication_adherence: true
      };

      const response = await axios.post(`${SERVER_URL}/api/chronic/logs`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 201) {
        Alert.alert('Success', 'Metrics logged successfully to your health file.');
        setBloodGlucose('');
        setSystolicBp('');
        setDiastolicBp('');
        setInhalerUsage('');
        setSymptoms('');
      } else {
        throw new Error('Failed to record metrics');
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.error || err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>📈 Daily Chronic Health Log</Text>
      <Text style={styles.subtitle}>Log your vitals regularly to keep your physician informed.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Blood Glucose (mg/dL)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 110"
          placeholderTextColor="#4a607a"
          value={bloodGlucose}
          onChangeText={setBloodGlucose}
        />

        <Text style={styles.label}>Systolic Blood Pressure (mmHg)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 120"
          placeholderTextColor="#4a607a"
          value={systolicBp}
          onChangeText={setSystolicBp}
        />

        <Text style={styles.label}>Diastolic Blood Pressure (mmHg)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 80"
          placeholderTextColor="#4a607a"
          value={diastolicBp}
          onChangeText={setDiastolicBp}
        />

        <Text style={styles.label}>Inhaler Puffs / Usage (Daily)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 2"
          placeholderTextColor="#4a607a"
          value={inhalerUsage}
          onChangeText={setInhalerUsage}
        />

        <Text style={styles.label}>Symptoms or Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          numberOfLines={4}
          placeholder="e.g. Feeling slight fatigue or shortness of breath..."
          placeholderTextColor="#4a607a"
          value={symptoms}
          onChangeText={setSymptoms}
        />

        <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.btnText}>SUBMIT DAILY METRICS</Text>
          )}
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
  contentContainer: {
    padding: 20,
    paddingBottom: 40
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00c8ff',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Orbitron_700Bold'
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(160, 200, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18
  },
  card: {
    backgroundColor: 'rgba(7, 22, 44, 0.8)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)'
  },
  label: {
    fontSize: 12,
    color: '#e0eaff',
    marginBottom: 6,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#0a172a',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 16
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top'
  },
  btn: {
    backgroundColor: '#00c8ff',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10
  },
  btnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  }
});
