import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient, ApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { FeedStackParamList } from '../navigation/feed-stack';

type CommentsRouteProp = RouteProp<FeedStackParamList, 'Comments'>;

interface FeedComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
}

function formatCommentDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "'Hoje' HH:mm", { locale: ptBR });
    if (isYesterday(date)) return format(date, "'Ontem' HH:mm");
    return format(date, "dd/MM 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function CommentsScreen() {
  const route = useRoute<CommentsRouteProp>();
  const { postId, postTitle } = route.params;
  const profile = useAuthStore((s) => s.profile);
  const myUserId = profile?.id;
  const isAdmin = profile?.role === 'admin';

  const [comments, setComments] = useState<FeedComment[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const data = await apiClient.get<{ data: FeedComment[] }>(
        `/feed/${postId}/comments`,
      );
      setComments(data.data || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  }, [postId]);

  useEffect(() => {
    setIsLoading(true);
    fetchComments().finally(() => setIsLoading(false));
  }, [fetchComments]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      setIsSending(true);
      const newComment = await apiClient.post<FeedComment>(
        `/feed/${postId}/comments`,
        { content: trimmed },
      );
      setInput('');
      setComments((prev) => [...prev, newComment]);
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Erro ao enviar comentário';
      Alert.alert('Erro', msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = (comment: FeedComment) => {
    if (comment.user_id !== myUserId && !isAdmin) return;
    Alert.alert('Apagar comentário', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/feed/comments/${comment.id}`);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
          } catch (error) {
            const msg =
              error instanceof ApiError ? error.message : 'Erro ao apagar';
            Alert.alert('Erro', msg);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: FeedComment }) => {
    const canDelete = item.user_id === myUserId || isAdmin;
    const initials = (item.user?.full_name || '?')
      .split(' ')
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <View style={styles.commentRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>
              {item.user?.full_name || 'Usuário'}
            </Text>
            <Text style={styles.commentDate}>
              {formatCommentDate(item.created_at)}
            </Text>
          </View>
          <Text style={styles.commentContent}>{item.content}</Text>
          {canDelete && (
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color={colors.textDark} />
              <Text style={styles.deleteLabel}>Apagar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.postBanner}>
          <Text style={styles.postBannerLabel}>Comentando em</Text>
          <Text style={styles.postBannerTitle} numberOfLines={2}>
            {postTitle}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            contentContainerStyle={
              comments.length === 0 ? styles.emptyContent : styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={48}
                  color={colors.textDark}
                />
                <Text style={styles.emptyTitle}>Nenhum comentário ainda</Text>
                <Text style={styles.emptyText}>
                  Seja o primeiro a comentar.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Escreva um comentário..."
            placeholderTextColor={colors.textDark}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !input.trim() && styles.sendButtonDisabled,
            ]}
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
  postBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  postBannerLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  postBannerTitle: {
    ...typography.bodySmBold,
    color: colors.text,
  },
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
    gap: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  commentBody: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    ...typography.captionBold,
    color: colors.text,
  },
  commentDate: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  commentContent: {
    ...typography.bodySm,
    color: colors.text,
    lineHeight: 19,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  deleteLabel: {
    ...typography.tiny,
    color: colors.textDark,
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
