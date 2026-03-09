import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { fetchDonations } from "../services/api";

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [donations, setDonations] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchDonations()
      .then((data) => {
        if (mounted) {
          setDonations(data.items || []);
        }
      })
      .catch(() => {
        if (mounted) {
          setDonations([]);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return donations;
    }
    return donations.filter((d) => `${d.food} ${d.location} ${d.donor}`.toLowerCase().includes(q));
  }, [search, donations]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search food or location"
        value={search}
        onChangeText={setSearch}
      />

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 23.685,
          longitude: 90.3563,
          latitudeDelta: 3.2,
          longitudeDelta: 3.2
        }}
      >
        {filtered.map((item) => (
          <Marker
            key={String(item.id)}
            coordinate={{ latitude: Number(item.lat), longitude: Number(item.lng) }}
            title={item.food}
            description={`${item.location} | ${item.status}`}
          />
        ))}
      </MapView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.food}</Text>
            <Text style={styles.meta}>{item.location} | {item.quantity} servings</Text>
            <Text style={styles.status}>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb", padding: 12 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f7fb" },
  search: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce7f2", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  map: { height: 220, borderRadius: 12, marginBottom: 10 },
  list: { paddingBottom: 20 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce7f2", borderRadius: 12, padding: 10, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#16202a" },
  meta: { color: "#5d6a79", marginTop: 3 },
  status: { marginTop: 4, color: "#0f766e", fontWeight: "700", textTransform: "capitalize" }
});
