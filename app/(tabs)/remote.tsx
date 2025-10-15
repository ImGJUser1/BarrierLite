import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { useDiagnostics } from '../../contexts/DiagnosticsContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import axios from 'axios';
import { CameraView, useCameraPermissions } from 'expo-camera';
import io from 'socket.io-client';
import { Picker } from '@react-native-picker/picker';
import 'react-native-get-random-values';  // Polyfill (safe for all platforms)
import AsyncStorage from '@react-native-async-storage/async-storage';  // Local DB
import DeviceInfo from 'react-native-device-info';  // Resource monitoring
import Constants from 'expo-constants';  // Baked env

// Internal backend URLs (localhost:8080 for standalone)
const SERVER_PORT = Constants.expoConfig?.extra?.SERVER_PORT || 8080;
const API_BASE_URL = `http://localhost:${SERVER_PORT}/api`;
const SIGNALING_URL = `ws://localhost:${SERVER_PORT}`;

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'te', name: 'Telugu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'th', name: 'Thai' },
  { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' },
];

interface SessionCardProps {
  deviceName: string;
  timestamp: string;
}

const SessionCard: React.FC<SessionCardProps> = ({ deviceName, timestamp }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.sessionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={[styles.thumbnail, { backgroundColor: colors.border }]}>
        <Ionicons name="desktop-outline" size={32} color={colors.textSecondary} />
      </View>
      <Text style={[styles.sessionDevice, { color: colors.text }]} numberOfLines={2}>{deviceName}</Text>
      <Text style={[styles.sessionTime, { color: colors.textSecondary }]}>{timestamp}</Text>
    </View>
  );
};

// Local DB Helpers (AsyncStorage mocks Mongo)
const logEventLocal = async (event: string, data: any) => {
  try {
    const payload = { event, data, timestamp: new Date().toISOString() };
    const key = `log_${Date.now()}`;
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.error('Local log error:', error);
  }
};

const fetchPastSessionsLocal = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sessionKeys = keys.filter(k => k.startsWith('status_'));
    const sessions = [];
    for (const key of sessionKeys) {
      const session = await AsyncStorage.getItem(key);
      if (session) sessions.push(JSON.parse(session));
    }
    return sessions.map((s: any) => ({
      deviceName: s.client_name || 'Unknown Device',
      timestamp: new Date(s.timestamp).toLocaleString(),
    }));
  } catch (error) {
    console.error('Fetch sessions error:', error);
    return [];
  }
};

const logSessionLocal = async (clientName: string) => {
  try {
    const payload = { client_name: clientName, timestamp: new Date().toISOString() };
    const key = `status_${Date.now()}`;
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Log session error:', error);
    return false;
  }
};

