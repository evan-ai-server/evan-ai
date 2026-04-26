import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { HapticTab } from "../../components/haptic-tab";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        lazy: true,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#0b0b0f",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        // Lock tab buttons to exact dimensions — prevents layout reflow
        tabBarItemStyle: { width: 60, height: 50 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" color={color} size={28} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <Ionicons name="paper-plane" color={color} size={28} />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <Ionicons name="time-outline" color={color} size={28} />
          ),
        }}
      />

      <Tabs.Screen
        name="profit"
        options={{
          title: "Profit",
          tabBarIcon: ({ color }) => (
            <Ionicons name="bar-chart-outline" color={color} size={28} />
          ),
        }}
      />
    </Tabs>
  );
}
