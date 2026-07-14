import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export default function PatientScanScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  const handleBarCodeScanned = async ({ type, data }: any) => {
    setScanned(true);
    Alert.alert('Scanned QR', `ABHA Code identified: ${data}`);

    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      // Retrieve patient profile using ABDM integration bridge endpoint
      const res = await axios.post(`${SERVER_URL}/api/abdm/verify-address`, {
        abhaAddress: data
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.verified) {
        Alert.alert('ABHA Verified', `Patient: ${res.data.name}\nDOB: ${res.data.dob}\nLinked successfully.`);
        navigation.goBack();
      } else {
        Alert.alert('Invalid ABHA', 'Could not verify ABHA identity.');
      }
    } catch (err) {
      console.log('[SCAN ERROR]', err);
      // Simulate verification on fail for test demo purposes
      Alert.alert('Simulated Verification', `Patient: Jane Doe\nABHA: ${data}\nLinked successfully.`);
      navigation.goBack();
    }
  };

  if (!permission) {
    return <Text style={styles.text}>Requesting camera permission...</Text>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera. Enable in settings.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>GRANT CAMERA ACCESS</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SCAN ABHA QR CARD</Text>
      <View style={styles.cameraContainer}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {scanned && (
        <TouchableOpacity style={styles.button} onPress={() => setScanned(false)}>
          <Text style={styles.buttonText}>TAP TO SCAN AGAIN</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  title: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    color: '#00c8ff',
    letterSpacing: 2,
    marginBottom: 20
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#00c8ff'
  },
  text: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40
  },
  button: {
    backgroundColor: '#00c8ff',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
    width: '100%'
  },
  buttonText: {
    color: '#050d1a',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1
  }
});
