import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { fetchDemandPredictions } from "../services/api";

const mockLeaderboard = [
  { name: "Aarav", points: 120 },
  { name: "Nisha", points: 95 },
  { name: "Rahim", points: 70 }
];

function getBadges(points) {
  const badges = [];
  if (points >= 50) badges.push("Rising Star");
  if (points >= 120) badges.push("Fast Rescuer");
  if (points >= 220) badges.push("Community Hero");
  return badges.length ? badges : ["New Helper"];
}

export default function CommunityScreen() {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState([]);

  useEffect(() => {
    fetchDemandPredictions()
      .then((res) => setPredictions(res.items || []))
      .catch(() => setPredictions([]))
      .finally(() => setLoading(false));
  }, []);

  const top = useMemo(() => [...mockLeaderboard].sort((a, b) => b.points - a.points), []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.head}>Volunteer Leaderboard</Text>
      <FlatList
        data={top}
        keyExtractor={(item) => item.name}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.name}>#{index + 1} {item.name}</Text>
            <Text style={styles.points}>{item.points} pts</Text>
          </View>
        )}
      />

      <Text style={[styles.head, { marginTop: 12 }]}>Your Badges</Text>
      <View style={styles.badges}>
        {getBadges(120).map((badge) => (
          <Text key={badge} style={styles.badge}>{badge}</Text>
        ))}
      </View>

      <Text style={[styles.head, { marginTop: 12 }]}>AI Demand Prediction</Text>
      {(predictions || []).slice(0, 5).map((item) => (
        <View key={item.location} style={styles.prediction}>
          <Text style={styles.name}>{item.location}</Text>
          <Text style={styles.meta}>Score: {item.demandScore} | {item.recommendation}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7fb", padding: 12 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f7fb" },
  head: { fontSize: 17, fontWeight: "800", color: "#16202a", marginBottom: 8 },
  row: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce7f2", borderRadius: 10, padding: 10, marginBottom: 6, flexDirection: "row", justifyContent: "space-between" },
  name: { fontWeight: "700", color: "#16202a" },
  points: { color: "#0f766e", fontWeight: "700" },
  badges: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badge: { backgroundColor: "#e0f2fe", color: "#075985", borderWidth: 1, borderColor: "#bae6fd", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontWeight: "700" },
  prediction: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce7f2", borderRadius: 10, padding: 10, marginBottom: 6 },
  meta: { color: "#5d6a79", marginTop: 4 }
});
