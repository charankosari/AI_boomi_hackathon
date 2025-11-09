/**
 * MCP Orchestrator App
 * Main application entry point
 * Sets up navigation and context providers
 */

import "react-native-gesture-handler";
import React from "react";
import { LogBox, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { Provider as PaperProvider } from "react-native-paper";
import { ConversationProvider } from "./src/context/ConversationContext";
import { MCPProvider } from "./src/context/MCPContext";
import HomeScreen from "./src/screens/HomeScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import MCPsScreen from "./src/screens/MCPsScreen";
import MCPDetailScreen from "./src/screens/MCPDetailScreen";
import { THEME, COLORS } from "./src/constants/colors";

// Ignore specific warnings
LogBox.ignoreLogs(["Warning: ..."]); // Ignore log notification by message
LogBox.ignoreAllLogs(); // Ignore all log notifications

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Conversations Stack (for chat detail)
function ConversationsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: COLORS.BACKGROUND },
      }}
    >
      <Stack.Screen name="ConversationsList" component={HomeScreen} />
      <Stack.Screen name="Chat" component={HistoryScreen} />
    </Stack.Navigator>
  );
}

// MCPs Stack (for MCP detail)
function MCPsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: COLORS.BACKGROUND },
      }}
    >
      <Stack.Screen name="MCPsList" component={MCPsScreen} />
      <Stack.Screen name="MCPDetail" component={MCPDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <PaperProvider theme={THEME}>
      <ConversationProvider>
        <MCPProvider>
          <NavigationContainer>
            <Tab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: COLORS.TEXT_PRIMARY,
                tabBarInactiveTintColor: COLORS.TEXT_SECONDARY,
                tabBarStyle: {
                  backgroundColor: COLORS.SURFACE,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.BORDER,
                  height: 60,
                  paddingBottom: 8,
                  paddingTop: 8,
                },
                tabBarLabelStyle: {
                  fontSize: 12,
                  fontWeight: "500",
                },
              }}
            >
              <Tab.Screen
                name="Conversations"
                component={ConversationsStack}
                options={{
                  tabBarIcon: ({ color }) => (
                    <Text style={{ fontSize: 24, color }}>💬</Text>
                  ),
                }}
              />
              <Tab.Screen
                name="MCPs"
                component={MCPsStack}
                options={{
                  tabBarIcon: ({ color }) => (
                    <Text style={{ fontSize: 24, color }}>🔧</Text>
                  ),
                }}
              />
            </Tab.Navigator>
          </NavigationContainer>
        </MCPProvider>
      </ConversationProvider>
    </PaperProvider>
  );
}
