import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

interface Device {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  type: string;
  status: boolean;
  value?: string;
}

interface Scene {
  title: string;
  description: string;
}

interface DeviceCardProps {
  device: Device;
  onToggle: (id: string) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, onToggle }) => {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.deviceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={[styles.deviceIcon, { backgroundColor: device.status ? colors.primary + '20' : colors.border }]}>
        <Ionicons name={device.icon} size={32} color={device.status ? colors.primary : colors.textSecondary} />
      </View>
      <Text style={[styles.deviceName, { color: colors.text }]}>{device.name}</Text>
      <Text style={[styles.deviceType, { color: colors.textSecondary }]}>{device.type}</Text>
      {device.value && (
        <Text style={[styles.deviceValue, { color: colors.primary }]}>{device.value}</Text>
      )}
      <Switch
        value={device.status}
        onValueChange={() => onToggle(device.id)}
        trackColor={{ false: colors.border, true: colors.primary + '50' }}
        thumbColor={device.status ? colors.primary : colors.textSecondary}
      />
    </View>
  );
};

interface SceneCardProps {
  title: string;
  description: string;
  onActivate: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ title, description, onActivate }) => {
  const { colors } = useTheme();
  
  return (
    <TouchableOpacity
      style={[styles.sceneCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
      onPress={onActivate}
      activeOpacity={0.7}
    >
      <Ionicons name="play-circle" size={40} color={colors.primary} />
      <View style={styles.sceneContent}>
        <Text style={[styles.sceneTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sceneDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
};

export default function IoT() {
  const { colors } = useTheme();
  const [devices, setDevices] = useState<Device[]>([
    { id: '1', name: 'Living Light', icon: 'bulb', type: 'Smart Light', status: true },
    { id: '2', name: 'Front Door', icon: 'lock-closed', type: 'Smart Lock', status: false, value: 'Locked' },
    { id: '3', name: 'Bedroom AC', icon: 'snow', type: 'Thermostat', status: true, value: '22°C' },
    { id: '4', name: 'Kitchen Fan', icon: 'refresh-circle', type: 'Smart Fan', status: false },
    { id: '5', name: 'Door Sensor', icon: 'alert-circle', type: 'Sensor', status: true, value: 'Closed' },
    { id: '6', name: 'Camera', icon: 'videocam', type: 'Security', status: true },
  ]);
  const [scenes, setScenes] = useState<Scene[]>([
    { title: 'Lights Off at 10 PM', description: 'Turn off all lights at 10 PM daily' },
    { title: 'Good Morning', description: 'Open blinds, turn on lights at 7 AM' },
    { title: 'Away Mode', description: 'Lock doors, turn off lights when leaving' },
  ]);
  const [showModal, setShowModal] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneDescription, setNewSceneDescription] = useState('');

  const handleToggle = (id: string) => {
    setDevices(prev =>
      prev.map(device => {
        if (device.id === id) {
          const newStatus = !device.status;
          Speech.speak(`${device.name} turned ${newStatus ? 'on' : 'off'}`, { language: 'en' });
          return { ...device, status: newStatus };
        }
        return device;
      })
    );
  };

  const handleActivateScene = (title: string) => {
    Speech.speak(`Activating scene: ${title}`, { language: 'en' });
    // For a "real" implementation, add logic here to trigger actual device changes based on the scene.
  };

  const handleCreateScene = () => {
    if (newSceneName && newSceneDescription) {
      const newScene = { title: newSceneName, description: newSceneDescription };
      setScenes(prev => [...prev, newScene]);
      Speech.speak(`Scene created: ${newSceneName}`, { language: 'en' });
      setShowModal(false);
      setNewSceneName('');
      setNewSceneDescription('');
    } else {
      Speech.speak('Please provide a name and description', { language: 'en' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#FFC107', '#FF9800']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Ionicons name="bulb" size={32} color="#FFFFFF" />
          <Text style={styles.headerTitle}>IoT Control</Text>
          <Text style={styles.headerSubtitle}>{devices.filter(d => d.status).length} devices active</Text>
        </LinearGradient>

        {/* Scenes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Scenes</Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scenesCarousel}>
            {scenes.map((scene, index) => (
              <SceneCard
                key={index}
                title={scene.title}
                description={scene.description}
                onActivate={() => handleActivateScene(scene.title)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Devices Grid */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Devices</Text>
          <View style={styles.devicesGrid}>
            {devices.map(device => (
              <DeviceCard key={device.id} device={device} onToggle={handleToggle} />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Create Scene Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create New Scene</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder="Scene name"
              placeholderTextColor={colors.textSecondary}
              value={newSceneName}
              onChangeText={setNewSceneName}
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder="Description"
              placeholderTextColor={colors.textSecondary}
              value={newSceneDescription}
              onChangeText={setNewSceneDescription}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateScene}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenesCarousel: {
    gap: 12,
  },
  sceneCard: {
    width: 280,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sceneContent: {
    flex: 1,
  },
  sceneTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sceneDescription: {
    fontSize: 12,
  },
  devicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  deviceCard: {
    width: '48%',
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
  deviceIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  deviceType: {
    fontSize: 12,
    marginBottom: 8,
  },
  deviceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});