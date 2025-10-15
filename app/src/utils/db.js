import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock Mongo collections
export const db = {
  status_checks: {
    insertOne: async (doc) => {
      const key = 'status_' + Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(doc));
    },
    find: async () => {
      const keys = await AsyncStorage.getAllKeys();
      const docs = [];
      for (const key of keys.filter(k => k.startsWith('status_'))) {
        const doc = await AsyncStorage.getItem(key);
        docs.push(JSON.parse(doc));
      }
      return docs;
    },
  },
  // Add for os_environments, emulators, rustdesk_sessions, etc.
};
