import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Platform } from 'react-native';
import { useEffect } from 'react';

export default function TabLayout() {
  const { colors } = useTheme();  // Safe hook; assume fallback in ThemeContext if not loaded

  useEffect(() => {
    // Optional: Preload fonts/icons if needed
    if (Platform.OS === 'web') {
      // Web-specific optimizations
      document.body.style.overflow = 'hidden';  // Prevent scroll issues
    }
  }, []);

  const getIcon = (name: string) => (props: { color: string; size: number }) => {
    try {
      return <Ionicons name={name as any} size={props.size} color={props.color} />;
    } catch (error) {
      console.warn(`Icon "${name}" failed to load:`, error);
      return <Ionicons name="help-circle" size={props.size} color={props.color} />;  // Fallback icon
    }
  };

  return (
    <Tabs
      initialRouteName="index"  // Start with Dashboard (Home)
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopColor: colors.border,
          borderTopWidth: Platform.OS === 'ios' ? 0.5 : 0,
          height: 60,
          paddingBottom: Platform.OS === 'ios' ? 8 : 0,
          paddingTop: 8,
          position: 'absolute',  // For edge-to-edge
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        headerStyle: {
          backgroundColor: colors.cardBackground,
          elevation: 0,  // Android shadow none
          shadowOpacity: 0,  // iOS shadow none
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        lazy: true,  // Lazy load tabs for perf
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: 'Dashboard',
          tabBarIcon: getIcon('home-outline'),
          lazy: true,
        }}
      />
      <Tabs.Screen
        name="remote"
        options={{
          title: 'Remote',
          tabBarIcon: getIcon('desktop-outline'),
          lazy: true,
        }}
      />
      <Tabs.Screen
        name="automate"
        options={{
          title: 'Automate',
          tabBarIcon: getIcon('flash-outline'),
          lazy: true,
        }}
      />
      <Tabs.Screen
        name="iot"
        options={{
          title: 'IoT',
          tabBarIcon: getIcon('bulb-outline'),
          lazy: true,
        }}
      />
      <Tabs.Screen
        name="hub"
        options={{
          title: 'Hub',
          headerTitle: 'Virtualization Hub',
          tabBarIcon: getIcon('cube-outline'),
          lazy: true,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: getIcon('settings-outline'),
          lazy: true,
        }}
      />
    </Tabs>
  );
}
