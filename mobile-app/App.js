import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import HomeScreen from "./src/screens/HomeScreen";
import VolunteerScreen from "./src/screens/VolunteerScreen";
import CommunityScreen from "./src/screens/CommunityScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#ffffff" },
            tabBarActiveTintColor: "#0f766e",
            tabBarStyle: { backgroundColor: "#ffffff", borderTopColor: "#e4edf6" }
          }}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Volunteer" component={VolunteerScreen} />
          <Tab.Screen name="Community" component={CommunityScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
