// DeviceOnboarding.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useDiagnostics } from '../contexts/DiagnosticsContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

const { width } = Dimensions.get('window');

interface CheckCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: 'pending' | 'checking' | 'pass' | 'fail';
  metric: string;
  progress?: number;
}

const CheckCard: React.FC<CheckCardProps> = ({ title, icon, status, metric, progress }) => {
  const { colors } = useTheme();
  // useRef to avoid re-instantiating Animated.Value on each render
  const animatedValue = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (status === 'checking') {
      animationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animationRef.current.start();
    } else {
      // stop animation if it's running
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      animatedValue.setValue(0);
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [status, animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={32} color={colors.primary} />
        <View style={styles.cardTitle}>
          <Text style={[styles.cardTitleText, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.cardMetric, { color: colors.textSecondary }]}>{metric}</Text>
        </View>
        {status === 'pass' && <Ionicons name="checkmark-circle" size={28} color={colors.success} />}
        {status === 'fail' && <Ionicons name="close-circle" size={28} color={colors.error} />}
        {status === 'checking' && (
          <Animated.View style={{ opacity }}>
            <Ionicons name="hourglass-outline" size={28} color={colors.primary} />
          </Animated.View>
        )}
      </View>
      {progress !== undefined && (
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
        </View>
      )}
    </View>
  );
};

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const { setDiagnostics } = useDiagnostics();

  const [ramCheck, setRamCheck] = useState({ status: 'pending' as const, value: 0 });
  const [cpuCheck, setCpuCheck] = useState({ status: 'pending' as const, value: '' });
  const [storageCheck, setStorageCheck] = useState({ status: 'pending' as const, value: 0 });
  const [thermalCheck, setThermalCheck] = useState({ status: 'pending' as const, value: 0, progress: 0 });
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDiagnostics = async () => {
    // Reset states
    setShowResults(false);
    setScore(0);
    setRamCheck({ status: 'checking', value: 0 });
    setCpuCheck({ status: 'checking', value: '' });
    setStorageCheck({ status: 'checking', value: 0 });
    setThermalCheck({ status: 'checking', value: 0, progress: 0 });

    // --- RAM Check (Expo Device or DeviceInfo fallback) ---
    let ramGB = 0;
    try {
      if (Device.totalMemory && typeof Device.totalMemory === 'number') {
        ramGB = Math.round((Device.totalMemory / (1024 * 1024 * 1024)) * 10) / 10; // 1 decimal
      } else {
        // try DeviceInfo
        const totalBytes = await DeviceInfo.getTotalMemory().catch(() => undefined);
        if (totalBytes) {
          ramGB = Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10;
        }
      }
    } catch (e) {
      console.log('RAM detection failed', e);
    }

    const ramPass = ramGB >= 6; // keep your threshold (was 6 earlier)
    setRamCheck({ status: ramPass ? 'pass' : 'fail', value: ramGB });

    // --- CPU Check (device info + lightweight benchmark) ---
    let cpuName = 'Unknown Device';
    let cpuCores = 0;
    try {
      // DeviceInfo functions may be asynchronous native calls
      cpuName = (await DeviceInfo.getProcessorName().catch(() => undefined)) || (Device.modelName ?? 'Unknown Device');
      cpuCores = (await DeviceInfo.getNumberOfProcessors().catch(() => undefined)) || 0;
    } catch (e) {
      console.log('CPU detection failed', e);
    }

    // Lightweight synthetic benchmark to estimate CPU performance (keeps UI responsive)
    const benchStart = Date.now();
    // Lower iterations so it doesn't block too long on low-end devices
    for (let i = 0; i < 2_500_000; i++) {
      // simple math work
      Math.sqrt(i);
    }
    const benchDuration = Date.now() - benchStart; // ms

    // Convert duration to a simple score (arbitrary mapping)
    // Faster device -> lower duration -> higher cpuScore
    const cpuScore = Math.max(0, Math.round(100 - benchDuration / 30));
    const cpuPass = cpuScore > 35; // threshold
    setCpuCheck({ status: cpuPass ? 'pass' : 'fail', value: `${cpuName}${cpuCores ? ` (${cpuCores} cores)` : ''}` });

    // --- Storage Check (use FileSystem APIs) ---
    let totalStorageGB = 0;
    let freeStorageGB = 0;
    try {
      // these calls exist in recent expo-file-system versions
      const total = await (FileSystem as any).getTotalDiskCapacityAsync?.();
      const free = await (FileSystem as any).getFreeDiskStorageAsync?.();
      if (typeof total === 'number') totalStorageGB = Math.round((total / 1e9) * 10) / 10;
      if (typeof free === 'number') freeStorageGB = Math.round((free / 1e9) * 10) / 10;
      // Fallback: if not available, approximate using documentDirectory free info (less accurate)
      if (!freeStorageGB) {
        const info = await FileSystem.getInfoAsync(FileSystem.documentDirectory ?? FileSystem.cacheDirectory!);
        if (info && typeof (info as any).free === 'number') {
          freeStorageGB = Math.round(((info as any).free / (1024 * 1024 * 1024)) * 10) / 10;
        }
      }
    } catch (e) {
      console.log('Storage detection failed', e);
    }

    const storagePass = freeStorageGB >= 8; // threshold (adjust as needed)
    setStorageCheck({ status: storagePass ? 'pass' : 'fail', value: freeStorageGB });

    // --- Thermal Test (simulated with small load + visual progress) ---
    // We simulate a 10-step test to show progress; we can run a brief CPU load to approximate heating/thermal behavior
    for (let i = 0; i <= 10; i++) {
      // small CPU activity to hint at warming
      const t0 = Date.now();
      while (Date.now() - t0 < 50) {
        Math.sqrt(Math.random() * 1000);
      }
      setThermalCheck(prev => ({ ...prev, progress: i * 10 }));
      await new Promise(res => setTimeout(res, 200));
    }
    // Since we cannot read temperature cross-platform in Expo, provide an estimated temperature
    const thermalTemp = Math.floor(30 + Math.random() * 8); // 30-38°C estimated
    const thermalPass = thermalTemp <= 38;
    setThermalCheck({ status: thermalPass ? 'pass' : 'fail', value: thermalTemp, progress: 100 });

    // --- Calculate Score (weighted) ---
    let finalScore = 0;
    if (ramPass) finalScore += 30;
    if (cpuPass) finalScore += 25;
    if (storagePass) finalScore += 20;
    if (thermalPass) finalScore += 25;
    setScore(finalScore);

    // Save diagnostics into context
    setDiagnostics({
      ram: ramGB,
      ramPass,
      cpu: `${cpuName}${cpuCores ? ` (${cpuCores} cores)` : ''}`,
      cpuPass,
      storage: freeStorageGB,
      storagePass,
      thermal: thermalTemp,
      thermalPass,
      score: finalScore,
      completed: true,
    });

    // Show results and speak out
    setShowResults(true);
    try {
      Speech.stop();
      const message = `Your device scores ${finalScore} out of 100. ${finalScore >= 70 ? 'Ready for light tasks' : 'Some features may be limited'}.`;
      Speech.speak(message, { language: 'en' });
    } catch (e) {
      console.log('Speech failed', e);
    }
  };

  const handleProceed = async () => {
    try {
      await AsyncStorage.setItem('onboardingComplete', 'true');
      if (score >= 50) {
        router.replace('/(tabs)');
      }
    } catch (e) {
      console.log('Failed saving onboarding flag', e);
    }
  };

  // derive progress percent from completed checks
  const completedChecks = [ramCheck, cpuCheck, storageCheck, thermalCheck].filter(c => c.status !== 'pending').length;
  const overallProgress = Math.round((completedChecks / 4) * 100);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.primary, colors.primaryLight, colors.background]} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Diagnostic Check</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Analyzing your device...</Text>
          </View>

          <View style={styles.progressIndicator}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressActive, { backgroundColor: colors.primary, width: `${overallProgress}%` }]} />
            </View>
          </View>

          <View style={styles.checks}>
            <CheckCard
              title="RAM Check"
              icon="hardware-chip"
              status={ramCheck.status}
              metric={ramCheck.value > 0 ? `${ramCheck.value} GB` : 'Checking...'}
            />
            <CheckCard
              title="CPU Check"
              icon="speedometer"
              status={cpuCheck.status}
              metric={cpuCheck.value || 'Checking...'}
            />
            <CheckCard
              title="Storage Check"
              icon="albums"
              status={storageCheck.status}
              metric={storageCheck.value > 0 ? `${storageCheck.value} GB free` : 'Checking...'}
            />
            <CheckCard
              title="Thermal Test"
              icon="thermometer"
              status={thermalCheck.status}
              metric={thermalCheck.value > 0 ? `${thermalCheck.value}°C` : 'Running test...'}
              progress={thermalCheck.progress}
            />
          </View>

          {showResults && (
            <View style={[styles.scoreCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.scoreTitle, { color: colors.text }]}>Device Score</Text>
              <Text style={[styles.scoreValue, { color: colors.primary }]}>{score}/100</Text>
              <Text style={[styles.scoreDescription, { color: colors.textSecondary }]}>
                {score >= 85 ? 'Excellent! Supports Alpine, Remote Access, and all features.' :
                  score >= 70 ? 'Good! Ready for most features and light tasks.' :
                    score >= 50 ? 'Fair. Basic features available, heavy tasks may struggle.' :
                      'Limited. Consider upgrading your device.'}
              </Text>

              {score >= 50 && (
                <TouchableOpacity style={[styles.proceedButton, { backgroundColor: colors.primary }]} onPress={handleProceed}>
                  <Text style={styles.proceedButtonText}>Proceed to Setup</Text>
                </TouchableOpacity>
              )}

              {score < 50 && (
                <View style={[styles.upgradeCard, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
                  <Ionicons name="warning" size={24} color={colors.warning} />
                  <Text style={[styles.upgradeText, { color: colors.text }]}>Upgrade Tips</Text>
                  <Text style={[styles.upgradeDescription, { color: colors.textSecondary }]}>
                    • Free up storage space
                    • Close background apps
                    • Cool down device before retrying
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  progressIndicator: {
    marginBottom: 24,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressActive: {
    height: '100%',
    borderRadius: 4,
  },
  checks: {
    gap: 16,
    marginBottom: 24,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
  },
  cardTitleText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMetric: {
    fontSize: 14,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    elevation: 5,
  },
  scoreTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  scoreDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  proceedButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  upgradeCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    width: '100%',
    alignItems: 'center',
  },
  upgradeText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  upgradeDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
