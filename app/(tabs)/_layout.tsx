import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import React from 'react';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: "#a1a6ed",
      headerStyle: {
        backgroundColor: '#214067'
      },
      headerShadowVisible: false,
      headerTintColor: '#fff',
      tabBarStyle: {
        backgroundColor: '#25292e',
      },
    }}>
      <Tabs.Screen name="index"
        options={{
          headerTitle: "Página inicial",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
          ),
          headerLeft: () => <></>
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          headerTitle: "Sobre",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'information-circle' : 'information-circle-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cloud-to-do"
        options={{
          headerTitle: "Cloud ToDo",
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? "checkbox" : "checkbox-outline"}
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