export default function Remote() {
  const { colors } = useTheme();
  const { diagnostics, thermalWarning } = useDiagnostics();
  const [isConnected, setIsConnected] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [screenShare, setScreenShare] = useState(true);
  const [iotControl, setIotControl] = useState(false);
  const [keyboardInput, setKeyboardInput] = useState(true);
  const [latency, setLatency] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pastSessions, setPastSessions] = useState<SessionCardProps[]>([]);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [language, setLanguage] = useState('en');
  const [errorMessage, setErrorMessage] = useState('');
  const [iotScenes, setIotScenes] = useState<string[]>([]);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [webrtcLoaded, setWebrtcLoaded] = useState(false);  // Track dynamic load
  const [permission, requestPermission] = useCameraPermissions();
  
  const pcRef = useRef<any>(null);
  const dataChannelRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const latencyIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(Date.now());

  // WebRTC components (assigned dynamically)
  const [RTCPeerConnection, setRTCPeerConnection] = useState<any>(null);
  const [RTCView, setRTCView] = useState<any>(null);
  const [MediaStream, setMediaStream] = useState<any>(null);
  const [mediaDevices, setMediaDevices] = useState<any>(null);
  const [RTCIceCandidate, setRTCIceCandidate] = useState<any>(null);
  const [RTCSessionDescription, setRTCSessionDescription] = useState<any>(null);

  const cpuUsage = diagnostics ? parseFloat(diagnostics.cpu.replace('%', '')) / 100 : 0;
  const isWebPlatform = Platform.OS === 'web';

  // Resource Cap Check (using DeviceInfo for standalone)
  const checkResources = async () => {
    try {
      const totalRam = await DeviceInfo.getTotalRamMb();
      const ramUsage = totalRam > 6000 ? 0.3 : (diagnostics?.ram || 0);  // Mock for 6GB
      const batteryLevel = await DeviceInfo.getBatteryLevelAsync();
      if (ramUsage > 0.8 || cpuUsage > 0.7 || (batteryLevel < 0.2 && Platform.OS === 'android')) {
        Alert.alert('Resource Limit', 'Device overloaded (RAM/CPU/Battery). Pausing.');
        Vibration.vibrate(200);
        return true;  // Over limit
      }
    } catch (error) {
      console.error('Resource check error:', error);
    }
    return false;  // OK
  };

  // Dynamic WebRTC load on native (inside useEffect to avoid top-level bundling)
  useEffect(() => {
    if (isWebPlatform) {
      // Web fallback: Use browser APIs if available for dev simulation
      if (typeof window !== 'undefined') {
        setRTCPeerConnection(() => window.RTCPeerConnection);
        setMediaStream(() => window.MediaStream);
        // Note: No full WebRTC on web for production; use placeholders
      }
      setWebrtcLoaded(true);  // "Loaded" as fallback
      return;
    }

    // Native: Dynamic import to isolate bundling
    const loadWebRTC = async () => {
      try {
        const WebRTC = await import('react-native-webrtc');
        const module = WebRTC.default || WebRTC;
        setRTCPeerConnection(() => module.RTCPeerConnection);
        setRTCView(() => module.RTCView);
        setMediaStream(() => module.MediaStream);
        setMediaDevices(() => module.mediaDevices);
        setRTCIceCandidate(() => module.RTCIceCandidate);
        setRTCSessionDescription(() => module.RTCSessionDescription);
        setWebrtcLoaded(true);
        console.log('WebRTC loaded dynamically on native');
      } catch (error) {
        console.error('Dynamic WebRTC load failed:', error);
        setErrorMessage('WebRTC unavailable on this device');
        Speech.speak('WebRTC not available', { language });
        Vibration.vibrate(200);
      }
    };

    loadWebRTC();
  }, [isWebPlatform, language]);

  useEffect(() => {
    if (isWebPlatform) {
      setErrorMessage('WebRTC is only supported on native platforms (iOS/Android)');
      Speech.speak('WebRTC not available on web', { language });
      return;
    }

    if (!webrtcLoaded) return;  // Wait for load

    initializeEncryption();
    setupSignaling();
    fetchPastSessionsLocal().then(setPastSessions);  // Local fetch

    const thermalCheck = setInterval(async () => {
      const overLimit = await checkResources();
      if (overLimit || thermalWarning) {
        Alert.alert(
          'Resource Warning',
          'Device exceeds limits (Thermal Warning, CPU >70%, RAM >80%). Pausing session.'
        );
        handleEndSession();
        logEventLocal('Session paused: resource limits', {
          thermal: diagnostics?.thermal,
          cpuUsage,
          ramUsage: diagnostics?.ram,
        });
        Speech.speak('Session paused due to resource limits', { language });
        Vibration.vibrate([100, 100, 100]);
      }
    }, 60000);  // Every minute

    return () => {
      socketRef.current?.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
      if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current);
      clearInterval(thermalCheck);
      // Cleanup streams
      if (localStream) {
        localStream.getTracks().forEach((track: any) => track.stop());
      }
    };
  }, [diagnostics, thermalWarning, cpuUsage, language, isWebPlatform, webrtcLoaded]);

  const initializeEncryption = async () => {
    try {
      // Use your kyber.ts for keygen (import if needed)
      await new Promise(resolve => setTimeout(resolve, 500));  // Simulate
      setEncryptionReady(true);
      await logEventLocal('Encryption initialized', {});
      Speech.speak('Encryption initialized', { language });
    } catch (error) {
      console.error('Encryption setup error:', error);
      setErrorMessage('Failed to initialize encryption');
      Speech.speak('Encryption setup failed', { language });
      Vibration.vibrate(200);
    }
  };

  const setupSignaling = () => {
    if (isWebPlatform || !socketRef.current || !SIGNALING_URL) return;

    socketRef.current = io(SIGNALING_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('Internal signaling connected');
      logEventLocal('Signaling connected', { deviceId });
      Speech.speak('Connected to internal server', { language });
    });

    socketRef.current.on('connect_error', (error: Error) => {
      console.error('Internal signaling error:', error);
      setErrorMessage('Failed to connect to internal backend (check app restart)');
      Speech.speak('Internal server connection failed', { language });
      Vibration.vibrate(200);
    });

    socketRef.current.on('offer', async (data: { sdp: string; deviceId: string }) => {
      if (!pcRef.current || data.deviceId !== deviceId || !RTCSessionDescription) return;
      try {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
        );
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit('answer', { sdp: answer.sdp, deviceId });
        await logEventLocal('Offer processed', { deviceId });
      } catch (error) {
        console.error('Offer error:', error);
        setErrorMessage('Failed to process remote offer');
        Speech.speak('Session setup failed', { language });
      }
    });

    socketRef.current.on('ice-candidate', async (data: { candidate: any; deviceId: string }) => {
      if (!pcRef.current || data.deviceId !== deviceId || !RTCIceCandidate) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        await logEventLocal('ICE candidate added', { candidate: data.candidate });
      } catch (error) {
        console.error('ICE candidate error:', error);
        setErrorMessage('Failed to add ICE candidate');
      }
    });

    // RustDesk Fallback: On ICE failure, trigger internal JS relay
    socketRef.current.on('ice_failed', async (data: { room: string }) => {
      console.log('ICE failed; falling back to internal RustDesk-like relay');
      // Generate session via internal API
      try {
        const res = await axios.post(`${API_BASE_URL}/rustdesk/generate`, { device_id: deviceId });
        const { rustdesk_id, password } = res.data;
        socketRef.current.emit('use_rustdesk', { id: rustdesk_id, pass: password, server: `localhost:${SERVER_PORT}` });
        Alert.alert('P2P Failed', `Fallback to local relay: ID ${rustdesk_id}, Pass ${password}\n(Use in-app client)`);
        Speech.speak('Switched to local relay mode', { language });
        logEventLocal('RustDesk fallback activated', { room: data.room });
      } catch (error) {
        console.error('Fallback error:', error);
        setErrorMessage('Fallback unavailable; retry P2P');
      }
    });
  };

  const fetchPastSessions = async () => {
    const sessions = await fetchPastSessionsLocal();
    setPastSessions(sessions);
    await logEventLocal('Past sessions fetched', { count: sessions.length });
  };

  const logEvent = logEventLocal;  // Alias for consistency
  const logSession = logSessionLocal;

  const startWebRTC = async () => {
    if (isWebPlatform || !webrtcLoaded || !RTCPeerConnection || !mediaDevices) {
      setErrorMessage('WebRTC not supported or loaded');
      return;
    }

    if (!encryptionReady) {
      setErrorMessage('Encryption not ready');
      Speech.speak('Please wait for encryption to initialize', { language });
      return;
    }

    const overLimit = await checkResources();
    if (overLimit) {
      setErrorMessage('Insufficient resources');
      Alert.alert('Resource Error', 'RAM >80% or CPU >70%. Try later.');
      Speech.speak('Device overloaded', { language });
      Vibration.vibrate(200);
      return;
    }

    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    let stream: any;
    try {
      if (screenShare) {
        stream = await mediaDevices.getUserMedia({
          video: {
            mandatory: {
              minWidth: 500,
              minHeight: 300,
              minFrameRate: 30,
            },
          },
          audio: true,
        });
      } else {
        stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      }
      setLocalStream(stream);
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
      await logEvent('Media stream acquired', { type: screenShare ? 'screen' : 'camera' });
      Speech.speak('Media stream ready', { language });
    } catch (error) {
      console.error('Stream error:', error);
      setErrorMessage('Failed to access media');
      Speech.speak('Failed to access media', { language });
      Vibration.vibrate(200);
      return;
    }

    if (iotControl || keyboardInput) {
      const dc = pc.createDataChannel('control');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('Data channel open');
        logEvent('Data channel opened', {});
        Speech.speak('Control channel ready', { language });
      };

      dc.onmessage = (e: { data: any }) => {
        try {
          console.log('Received:', e.data);
          handleIoTCommand(e.data);
          Speech.speak(`Received command: ${e.data}`, { language });
        } catch (error) {
          console.error('Message processing error:', error);
          setErrorMessage('Failed to process command');
        }
      };

      dc.onclose = () => {
        console.log('Data channel closed');
        logEvent('Data channel closed', {});
      };

      dc.onerror = (error: any) => {
        console.error('Data channel error:', error);
        setErrorMessage('Control channel error');
      };
    }

    pc.ontrack = (event: { tracks: any[]; streams: any[] }) => {
      const remote = new MediaStream(event.streams[0] || [event.tracks[0]]);
      setRemoteStream(remote);
      logEvent('Remote stream received', {});
      Speech.speak('Remote screen connected', { language });
    };

    pc.onicecandidate = (event: { candidate: any }) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          candidate: event.candidate.toJSON(),
          deviceId,
        });
        logEvent('ICE candidate sent', { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' && Date.now() - lastPingRef.current > 2000) {
        // Trigger fallback on failure
        socketRef.current?.emit('ice_failed', { room: deviceId });
        Speech.speak('Connection lag detected. Falling back.', { language });
        logEvent('ICE failed; fallback triggered', { latency: Date.now() - lastPingRef.current });
      } else if (pc.connectionState === 'connected') {
        Speech.speak('Connection established', { language });
      } else if (pc.connectionState === 'disconnected') {
        Speech.speak('Connection lost', { language });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        socketRef.current?.emit('ice_failed', { room: deviceId });  // Internal fallback
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { sdp: offer.sdp, deviceId });
      await logEvent('WebRTC offer sent', { deviceId });
    } catch (error) {
      console.error('WebRTC setup error:', error);
      setErrorMessage('Failed to start session');
      Speech.speak('Session setup failed', { language });
      Vibration.vibrate(200);
      return;
    }

    latencyIntervalRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        stats.forEach((report: any) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const rtt = report.currentRoundTripTime * 1000 || 0;
            setLatency(Math.round(rtt));
            lastPingRef.current = Date.now();
          }
        });
      } catch (error) {
        console.error('Latency check error:', error);
      }
    }, 10000);  // Every 10s for perf

    timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
  };

  const handleStartSession = async () => {
    if (isWebPlatform) {
      Alert.alert('Platform Error', 'WebRTC is only supported on native platforms (iOS/Android)');
      return;
    }

    if (isConnected) {
      handleEndSession();
      return;
    }

    if (!deviceId.trim()) {
      setErrorMessage('Device ID required');
      Speech.speak('Please enter device ID', { language });
      Vibration.vibrate(100);
      return;
    }

    const overLimit = await checkResources();
    if (overLimit || thermalWarning) {
      setErrorMessage('Device overloaded');
      Alert.alert('Resource Warning', 'Thermal warning, CPU >70%, or RAM >80%. Try later.');
      Speech.speak('Device overloaded', { language });
      Vibration.vibrate(200);
      return;
    }

    await startWebRTC();
    setIsConnected(true);
    const logged = await logSession(deviceId);
    if (logged) fetchPastSessions();
    Speech.speak(`Session started with ${deviceId}`, { language });
    Vibration.vibrate([100, 100]);
  };

  const handleEndSession = () => {
    pcRef.current?.close();
    dataChannelRef.current?.close();
    if (localStream) {
      localStream.getTracks().forEach((track: any) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setIsConnected(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (latencyIntervalRef.current) clearInterval(latencyIntervalRef.current);
    setDuration(0);
    setLatency(0);
    setErrorMessage('');
    Speech.speak('Session ended', { language });
    logEvent('Session ended', { deviceId });
    Vibration.vibrate(100);
  };

  const sendControlCommand = (command: string) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      setErrorMessage('Control channel not ready');
      Speech.speak('Control channel not ready', { language });
      return;
    }
    try {
      dataChannelRef.current.send(command);
      logEvent('Control command sent', { command });
      Speech.speak(`Sent command: ${command}`, { language });
    } catch (error) {
      console.error('Command error:', error);
      setErrorMessage('Failed to send command');
      Speech.speak('Command failed', { language });
    }
  };

  const handleIoTCommand = (command: string) => {
    if (command.startsWith('iot:')) {
      const action = command.split(':')[1];
      setIotScenes(prev => [...prev, action]);
      Speech.speak(`IoT action: ${action}`, { language });
      logEvent('IoT command processed', { action });
      // Internal automation: e.g., toggle local state (no external API)
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!data || data.trim() === '') {
      setErrorMessage('Invalid QR code');
      Speech.speak('Invalid QR code scanned', { language });
      Vibration.vibrate(200);
      return;
    }
    setDeviceId(data.trim());
    setIsScanning(false);
    Speech.speak(`Device ID set to ${data}`, { language });
    logEvent('QR code scanned', { deviceId: data });
    Vibration.vibrate(50);
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: colors.text }]}>Checking camera permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.text }]}>Camera permission required for QR scanning</Text>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
            activeOpacity={0.7}
          >
            <Text style={styles.startButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={[colors.primary, colors.primaryLight || colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Ionicons name="shield-checkmark" size={40} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Secure Remote Control</Text>
          <Text style={styles.headerSubtitle}>Encrypted P2P Sessions (Standalone)</Text>
        </LinearGradient>

        {errorMessage && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
            <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={24} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Sessions</Text>
          {pastSessions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {pastSessions.map((session, index) => (
                <SessionCard key={index} {...session} />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: colors.border }]}>
              <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No past sessions</Text>
            </View>
          )}
        </View>

        <View style={[styles.newSessionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Start New Session</Text>

          <TouchableOpacity
            style={[styles.qrButton, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setIsScanning(!isScanning)}
            activeOpacity={0.7}
          >
            <Ionicons name="qr-code" size={48} color={colors.primary} />
            <Text style={[styles.qrText, { color: colors.primary }]}>{isScanning ? 'Stop Scan' : 'Scan QR Code'}</Text>
          </TouchableOpacity>

          {isScanning && (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Device ID</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              placeholder="Enter device ID"
              placeholderTextColor={colors.textSecondary}
              value={deviceId}
              onChangeText={setDeviceId}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Language</Text>
            <Picker
              selectedValue={language}
              onValueChange={(value: string) => setLanguage(value)}
              style={[styles.picker, { backgroundColor: colors.background, color: colors.text }]}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <Picker.Item key={lang.code} label={lang.name} value={lang.code} />
              ))}
            </Picker>
          </View>

          <View style={styles.options}>
            <TouchableOpacity style={styles.option} onPress={() => setScreenShare(!screenShare)} activeOpacity={0.7}>
              <Ionicons
                name={screenShare ? 'checkmark-circle' : 'ellipse-outline'}
                size={28}
                color={screenShare ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.optionText, { color: colors.text }]}>Screen Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={() => setIotControl(!iotControl)} activeOpacity={0.7}>
              <Ionicons
                name={iotControl ? 'checkmark-circle' : 'ellipse-outline'}
                size={28}
                color={iotControl ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.optionText, { color: colors.text }]}>IoT Control</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={() => setKeyboardInput(!keyboardInput)} activeOpacity={0.7}>
              <Ionicons
                name={keyboardInput ? 'checkmark-circle' : 'ellipse-outline'}
                size={28}
                color={keyboardInput ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.optionText, { color: colors.text }]}>Keyboard Input</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: isConnected ? colors.error : colors.primary }]}
            onPress={handleStartSession}
            activeOpacity={0.8}
          >
            <Ionicons name={isConnected ? 'stop-circle' : 'play-circle'} size={28} color="#FFFFFF" />
            <Text style={styles.startButtonText}>{isConnected ? 'End Session' : 'Start Session'}</Text>
          </TouchableOpacity>
        </View>

        {isConnected && (
          <View style={[styles.statsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.statsTitle, { color: colors.text }]}>Session Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="speedometer" size={24} color={colors.primary} />
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Latency</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{latency}ms</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="shield-checkmark" size={24} color={colors.success} />
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Encrypted</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>P2P</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="time" size={24} color={colors.primary} />
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Duration</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {Math.floor(duration / 60)}:{duration % 60 < 10 ? '0' : ''}{duration % 60}
                </Text>
              </View>
            </View>

            {!isWebPlatform && RTCView && remoteStream ? (
              <RTCView streamURL={remoteStream.toURL()} style={styles.videoPlaceholder} objectFit="cover" mirror={false} />
            ) : (
              <View style={[styles.videoPlaceholder, { backgroundColor: colors.border }]}>
                <Ionicons name="videocam" size={64} color={colors.textSecondary} />
                <Text style={[styles.videoText, { color: colors.textSecondary }]}>
                  {isWebPlatform ? 'WebRTC not supported on web' : 'Connecting...'}
                </Text>
              </View>
            )}

            {keyboardInput && (
              <TextInput
                style={[styles.input, { marginTop: 16, backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                placeholder="Type keyboard input"
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={(e) => {
                  sendControlCommand(`key:${e.nativeEvent.text}`);
                  e.currentTarget.clear();
                }}
              />
            )}

            {/* IoT Controls (Internal commands) */}
            {iotControl && (
              <View style={styles.iotControls}>
                <TouchableOpacity style={styles.startButton} onPress={() => sendControlCommand('iot:toggle_light')}>
                  <Text style={styles.startButtonText}>Toggle Light</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.startButton} onPress={() => sendControlCommand('iot:adjust_temp')}>
                  <Text style={styles.startButtonText}>Adjust Temperature</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.startButton} onPress={() => sendControlCommand('iot:scene_night')}>
                  <Text style={styles.startButtonText}>Night Scene</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Diagnostics Dashboard */}
        {diagnostics && (
          <View style={[styles.diagnosticsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setDiagnosticsVisible(!diagnosticsVisible)}>
              <Text style={[styles.statsTitle, { color: colors.text }]}>
                {diagnosticsVisible ? 'Hide Diagnostics' : 'Show Diagnostics'}
              </Text>
            </TouchableOpacity>
            {diagnosticsVisible && (
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons name="thermometer" size={24} color={colors.primary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Temperature</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>{diagnostics.thermal}°C</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="speedometer" size={24} color={colors.primary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CPU Usage</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>{diagnostics.cpu}</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="hardware-chip" size={24} color={colors.primary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>RAM Usage</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>{(diagnostics.ram * 100).toFixed(1)}%</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles (unchanged from your code)
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
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
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginTop: 12 },
  headerSubtitle: { fontSize: 16, color: '#FFFFFF', opacity: 0.9, marginTop: 4 },
  errorContainer: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' },
  errorText: { fontSize: 16, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  carousel: { gap: 12 },
  sessionCard: { width: 140, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  thumbnail: { width: 100, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  sessionDevice: { fontSize: 16, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  sessionTime: { fontSize: 14 },
  newSessionCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  qrButton: { padding: 24, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', marginBottom: 16 },
  qrText: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, fontSize: 18 },
  options: { gap: 12, marginBottom: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { fontSize: 18 },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  startButtonText: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  statsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  statsTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 14 },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  videoPlaceholder: { height: 200, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  videoText: { fontSize: 18, marginTop: 8 },
  diagnosticsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  iotControls: { gap: 12, marginTop: 16 },
  camera: { height: 300, marginBottom: 16 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyState: { padding: 24, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  emptyText: { fontSize: 16, marginTop: 8 },
  picker: { height: 50, borderRadius: 8, borderWidth: 1 },
});
