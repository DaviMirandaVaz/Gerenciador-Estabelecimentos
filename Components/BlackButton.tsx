import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type Props = {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
  pill?: boolean;
};

export default function BlackButton({ label, onPress, style, pill = true }: Props) {
  return (
    <Pressable
      style={[
        styles.button,
        pill ? styles.pill : styles.rounded,
        style
      ]}
      onPress={onPress}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#1F2024',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  pill: {
    borderRadius: 50,
  },
  rounded: {
    borderRadius: 20,
  },
  label: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  }
});
