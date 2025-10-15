import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { useDiagnostics } from '../../contexts/DiagnosticsContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';

export default function Settings() {
  const { colors, theme, toggleTheme, lowResourceMode, setLowResourceMode } = useTheme();
  const { diagnostics, thermalWarning, setThermalWarning } = useDiagnostics();
  const router = useRouter();
  const [autoThrottle, setAutoThrottle] = useState(true);
  const [voiceAlerts, setVoiceAlerts] = useState(true);
  const [language, setLanguage] = useState('English');

  const currentTemp = diagnostics?.thermal || 35;
  const currentCPU = 45; // Mock CPU usage

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#607D8B', '#90A4AE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Ionicons name="settings" size={32} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Settings</Text>
        </LinearGradient>

        {/* Theme Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name={theme === 'dark' ? 'moon' : 'sunny'} size={24} color={colors.primary} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Theme</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </Text>
                </View>
              </View>
              <Switch
                value={theme === 'dark'}
                onValueChange={() => {
                  toggleTheme();
                  Speech.speak(`Switched to ${theme === 'light' ? 'dark' : 'light'} mode`, { language: 'en' });
                }}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={theme === 'dark' ? colors.primary : colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Thermal Monitor */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Thermal Monitor</Text>
          <View style={[styles.monitorCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.gauges}>
              <View style={styles.gauge}>
                <View
                  style={[
                    styles.gaugeCircle,
                    { borderColor: currentTemp > 38 ? colors.error : colors.success },
                  ]}
                >
                  <Ionicons
                    name="thermometer"
                    size={32}
                    color={currentTemp > 38 ? colors.error : colors.success}
                  />
                  <Text style={[styles.gaugeValue, { color: colors.text }]}>{currentTemp}°C</Text>
                </View>
                <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>Temperature</Text>
              </View>
              <View style={styles.gauge}>
                <View
                  style={[
                    styles.gaugeCircle,
                    { borderColor: currentCPU > 70 ? colors.warning : colors.primary },
                  ]}
                >
                  <Ionicons
                    name="speedometer"
                    size={32}
                    color={currentCPU > 70 ? colors.warning : colors.primary}
                  />
                  <Text style={[styles.gaugeValue, { color: colors.text }]}>{currentCPU}%</Text>
                </View>
                <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>CPU Usage</Text>
              </View>
            </View>
            
            {currentTemp > 38 && (
              <View style={[styles.alertCard, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
                <Ionicons name="warning" size={24} color={colors.error} />
                <Text style={[styles.alertText, { color: colors.error }]}>
                  High temperature detected! Throttling enabled.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Resource Control */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Resource Control</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="battery-charging" size={24} color={colors.primary} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Low Resource Mode</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    Hide animations on low battery
                  </Text>
                </View>
              </View>
              <Switch
                value={lowResourceMode}
                onValueChange={setLowResourceMode}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={lowResourceMode ? colors.primary : colors.textSecondary}
              />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="flame" size={24} color={colors.warning} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Auto Throttle</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    Pause tasks at >38°C
                  </Text>
                </View>
              </View>
              <Switch
                value={autoThrottle}
                onValueChange={setAutoThrottle}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={autoThrottle ? colors.primary : colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Voice & Language */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Voice & Language</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="mic" size={24} color={colors.primary} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Voice Alerts</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    Enable voice readouts
                  </Text>
                </View>
              </View>
              <Switch
                value={voiceAlerts}
                onValueChange={setVoiceAlerts}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={voiceAlerts ? colors.primary : colors.textSecondary}
              />
            </View>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
              <View style={styles.settingInfo}>
                <Ionicons name="language" size={24} color={colors.primary} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Language</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{language}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Device Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Information</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/onboarding')}
              activeOpacity={0.7}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="analytics" size={24} color={colors.primary} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Run Diagnostics</Text>
                  <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                    Score: {diagnostics?.score || 0}/100
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.deviceStats}>
              <View style={styles.deviceStat}>
                <Text style={[styles.deviceStatLabel, { color: colors.textSecondary }]}>RAM</Text>
                <Text style={[styles.deviceStatValue, { color: colors.text }]}>{diagnostics?.ram || 6} GB</Text>
              </View>
              <View style={styles.deviceStat}>
                <Text style={[styles.deviceStatLabel, { color: colors.textSecondary }]}>Storage</Text>
                <Text style={[styles.deviceStatValue, { color: colors.text }]}>{diagnostics?.storage || 64} GB</Text>
              </View>
              <View style={styles.deviceStat}>
                <Text style={[styles.deviceStatLabel, { color: colors.textSecondary }]}>Thermal</Text>
                <Text style={[styles.deviceStatValue, { color: colors.text }]}>{diagnostics?.thermal || 35}°C</Text>
              </View>
            </View>
          </View>
        </View>

        {/* About */}
        <View style={[styles.aboutCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.text }]}>BarrierOS Lite</Text>
          <Text style={[styles.aboutVersion, { color: colors.textSecondary }]}>Version 1.0.0</Text>
          <Text style={[styles.aboutDescription, { color: colors.textSecondary }]}>
            Every Device is Infinite
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  settingCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
  },
  monitorCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  gauges: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  gauge: {
    alignItems: 'center',
  },
  gaugeCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gaugeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  gaugeLabel: {
    fontSize: 14,
  },
  alertCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    alignItems: 'center',
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  deviceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  deviceStat: {
    alignItems: 'center',
  },
  deviceStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  deviceStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  aboutCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  aboutTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  aboutVersion: {
    fontSize: 14,
    marginBottom: 12,
  },
  aboutDescription: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});