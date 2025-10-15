import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import Slider from '@react-native-community/slider';
import DocumentPicker from 'react-native-document-picker';
import WebView from 'react-native-webview';
import { Picker } from '@react-native-picker/picker';

const API_BASE_URL = 'http://localhost:8000/api';

interface OSEnvironment {
  id: string;
  name: string;
  icon: string;
  ramRequired: number;
  status: 'available' | 'running' | 'stopped';
}

interface PWA {
  name: string;
  url: string;
}

interface Apk {
  id: string;
  filename: string;
}

interface Emulator {
  id: string;
  platform: 'android' | 'ios';
  version: string;
  status: 'available' | 'downloading' | 'installed' | 'running' | 'error';
  ramRequired: number;
  downloadSize: number;
}

interface OSCardProps {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  ramRequired: number;
  status: 'available' | 'running' | 'stopped';
  onRun: () => void;
}

interface EmulatorSelectorProps {
  platform: 'android' | 'ios';
  onSelectVersion: (version: string) => void;
  availableVersions: string[];
  selectedVersion: string;
}

interface EmulatorCardProps extends Emulator {
  onRun: () => void;
  onDownload: () => void;
}

const OSCard: React.FC<OSCardProps> = ({ name, icon, ramRequired, status, onRun }) => {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.osCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={[styles.osPreview, { backgroundColor: colors.border }]}>
        <Ionicons name={icon} size={48} color={colors.primary} />
      </View>
      <Text style={[styles.osName, { color: colors.text }]} numberOfLines={2}>{name}</Text>
      <Text style={[styles.osRam, { color: colors.textSecondary }]}>{ramRequired} MB RAM</Text>
      <View style={styles.statusBadge}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: status === 'running' ? colors.success : status === 'stopped' ? colors.error : colors.primary },
          ]}
        />
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Ready'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.runButton, { backgroundColor: status === 'running' ? colors.error : colors.primary }]}
        onPress={onRun}
        activeOpacity={0.7}
      >
        <Text style={styles.runButtonText}>{status === 'running' ? 'Stop' : 'Run'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const EmulatorSelector: React.FC<EmulatorSelectorProps> = ({ platform, onSelectVersion, availableVersions, selectedVersion }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.selectorContainer}>
      <Text style={[styles.selectorLabel, { color: colors.text }]}>{platform.toUpperCase()} Versions</Text>
      <Picker
        selectedValue={selectedVersion}
        onValueChange={onSelectVersion}
        style={[styles.picker, { backgroundColor: colors.cardBackground, color: colors.text }]}
      >
        <Picker.Item label="Select Version" value="" />
        {availableVersions.map(v => (
          <Picker.Item key={v} label={v} value={v} />
        ))}
      </Picker>
    </View>
  );
};

