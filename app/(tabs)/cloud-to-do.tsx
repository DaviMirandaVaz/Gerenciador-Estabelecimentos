import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CloudToDo() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tarefas Locais</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    color: '#FFF',
  },
});