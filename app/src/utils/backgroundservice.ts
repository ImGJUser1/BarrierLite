import BackgroundActions from 'react-native-background-actions';
import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';

// Start background server (call in App.tsx or index.tsx on launch)
export const startBackend = async () => {
  const tasks = [
    {
      taskName: 'BarrierOSBackend',
      taskTitle: 'Running Local Server',
      taskDesc: 'WebRTC & Automation Service',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
      color: '#ff00ff',
      parameters: { delay: 1000 },
    },
  ];

  const backendOptions = {
    taskName: 'BarrierOSBackend',
    taskTitle: 'BarrierOS Lite Backend',
    taskDesc: 'Local API for Remote & IoT',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#ff00ff',
    linkingURI: 'barrieros://',  // For deep links
    parameters: {
      delay: 1000,
    },
    actions: [
      {
        name: 'stop',
        title: 'Stop Backend',
        color: '#ff00ff',
        smallIcon: 'ic_stop',
        largeIcon: 'ic_stop',
      },
    ],
  };

  const startServer = () => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });

    // Resource Monitor (mocks psutil)
    const checkResources = () => {
      DeviceInfo.getTotalRamMb().then(totalRam => {
        if (totalRam < 4096) {  // Enforce cap
          // Pause heavy tasks (e.g., emit to frontend)
        }
      });
      // CPU: DeviceInfo.getBatteryLevel() as proxy or periodic
    };
    setInterval(checkResources, 30000);

    // WebRTC Socket.IO (from original)
    io.on('connection', (socket) => {
      // Auth, offer/answer/ice_candidate, ice_failed -> rustdesk fallback
      socket.on('authenticate', (data) => { /* ... */ });
      socket.on('ice_failed', async () => {
        // JS fallback: Generate simple-webrtc room
        const roomId = Math.random().toString(36).substr(2, 9);
        io.to(socket.id).emit('use_rustdesk', { id: roomId, pass: '123456' });
      });
    });

    // Express Endpoints (rewrite of server.py)
    app.use(express.json());
    app.get('/api/root', (req, res) => res.json({ message: 'Standalone Backend' }));

    // Example: /api/rustdesk/generate (JS mock)
    app.post('/api/rustdesk/generate', (req, res) => {
      const { device_id } = req.body;
      const rustdesk_id = Math.random().toString(36).substr(2, 8);
      const password = '123456';  // Simple for standalone
      // Store in AsyncStorage
      res.json({ rustdesk_id, password, server: 'localhost:8080' });
    });

    // Automate (keyword + mock AI)
    app.post('/api/automate', (req, res) => {
      const { text } = req.body;
      let response = { response: '', taskExecuted: false, taskType: null };
      if (text.toLowerCase().includes('alarm')) {
        response.response = 'Alarm set locally.';
        response.taskExecuted = true;
        response.taskType = 'alarm';
      } else {
        response.response = 'Fallback: Use "set alarm" or "toggle light".';  // No heavy AI
      }
      res.json(response);
    });

    // Other endpoints: /os_environments, /emulators, etc. (use AsyncStorage for state)
    // Upload APK: Use RNFS to save to app storage
    app.post('/api/upload-apk', async (req, res) => {
      // Mock: Save to RNFS.DocumentDirectoryPath + '/uploads'
      res.json({ filename: 'mock.apk', detail: 'Saved locally' });
    });

    server.listen(SERVER_PORT, '127.0.0.1', () => {
      console.log(`Standalone server on port ${SERVER_PORT}`);
    });
  };

  await BackgroundActions.start(startServer, backendOptions);
};

// In your App.tsx or _layout.tsx: useEffect(() => { startBackend(); }, []);