const EmulatorCard: React.FC<EmulatorCardProps> = ({ platform, version, status, ramRequired, downloadSize, onRun, onDownload }) => {
  const { colors } = useTheme();
  const icon = platform === 'android' ? 'logo-android' : 'logo-apple';
  
  return (
    <View style={[styles.emulatorCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Ionicons name={icon} size={48} color={colors.primary} />
      <Text style={[styles.emulatorVersion, { color: colors.text }]}>{version}</Text>
      <Text style={[styles.emulatorRam, { color: colors.textSecondary }]}>{ramRequired} MB RAM</Text>
      <Text style={[styles.emulatorSize, { color: colors.textSecondary }]}>{downloadSize} MB</Text>
      <View style={styles.statusBadge}>
        <View
          style={[
            styles.statusDot,
            { 
              backgroundColor: status === 'running' ? colors.success : 
                              status === 'downloading' ? '#FFA500' :
                              status === 'installed' ? colors.primary :
                              status === 'error' ? colors.error : colors.textSecondary
            },
          ]}
        />
        <Text style={[styles.emulatorStatus, { color: colors.textSecondary }]}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      </View>
      {status === 'available' && (
        <TouchableOpacity style={[styles.downloadButton, { backgroundColor: colors.primary }]} onPress={onDownload} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Download</Text>
        </TouchableOpacity>
      )}
      {status === 'downloading' && (
        <View style={[styles.downloadingIndicator, { backgroundColor: colors.border }]}>
          <Text style={[styles.downloadingText, { color: colors.text }]}>Downloading...</Text>
        </View>
      )}
      {(status === 'installed' || status === 'running') && (
        <TouchableOpacity
          style={[styles.runButton, { backgroundColor: status === 'running' ? colors.error : colors.success }]}
          onPress={onRun}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>{status === 'running' ? 'Stop' : 'Run'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function VirtualizationHub() {
  const { colors } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [showPwaWebView, setShowPwaWebView] = useState<string | null>(null);
  const [showEmulatorModal, setShowEmulatorModal] = useState(false);
  const [ramAllocation, setRamAllocation] = useState(512);
  const [osName, setOsName] = useState('');
  const [osEnvironments, setOsEnvironments] = useState<OSEnvironment[]>([]);
  const [apks, setApks] = useState<Apk[]>([]);
  const [pwas, setPwas] = useState<PWA[]>([]);
  const [emulators, setEmulators] = useState<Emulator[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<'android' | 'ios' | null>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [hostRam, setHostRam] = useState(6144);

  useEffect(() => {
    fetchOsEnvironments();
    fetchApks();
    fetchPwas();
    fetchEmulators();
  }, []);

  const fetchOsEnvironments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/os_environments`);
      if (!response.ok) throw new Error('Failed to fetch OS environments');
      const data = await response.json();
      setOsEnvironments(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch OS environments');
      Speech.speak('Failed to fetch OS environments', { language: 'en' });
    }
  };

  const fetchApks = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/apks`);
      if (!response.ok) throw new Error('Failed to fetch APKs');
      const data = await response.json();
      setApks(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch APKs');
      Speech.speak('Failed to fetch APKs', { language: 'en' });
    }
  };

  const fetchPwas = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/pwas`);
      if (!response.ok) throw new Error('Failed to fetch PWAs');
      const data = await response.json();
      setPwas(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch PWAs');
      Speech.speak('Failed to fetch PWAs', { language: 'en' });
    }
  };

  const fetchEmulators = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/emulators`);
      if (!response.ok) throw new Error('Failed to fetch emulators');
      const data: Emulator[] = await response.json();
      const compatible = data.filter(e => e.ramRequired <= 4096 && hostRam >= e.ramRequired);
      setEmulators(compatible);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch emulators');
      Speech.speak('Failed to fetch emulators', { language: 'en' });
    }
  };

  const handleRunOS = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/os_environments/${id}/toggle`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to toggle OS');
      }
      Speech.speak('OS toggled successfully', { language: 'en' });
      fetchOsEnvironments();
    } catch (error: any) {
      Alert.alert('Error', error.message);
      Speech.speak(error.message, { language: 'en' });
    }
  };

  const handleAddOS = async () => {
    if (!osName || ramAllocation < 500) {
      Speech.speak('Please provide a valid OS name and RAM allocation', { language: 'en' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/os_environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: osName, ramRequired: ramAllocation }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add OS');
      }
      Speech.speak(`Added ${osName}`, { language: 'en' });
      setShowAddModal(false);
      setOsName('');
      setRamAllocation(512);
      fetchOsEnvironments();
    } catch (error: any) {
      Alert.alert('Error', error.message);
      Speech.speak(error.message, { language: 'en' });
    }
  };

  const handleSelectApk = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      const file = res[0];
      if (!file.name.endsWith('.apk')) {
        Alert.alert('Invalid File', 'Please select an APK file');
        return;
      }
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      } as any);
      const response = await fetch(`${API_BASE_URL}/upload-apk`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload APK');
      }
      Speech.speak(`APK ${file.name} added`, { language: 'en' });
      fetchApks();
    } catch (error: any) {
      if (DocumentPicker.isCancel(error)) return;
      Alert.alert('Error', error.message);
      Speech.speak(error.message, { language: 'en' });
    }
  };

  const handleSelectPwa = (url: string) => {
    setShowPwaModal(false);
    setShowPwaWebView(url);
    Speech.speak('Loading PWA', { language: 'en' });
  };

  const handleDownloadEmulator = async (platform: 'android' | 'ios', version: string) => {
    if (hostRam < 6000) {
      Alert.alert('RAM Warning', '6GB RAM detected; emulator may run slowly. Proceed?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', onPress: () => proceedDownload(platform, version) }
      ]);
      return;
    }
    proceedDownload(platform, version);
  };

  const proceedDownload = async (platform: 'android' | 'ios', version: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/emulators/${platform}/${version}/download`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Download failed');
      }
      setEmulators(prev => prev.map(e => e.version === version ? { ...e, status: 'downloading' } : e));
      Speech.speak(`Downloading ${version}`, { language: 'en' });
      setTimeout(fetchEmulators, 5000);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      Speech.speak(error.message, { language: 'en' });
    }
  };

  const handleRunEmulator = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/emulators/${id}/run`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to run emulator');
      Speech.speak('Emulator started', { language: 'en' });
      fetchEmulators();
    } catch (error: any) {
      Alert.alert('Error', error.message);
      Speech.speak(error.message, { language: 'en' });
    }
  };

  const getAvailableVersions = (platform: 'android' | 'ios') => {
    return emulators
      .filter(e => e.platform === platform)
      .map(e => e.version);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#9C27B0', '#BA68C8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Ionicons name="cube" size={32} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Light OS Environments</Text>
          <Text style={styles.headerSubtitle}>Run Linux, Android, iOS, PWAs & APKs</Text>
        </LinearGradient>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
          <Ionicons name="information-circle" size={24} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            Sequential execution only. One OS can run at a time to conserve resources. Host RAM: {hostRam} MB
          </Text>
        </View>

        {/* Mobile Emulators Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Mobile Emulators</Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowEmulatorModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="phone-portrait" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emulatorPortfolio}>
            {emulators.map(emulator => (
              <EmulatorCard
                key={emulator.id}
                {...emulator}
                onRun={() => handleRunEmulator(emulator.id)}
                onDownload={() => handleDownloadEmulator(emulator.platform, emulator.version)}
              />
            ))}
          </ScrollView>
        </View>

        {/* OS Portfolio */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>OS Environments</Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.osPortfolio}>
            {osEnvironments.map(os => (
              <OSCard key={os.id} {...os} onRun={() => handleRunOS(os.id)} />
            ))}
          </ScrollView>
        </View>

        {/* APK Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Hybrid APK Container ({apks.length}/2)</Text>
          <TouchableOpacity
            style={[styles.apkDropZone, { backgroundColor: colors.border, borderColor: colors.primary }]}
            onPress={handleSelectApk}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload" size={48} color={colors.primary} />
            <Text style={[styles.apkText, { color: colors.text }]}>Select APK</Text>
            <Text style={[styles.apkSubtext, { color: colors.textSecondary }]}>Max 2 APKs supported (Android 16 compatible)</Text>
          </TouchableOpacity>
          {apks.map((apk) => (
            <Text key={apk.id} style={[styles.apkListItem, { color: colors.text }]}>{apk.filename}</Text>
          ))}
        </View>

        {/* PWA Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Progressive Web Apps</Text>
          <View style={[styles.pwaCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="globe" size={32} color={colors.primary} />
            <Text style={[styles.pwaTitle, { color: colors.text }]}>Add PWA</Text>
            <Text style={[styles.pwaDescription, { color: colors.textSecondary }]}>
              Run cross-platform apps in iOS 26 or Android 16 environments
            </Text>
            <TouchableOpacity
              style={[styles.pwaButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowPwaModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pwaButtonText}>Browse Catalog</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Add OS Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create New Scene</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder="OS name"
              placeholderTextColor={colors.textSecondary}
              value={osName}
              onChangeText={setOsName}
            />
            <Text style={[styles.sliderLabel, { color: colors.text }]}>RAM Allocation: {ramAllocation} MB</Text>
            <Slider
              style={styles.slider}
              minimumValue={500}
              maximumValue={2048}
              step={128}
              value={ramAllocation}
              onValueChange={setRamAllocation}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowAddModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleAddOS}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Emulator Setup Modal */}
      <Modal
        visible={showEmulatorModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEmulatorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Setup Mobile Emulator</Text>
            
            <View style={styles.platformSelector}>
              <TouchableOpacity
                style={[
                  styles.platformButton,
                  { backgroundColor: selectedPlatform === 'android' ? colors.primary : colors.border }
                ]}
                onPress={() => setSelectedPlatform('android')}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-android" size={24} color={selectedPlatform === 'android' ? '#FFFFFF' : colors.text} />
                <Text style={[styles.platformText, { color: selectedPlatform === 'android' ? '#FFFFFF' : colors.text }]}>
                  Android
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.platformButton,
                  { backgroundColor: selectedPlatform === 'ios' ? colors.primary : colors.border }
                ]}
                onPress={() => setSelectedPlatform('ios')}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-apple" size={24} color={selectedPlatform === 'ios' ? '#FFFFFF' : colors.text} />
                <Text style={[styles.platformText, { color: selectedPlatform === 'ios' ? '#FFFFFF' : colors.text }]}>
                  iOS
                </Text>
              </TouchableOpacity>
            </View>

            {selectedPlatform && (
              <EmulatorSelector
                platform={selectedPlatform}
                onSelectVersion={setSelectedVersion}
                availableVersions={getAvailableVersions(selectedPlatform)}
                selectedVersion={selectedVersion}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => {
                  setShowEmulatorModal(false);
                  setSelectedPlatform(null);
                  setSelectedVersion('');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: selectedPlatform && selectedVersion ? colors.primary : colors.border }
                ]}
                onPress={() => {
                  if (selectedPlatform && selectedVersion) {
                    handleDownloadEmulator(selectedPlatform, selectedVersion);
                    setShowEmulatorModal(false);
                    setSelectedPlatform(null);
                    setSelectedVersion('');
                  }
                }}
                activeOpacity={0.7}
                disabled={!selectedPlatform || !selectedVersion}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Download</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PWA Catalog Modal */}
      <Modal
        visible={showPwaModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPwaModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>PWA Catalog</Text>
            {pwas.map((pwa, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.pwaListItem, { borderColor: colors.border }]}
                onPress={() => handleSelectPwa(pwa.url)}
              >
                <Text style={[styles.pwaListText, { color: colors.text }]}>{pwa.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.border }]}
              onPress={() => setShowPwaModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PWA WebView Modal */}
      <Modal
        visible={!!showPwaWebView}
        animationType="fade"
        onRequestClose={() => setShowPwaWebView(null)}
      >
        <View style={styles.webViewContainer}>
          {showPwaWebView && <WebView source={{ uri: showPwaWebView }} style={styles.webView} />}
          <TouchableOpacity
            style={[styles.closeWebViewButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowPwaWebView(null)}
          >
            <Text style={styles.closeWebViewText}>Close PWA</Text>
          </TouchableOpacity>
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
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  osPortfolio: {
    gap: 12,
  },
  osCard: {
    width: 180,
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
  osPreview: {
    width: 120,
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  osName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  osRam: {
    fontSize: 12,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
  },
  runButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  runButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  apkDropZone: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  apkText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  apkSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  apkListItem: {
    fontSize: 14,
    marginTop: 8,
  },
  pwaCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pwaTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  pwaDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  pwaButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  pwaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pwaListItem: {
    padding: 12,
    borderBottomWidth: 1,
    width: '100%',
  },
  pwaListText: {
    fontSize: 16,
  },
  sliderLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 16,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  closeWebViewButton: {
    padding: 16,
    alignItems: 'center',
  },
  closeWebViewText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emulatorPortfolio: {
    gap: 12,
  },
  emulatorCard: {
    width: 180,
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
  emulatorVersion: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  emulatorRam: {
    fontSize: 12,
    marginTop: 4,
  },
  emulatorSize: {
    fontSize: 12,
    marginTop: 2,
  },
  emulatorStatus: {
    fontSize: 12,
  },
  downloadButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  downloadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  platformSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  platformButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  platformText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectorContainer: {
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  picker: {
    borderRadius: 8,
    paddingHorizontal: 12,
  },
});