import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

// Route endpoints from .env
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

// Import Screens (we will implement the actual screen components)
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

import ParamedicHomeScreen from '../screens/paramedic/HomeScreen';
import ActiveIncidentScreen from '../screens/paramedic/ActiveIncidentScreen';
import PatientScanScreen from '../screens/paramedic/PatientScanScreen';
import ParamedicProfileScreen from '../screens/paramedic/ProfileScreen';

import DriverHomeScreen from '../screens/driver/HomeScreen';
import NavigationScreen from '../screens/driver/NavigationScreen';
import JobHistoryScreen from '../screens/driver/JobHistoryScreen';

import PatientHomeScreen from '../screens/patient/SOSScreen';
import TrackingScreen from '../screens/patient/TrackingScreen';
import PatientProfileScreen from '../screens/patient/ProfileScreen';
import CPRGuideScreen from '../screens/patient/CPRGuideScreen';

// Stack and Tab Creators
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// --- Auth Stack ---
function AuthNavigator({ route }: any) {
  const onLoginSuccess = route.params?.onLoginSuccess;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} initialParams={{ onLoginSuccess }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}


// --- Paramedic Stack ---
function ParamedicTabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Tab.Screen name="Incidents" component={ParamedicHomeScreen} options={{ title: '🚨 Incidents' }} />
      <Tab.Screen name="Scan Patient" component={PatientScanScreen} options={{ title: '📸 Scan ABHA' }} />
      <Tab.Screen name="Profile" component={ParamedicProfileScreen} options={{ title: '👤 Profile' }} />
    </Tab.Navigator>
  );
}

function ParamedicNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Stack.Screen name="ParamedicTabs" component={ParamedicTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveIncident" component={ActiveIncidentScreen} options={{ title: '⚡ Active Rescue' }} />
    </Stack.Navigator>
  );
}

// --- Driver Stack ---
function DriverTabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Tab.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: '🚚 Jobs' }} />
      <Tab.Screen name="History" component={JobHistoryScreen} options={{ title: '📜 History' }} />
    </Tab.Navigator>
  );
}

function DriverNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Stack.Screen name="DriverTabs" component={DriverTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Navigation" component={NavigationScreen} options={{ title: '🗺️ Navigation' }} />
    </Stack.Navigator>
  );
}

// --- Patient Stack ---
function PatientTabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ title: '🆘 SOS Alert' }} />
      <Tab.Screen name="Profile" component={PatientProfileScreen} options={{ title: '🏥 Health Records' }} />
      <Tab.Screen name="CPR" component={CPRGuideScreen} options={{ title: '🫀 CPR Guide' }} />
    </Tab.Navigator>
  );
}

function PatientNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#07162c' }, headerTintColor: '#00c8ff' }}>
      <Stack.Screen name="PatientTabs" component={PatientTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: '🚑 Live Tracker' }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    requestPermissions();
    checkAuthToken();
  }, []);

  const requestPermissions = async () => {
    try {
      // 1. Location (Foreground + Background)
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }

      // 2. Camera
      await Camera.requestCameraPermissionsAsync();

      // 3. Audio / Microphone
      await Audio.requestPermissionsAsync();

      // 4. Notifications
      await Notifications.requestPermissionsAsync();
    } catch (err) {
      console.warn('[PERMISSIONS ERROR]', err);
    }
  };

  const checkAuthToken = async () => {
    try {
      const token = await AsyncStorage.getItem('rescueLinkJWT');
      if (!token) {
        setUserRole(null);
        setLoading(false);
        return;
      }

      // Validate token with server
      const res = await axios.get(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const user = res.data;
      if (user && user.role) {
        setUserRole(user.role);
      } else {
        await AsyncStorage.removeItem('rescueLinkJWT');
        setUserRole(null);
      }
    } catch (err) {
      console.log('[AUTH CHECK FAILED] Falling back to login screen', err);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00c8ff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!userRole ? (
          <Stack.Screen name="Auth" component={AuthNavigator} initialParams={{ onLoginSuccess: setUserRole }} />
        ) : userRole === 'paramedic' ? (
          <Stack.Screen name="Paramedic" component={ParamedicNavigator} />
        ) : userRole === 'ambulance_driver' ? (
          <Stack.Screen name="Driver" component={DriverNavigator} />
        ) : (
          <Stack.Screen name="Patient" component={PatientNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#050d1a'
  }
});
