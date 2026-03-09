import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchDonations, updateDonationStatus } from "../services/api";

export default function VolunteerScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchDonations()
      .then((data) => {
        const available = (data.items || []).filter((d) => d.status === "available");
        setItems(available);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const accept = async (id) => {
    try {
      await updateDonationStatus(id, "accepted");
      Alert.alert("Success", "Pickup accepted");
      load();
    } catch {
      Alert.alert("Error", "Unable to accept pickup");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nearby Available Donations</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.food}>{item.food}</Text>
            <Text style={styles.meta}>{item.location} | {item.quantity} servings</Text>
            <Pressable style={styles.button} onPress={() => accept(item.id)}>
              <Text style={styles.buttonText}>One-Click Pickup</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No available donations now.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb", padding: 12 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f7fb" },
  title: { fontSize: 18, fontWeight: "800", color: "#16202a", marginBottom: 10 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce7f2", borderRadius: 12, padding: 10, marginBottom: 9 },
  food: { fontSize: 16, fontWeight: "700", color: "#16202a" },
  meta: { color: "#5d6a79", marginTop: 4, marginBottom: 8 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  empty: { color: "#5d6a79", marginTop: 20 }
});
