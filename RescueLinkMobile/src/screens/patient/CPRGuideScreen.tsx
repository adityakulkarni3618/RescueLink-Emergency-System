import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function CPRGuideScreen() {
  const [pulse] = useState(new Animated.Value(1));

  useEffect(() => {
    // CPR chest compression rhythm (100-120 beats per minute = ~1 beat per 550ms)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 400, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EMERGENCY CPR ASSISTANT</Text>
      <Text style={styles.subtitle}>Match chest compressions to the flashing rhythm</Text>

      <Animated.View style={[styles.rhythmIndicator, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.pulseText}>PUSH</Text>
      </Animated.View>

      <View style={styles.instructions}>
        <Text style={styles.step}>1. Place hands in the center of the chest.</Text>
        <Text style={styles.step}>2. Push down hard and fast (5-6 cm depth).</Text>
        <Text style={styles.step}>3. Allow the chest to fully recoil between pushes.</Text>
        <Text style={styles.step}>4. Keep pushing until the emergency squad arrives.</Text>
      </View>
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
    fontSize: 18,
    color: '#ff1a1a',
    fontWeight: 'bold',
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 2,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(160, 200, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 40
  },
  rhythmIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ff1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff1a1a',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    marginBottom: 40
  },
  pulseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1
  },
  instructions: {
    width: '100%',
    backgroundColor: 'rgba(7,22,44,0.6)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,200,255,0.15)'
  },
  step: {
    color: '#e0eaff',
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20
  }
});
