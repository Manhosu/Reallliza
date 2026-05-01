import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type ChatRouteProp = RouteProp<OsStackParamList, 'Chat'>;

interface OsMessage {
  id: string;
  service_order_id: string;
  sender_user_id: string | null;
  sender_role: string;
  sender_name: string;
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  read_at: string | null;
  created_at: string;
}

function formatMsgDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm', { locale: ptBR });
    if (isYesterday(date)) return `Ontem ${format(date, 'HH:mm')}`;
    return format(date, 'dd/MM HH:mm', { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const { serviceOrderId } = route.params;
  const profile = useAuthStore((s) => s.profile);
  const myUserId = profile?.id;

  const [messages, setMessages] = useState<OsMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<OsMessage>>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiClient.get<OsMessage[]>(
        `/service-orders/${serviceOrderId}/messages`,
      );
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    setIsLoading(true);
    fetchMessages().finally(() => setIsLoading(false));
    const interval = setInterval(fetchMessages, 15000); // polling 15s
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      setIsSending(true);
      await apiClient.post(`/service-orders/${serviceOrderId}/messages`, {
        content: trimmed,
      });
      setInput('');
      await fetchMessages();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao enviar mensagem';
      Alert.alert('Erro', msg);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }: { item: OsMessage }) => {
    const isMe = item.sender_user_id === myUserId;
    const isSystem = item.sender_role === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemContainer}>
          <Text style={styles.systemText}>{item.content}</Text>
          <Text style={styles.systemDate}>{formatMsgDate(item.created_at)}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
          {item.attachment_url && item.attachment_type === 'image' && (
            <Image
              source={{ uri: item.attachment_url }}
              style={styles.attachmentImage}
              resizeMode="cover"
            />
          )}
          {item.content.length > 0 && (
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
              {item.content}
            </Text>
          )}
          <Text style={[styles.bubbleDate, isMe && styles.bubbleDateMe]}>
            {formatMsgDate(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={
              messages.length === 0 ? styles.emptyContent : styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textDark} />
                <Text style={styles.emptyTitle}>Nenhuma mensagem ainda</Text>
                <Text style={styles.emptyText}>
                  Use o chat para falar com a empresa sobre esta OS. Tudo fica registrado.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Digite uma mensagem..."
            placeholderTextColor={colors.textDark}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.black} />
            ) : (
              <Ionicons name="send" size={20} color={colors.black} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyContent: {
    flexGrow: 1,
  },
  listContent: {
    padding: 12,
    gap: 6,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    ...typography.captionBold,
    color: colors.primary,
    marginBottom: 2,
  },
  bubbleText: {
    ...typography.bodySm,
    color: colors.text,
  },
  bubbleTextMe: {
    color: colors.black,
  },
  bubbleDate: {
    ...typography.tiny,
    color: colors.textDark,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleDateMe: {
    color: colors.black + '99',
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  systemContainer: {
    alignSelf: 'center',
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginVertical: 4,
  },
  systemText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  systemDate: {
    ...typography.tiny,
    color: colors.textDark,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    maxHeight: 120,
    ...typography.bodySm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
