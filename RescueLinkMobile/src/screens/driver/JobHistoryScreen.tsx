import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

export default function JobHistoryScreen() {
  const history = [
    { id: 'JOB-7782', date: '2026-06-15', dest: 'Metro Cardiac Hospital', status: 'completed' },
    { id: 'JOB-4122', date: '2026-06-14', dest: 'General ER Ward 5', status: 'completed' }
  ];

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.id}>{item.id}</Text>
      <Text style={styles.date}>Date: {item.date}</Text>
      <Text style={styles.dest}>Destination: {item.dest}</Text>
      <Text style={styles.status}>✅ COMPLETED</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Completed Trips Log</Text>
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        renderItem={renderItem}
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
  title: {
    fontSize: 16,
    color: '#00c8ff',
    fontWeight: 'bold',
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
  id: {
    color: '#00c8ff',
    fontWeight: 'bold',
    fontSize: 14
  },
  date: {
    color: 'rgba(160, 200, 255, 0.6)',
    fontSize: 12,
    marginTop: 4
  },
  dest: {
    color: '#e0eaff',
    fontSize: 13,
    marginTop: 4
  },
  status: {
    color: '#00ff88',
    fontWeight: 'bold',
    fontSize: 11,
    marginTop: 8
  }
});
