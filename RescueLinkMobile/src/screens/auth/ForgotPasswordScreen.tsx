import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');

  const handleReset = () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email.');
      return;
    }
    Alert.alert('Success', 'If this email is registered, a password reset link has been sent.');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>RESET PASSWORD</Text>
        <Text style={styles.subtitle}>RESCUELINK STAFF</Text>

        <Text style={styles.label}>ENTER REGISTERED EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="doctor@rescuelink.com"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>SEND RESET LINK</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050d1a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(7, 22, 44, 0.8)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00c8ff',
    textAlign: 'center',
    letterSpacing: 2
  },
  subtitle: {
    fontSize: 10,
    color: 'rgba(160, 200, 255, 0.6)',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 24,
    marginTop: 4
  },
  label: {
    fontSize: 11,
    color: 'rgba(160, 200, 255, 0.5)',
    marginBottom: 6,
    letterSpacing: 1
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 255, 0.2)',
    borderRadius: 8,
    color: '#e0eaff',
    padding: 12,
    fontSize: 14,
    marginBottom: 16
  },
  button: {
    backgroundColor: '#00c8ff',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: {
    color: '#050d1a',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  },
  backText: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20
  }
});
