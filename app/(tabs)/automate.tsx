import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  timestamp: string;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

interface SuggestionCardProps {
  title: string;
  description: string;
  onAccept: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ title, description, onAccept }) => {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.suggestionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <View style={styles.suggestionHeader}>
        <Ionicons name="bulb" size={24} color={colors.primary} />
        <Text style={[styles.suggestionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.suggestionDescription, { color: colors.textSecondary }]}>{description}</Text>
      <View style={styles.suggestionActions}>
        <TouchableOpacity
          style={[styles.chipButton, { backgroundColor: colors.success + '20', borderColor: colors.success }]}
          onPress={onAccept}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark" size={18} color={colors.success} />
          <Text style={[styles.chipText, { color: colors.success }]}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface ChatMessageProps {
  text: string;
  isUser: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ text, isUser }) => {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
      <View
        style={[
          styles.messageBubble,
          { backgroundColor: isUser ? colors.primary : colors.cardBackground },
          !isUser && { borderColor: colors.border, borderWidth: 1 },
        ]}
      >
        <Text style={[styles.messageText, { color: isUser ? '#FFFFFF' : colors.text }]}>{text}</Text>
      </View>
    </View>
  );
};

export default function Automate() {
  const { colors } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    fetchSuggestions();
    fetchMessages();
    setupNotifications();
  }, []);

  const setupNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Error', 'Notification permissions not granted');
      return;
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  };

  const scheduleNotification = async (title: string, body: string, trigger: Date) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { date: trigger },
    });
  };

  const fetchSuggestions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/suggestions`);
      setSuggestions(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch suggestions');
      Speech.speak('Failed to fetch suggestions', { language: 'en' });
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/messages`);
      setMessages(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch messages');
      Speech.speak('Failed to fetch messages', { language: 'en' });
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = { id: '', text: inputText, isUser: true, timestamp: new Date().toISOString() };
    try {
      await axios.post(`${API_BASE_URL}/messages`, { text: inputText, isUser: true });
      setMessages(prev => [...prev, userMessage]);
      setInputText('');

      const response = await axios.post(`${API_BASE_URL}/automate`, { text: inputText });
      const { response: aiResponse, taskExecuted, taskType } = response.data;
      
      const aiMessage: Message = { id: '', text: aiResponse, isUser: false, timestamp: new Date().toISOString() };
      await axios.post(`${API_BASE_URL}/messages`, { text: aiResponse, isUser: false });
      setMessages(prev => [...prev, aiMessage]);
      Speech.speak(aiResponse, { language: 'en' });

      if (taskExecuted && taskType === 'alarm') {
        const trigger = new Date(Date.now() + 60 * 1000);
        await scheduleNotification('Alarm', inputText, trigger);
        Speech.speak('Notification scheduled', { language: 'en' });
      }

      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Failed to process task';
      Alert.alert('Error', errorMsg);
      Speech.speak(errorMsg, { language: 'en' });
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    try {
      await axios.post(`${API_BASE_URL}/suggestions/accept/${suggestionId}`);
      Speech.speak('Suggestion accepted', { language: 'en' });
      fetchSuggestions();
    } catch (error: any) {
      Alert.alert('Error', 'Failed to accept suggestion');
      Speech.speak('Failed to accept suggestion', { language: 'en' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Ionicons name="flash" size={32} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Smart Suggestions</Text>
            <Text style={styles.headerSubtitle}>Powered by Phi-3 Mini</Text>
          </LinearGradient>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Adaptive Suggestions</Text>
            {suggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                title={suggestion.title}
                description={suggestion.description}
                onAccept={() => handleAcceptSuggestion(suggestion.id)}
              />
            ))}
          </View>

          <View style={[styles.resourceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Resource Allocation</Text>
            <View style={styles.resourceRow}>
              <Ionicons name="mail" size={24} color={colors.primary} />
              <Text style={[styles.resourceLabel, { color: colors.text }]}>Email Processing</Text>
              <Text style={[styles.resourceValue, { color: colors.textSecondary }]}>512 MB</Text>
            </View>
            <View style={styles.resourceRow}>
              <Ionicons name="cog" size={24} color={colors.primary} />
              <Text style={[styles.resourceLabel, { color: colors.text }]}>Background Tasks</Text>
              <Text style={[styles.resourceValue, { color: colors.textSecondary }]}>256 MB</Text>
            </View>
            <View style={styles.resourceRow}>
              <Ionicons name="brain" size={24} color={colors.primary} />
              <Text style={[styles.resourceLabel, { color: colors.text }]}>AI Processing</Text>
              <Text style={[styles.resourceValue, { color: colors.textSecondary }]}>1 GB</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>AI Assistant</Text>
            {messages.map((message) => (
              <ChatMessage key={message.id} text={message.text} isUser={message.isUser} />
            ))}
          </View>
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            placeholder="Ask me anything..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary }]}
            onPress={handleSend}
            activeOpacity={0.7}
          >
            <Ionicons name="send" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  suggestionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  suggestionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resourceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  resourceLabel: {
    flex: 1,
    fontSize: 14,
  },
  resourceValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  messageContainer: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});