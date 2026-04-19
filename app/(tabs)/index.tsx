import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useState } from "react";

export default function TabsLayout() {
  const [profileModal, setProfileModal] = useState<null | "terms" | "privacy">(null);

  return (
    <>
      {/* ========================= */}
      {/* TABS */}
      {/* ========================= */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: "",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name="camera"
                size={24}
                color={focused ? "white" : "rgba(255,255,255,0.6)"}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            tabBarLabel: "",
            tabBarIcon: ({ focused }) => (
              <Ionicons
                name="person"
                size={24}
                color={focused ? "white" : "rgba(255,255,255,0.6)"}
              />
            ),
          }}
        />
      </Tabs>

      {/* ========================= */}
      {/* TERMS OF SERVICE MODAL */}
      {/* ========================= */}
      <Modal
        visible={profileModal === "terms"}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Terms of Service</Text>
              <Pressable
                onPress={() => setProfileModal(null)}
                style={styles.closePill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalDesc}>
                Welcome to Evan AI. By using this app, you agree to these Terms.
                Evan AI helps identify items and surface potentially cheaper
                alternatives using third-party marketplaces.
              </Text>

              <Text style={styles.sectionTitle}>1. What Evan AI Does</Text>
              <Text style={styles.modalDesc}>
                Evan AI does not sell products and is not responsible for
                pricing, availability, shipping, or seller behavior on external
                marketplaces.
              </Text>

              <Text style={styles.sectionTitle}>2. Eligibility</Text>
              <Text style={styles.modalDesc}>
                You must comply with applicable laws and App Store policies.
              </Text>

              <Text style={styles.sectionTitle}>3. Free Scans & Pro</Text>
              <Text style={styles.modalDesc}>
                Free scans may be limited. Pro subscriptions are handled by the
                App Store.
              </Text>

              <Text style={styles.sectionTitle}>4. Accuracy</Text>
              <Text style={styles.modalDesc}>
                Results are provided “as is” without guarantees.
              </Text>

              <Text style={styles.modalFoot}>
                Last updated: {new Date().getFullYear()}
              </Text>
            </ScrollView>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => setProfileModal("privacy")}
            >
              <Text style={styles.primaryText}>View Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ========================= */}
      {/* PRIVACY POLICY MODAL */}
      {/* ========================= */}
      <Modal
        visible={profileModal === "privacy"}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <Pressable
                onPress={() => setProfileModal(null)}
                style={styles.closePill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalDesc}>
                Evan AI processes photos to identify items and retrieve
                marketplace data. We do not sell personal data.
              </Text>

              <Text style={styles.modalFoot}>
                Last updated: {new Date().getFullYear()}
              </Text>
            </ScrollView>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => setProfileModal(null)}
            >
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "black",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    height: 72,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 20,
    backgroundColor: "rgba(15,15,15,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 24,
    paddingHorizontal: 22,
  },

  modalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
  },

  sectionTitle: {
    marginTop: 14,
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  },

  modalDesc: {
    marginTop: 8,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
    lineHeight: 20,
  },

  modalFoot: {
    marginTop: 14,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },

  closePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  closeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },

  primaryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
  },

  primaryText: {
    color: "black",
    fontWeight: "900",
    fontSize: 14,
  },
});
