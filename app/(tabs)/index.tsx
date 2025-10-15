import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { useDiagnostics } from '../../contexts/DiagnosticsContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2;

interface ActionCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

const ActionCard: React.FC<ActionCardProps> = ({ title, icon, color, onPress }) => {
  const { colors } = useTheme();
  
  return (
    <TouchableOpacity
      style={[styles.actionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={32} color={color} />
      </View>
      <Text style={[styles.actionCardTitle, { color: colors.text }]}>{title}</Text>
    </TouchableOpacity>
  );
};

export default function Dashboard() {
  const { colors } = useTheme();
  const { diagnostics } = useDiagnostics();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Card */}
        <LinearGradient
          colors={[colors.primary, colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroTitle}>Every Device is Infinite</Text>
          <Text style={styles.heroSubtitle}>
            Transform your Android into a powerful productivity hub
          </Text>
          {diagnostics && (
            <View style={styles.deviceScore}>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.deviceScoreText}>Device Score: {diagnostics.score}/100</Text>
            </View>
          )}
        </LinearGradient>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="hardware-chip" size={24} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{diagnostics?.ram || 6} GB</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>RAM</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="thermometer" size={24} color={diagnostics?.thermal && diagnostics.thermal > 38 ? colors.error : colors.success} />
            <Text style={[styles.statValue, { color: colors.text }]}>{diagnostics?.thermal || 35}°C</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Thermal</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="albums" size={24} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{diagnostics?.storage || 64} GB</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Storage</Text>
          </View>
        </View>

        {/* Action Cards */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          <ActionCard
            title="Remote Access"
            icon="desktop"
            color={colors.primary}
            onPress={() => router.push('/(tabs)/remote')}
          />
          <ActionCard
            title="Automate Tasks"
            icon="flash"
            color="#FF6B35"
            onPress={() => router.push('/(tabs)/automate')}
          />
          <ActionCard
            title="IoT Control"
            icon="bulb"
            color="#FFC107"
            onPress={() => router.push('/(tabs)/iot')}
          />
          <ActionCard
            title="Add OS"
            icon="cube"
            color="#9C27B0"
            onPress={() => router.push('/(tabs)/hub')}
          />
          <ActionCard
            title="Settings"
            icon="settings"
            color="#607D8B"
            onPress={() => router.push('/(tabs)/settings')}
          />
          <ActionCard
            title="Diagnostics"
            icon="analytics"
            color="#4CAF50"
            onPress={() => router.push('/onboarding')}
          />
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
  heroCard: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    minHeight: 160,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 16,
  },
  deviceScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceScoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: cardWidth,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});