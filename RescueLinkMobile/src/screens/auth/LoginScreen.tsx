import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface LoginScreenProps {
  navigation: any;
  route: any;
}

// In AppNavigator, we will pass down onLoginSuccess via route params or direct props
export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
        email,
        password
      });

      const { token, user } = res.data;
      await AsyncStorage.setItem('rescueLinkJWT', token);
      await AsyncStorage.setItem('rescueLinkUser', JSON.stringify(user));

      // Invoke success handler if passed, or navigate
      if (route.params?.onLoginSuccess) {
        route.params.onLoginSuccess(user.role);
      } else {
        // Fallback to reloading the app or navigating if handled globally
        Alert.alert('Success', 'Logged in successfully! Please restart the app.');
      }
    } catch (err: any) {
      console.log('[LOGIN ERROR]', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Invalid credentials or connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>🚑 RESCUELINK</Text>
        <Text style={styles.subtitle}>ENTERPRISE PORTAL</Text>

        {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

        <Text style={styles.label}>EMAIL ADDRESS</Text>
        <TextInput
          style={styles.input}
          placeholder="email@rescuelink.com"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#050d1a" />
          ) : (
            <Text style={styles.buttonText}>ENTER SYSTEM →</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotText}>Forgot password?</Text>
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
    fontFamily: 'Orbitron_700Bold',
    fontSize: 24,
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
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center'
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
    marginTop: 8,
    shadowColor: '#00c8ff',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  buttonText: {
    color: '#050d1a',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  },
  forgotText: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20
  }
});
