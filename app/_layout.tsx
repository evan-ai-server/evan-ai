import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { Appearance, View } from "react-native";
import { AuthProvider } from "../components/auth/AuthContext";

Appearance.setColorScheme("dark");
import { SpatialProvider } from "../components/spatial/SpatialContext";
import { SpatialEngine } from "../components/spatial/SpatialEngine";
import { useSpatialZone } from "../components/spatial/SpatialContext";

function SpatialBackground() {
  const {
    zone, setTransitioning, verdict, warpActive, endWarp, laserActive,
    archiveItems, setInspectedArchiveId,
  } = useSpatialZone();
  return (
    <SpatialEngine
      zone={zone}
      onTransitionStart={() => setTransitioning(true)}
      onTransitionEnd={() => setTransitioning(false)}
      verdict={verdict}
      warpActive={warpActive}
      onWarpComplete={endWarp}
      laserActive={laserActive}
      archiveItems={archiveItems}
      onArchiveInspect={setInspectedArchiveId}
    />
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SpatialProvider>
          <ThemeProvider value={DarkTheme}>
            <StatusBar style="light" />
            {/* Layer 0: 3D spatial void (behind everything) */}
            <SpatialBackground />
            {/* Layer 1: Existing RN UI (on top, transparent bg) */}
            <View style={{ flex: 1, backgroundColor: "transparent" }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "transparent" },
                  animation: "fade",
                  animationDuration: 180,
                  freezeOnBlur: true,
                }}
              />
            </View>
          </ThemeProvider>
        </SpatialProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
