import { Stack, useRouter, usePathname } from 'expo-router';
import { ThemeProvider } from '../contexts/ThemeContext';
import { DiagnosticsProvider } from '../contexts/DiagnosticsContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Redirect } from 'expo-router';

export default function RootLayout() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();  // Hook for theme colors

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const completed = await AsyncStorage.getItem('onboardingComplete');
        setIsOnboardingComplete(!!completed);
      } catch (error) {
        console.warn('Onboarding check error:', error);  // Use warn for non-critical
        setIsOnboardingComplete(false);  // Default to onboarding on error
      } finally {
        setIsLoaded(true);
      }
    }
    checkOnboarding();
  }, []);

  // Loading state
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Redirect for onboarding
  if (isOnboardingComplete === false && pathname !== '/onboarding') {
    return <Redirect href="/onboarding" />;
  }

  if (isOnboardingComplete === true && pathname === '/onboarding') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <DiagnosticsProvider>
            <StatusBar style="auto" backgroundColor={colors.cardBackground} translucent={true} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </DiagnosticsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
