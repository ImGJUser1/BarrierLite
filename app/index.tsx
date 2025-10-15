import { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useDiagnostics } from '../contexts/DiagnosticsContext';
import { startBackend } from '../src/utils/backgroundService';

export default function Index() {
  const router = useRouter();
  const { colors } = useTheme();
  const { diagnostics } = useDiagnostics();

  useEffect(() => {
    // Check if diagnostics have been completed
    const timer = setTimeout(() => {
      if (diagnostics?.completed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [diagnostics]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});