import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Provider as PaperProvider, MD3LightTheme } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as storage from "./src/services/storage";
import { isAuthenticated } from "./src/services/googleAuth";
import { fullSync } from "./src/services/syncService";
import TaskListScreen from "./src/screens/TaskListScreen";
import NextTaskScreen from "./src/screens/NextTaskScreen";
import ProjectsScreen from "./src/screens/ProjectsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#6750A4",
    secondary: "#625B71",
  },
};

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await storage.initDatabase();
      setReady(true);
      // Background sync on startup if authenticated
      isAuthenticated()
        .then((authed) => {
          if (authed) {
            fullSync().catch(() => {});
          }
        })
        .catch(() => {});
    };
    init();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor: theme.colors.primary,
              tabBarInactiveTintColor: "gray",
              headerStyle: {
                backgroundColor: theme.colors.primary,
              },
              headerTintColor: "#fff",
            }}
          >
            <Tab.Screen
              name="NextTask"
              component={NextTaskScreen}
              options={{
                title: "次のタスク",
                tabBarLabel: "次のタスク",
                tabBarIcon: ({ color, size }) => (
                  <MaterialCommunityIcons name="star" color={color} size={size} />
                ),
              }}
            />
            <Tab.Screen
              name="Tasks"
              component={TaskListScreen}
              options={{
                title: "タスク一覧",
                tabBarLabel: "タスク",
                tabBarIcon: ({ color, size }) => (
                  <MaterialCommunityIcons
                    name="format-list-bulleted"
                    color={color}
                    size={size}
                  />
                ),
              }}
            />
            <Tab.Screen
              name="Projects"
              component={ProjectsScreen}
              options={{
                title: "プロジェクト",
                tabBarLabel: "プロジェクト",
                tabBarIcon: ({ color, size }) => (
                  <MaterialCommunityIcons name="folder" color={color} size={size} />
                ),
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                title: "設定",
                tabBarLabel: "設定",
                tabBarIcon: ({ color, size }) => (
                  <MaterialCommunityIcons name="cog" color={color} size={size} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
