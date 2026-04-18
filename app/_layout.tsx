import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme, View } from "react-native";
import { AuthProvider } from "../components/auth/AuthContext";
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
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SpatialProvider>
          <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
            <StatusBar style="light" />
            {/* Layer 0: 3D spatial void (behind everything) */}
            <SpatialBackground />
            {/* Layer 1: Existing RN UI (on top, transparent bg) */}
            <View style={{ flex: 1, backgroundColor: "transparent" }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "transparent" },
                  animation: "none",
                }}
              />
            </View>
          </ThemeProvider>
        </SpatialProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
