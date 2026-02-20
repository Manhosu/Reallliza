import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { Notification, PaginatedResponse } from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// ============================================================
// Helpers
// ============================================================

const NOTIFICATION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  os_created: 'add-circle-outline',
  os_assigned: 'person-add-outline',
  os_status_changed: 'swap-horizontal-outline',
  os_completed: 'checkmark-circle-outline',
  os_cancelled: 'close-circle-outline',
  schedule_reminder: 'alarm-outline',
  tool_custody: 'hammer-outline',
  system: 'information-circle-outline',
  general: 'megaphone-outline',
};

function formatNotificationDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, "'Hoje' HH:mm", { locale: ptBR });
    }
    if (isYesterday(date)) {
      return format(date, "'Ontem' HH:mm", { locale: ptBR });
    }
    return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

// ============================================================
// Component
// ============================================================

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const fetchNotifications = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const response = await apiClient.get<PaginatedResponse<Notification>>(
          '/notifications',
          { page: pageNum, limit: 30 },
        );

        if (isRefresh || pageNum === 1) {
          setNotifications(response.data);
        } else {
          setNotifications(prev => [...prev, ...response.data]);
        }

        setHasMore(pageNum < response.meta.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    },
    [],
  );

  useEffect(() => {
    setIsLoading(true);
    fetchNotifications(1).finally(() => setIsLoading(false));
  }, [fetchNotifications]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchNotifications(1, true);
    setIsRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    await fetchNotifications(page + 1);
    setIsLoadingMore(false);
  };

  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      setIsMarkingAll(true);
      await apiClient.patch('/notifications/read-all');
      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })),
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const renderNotification = ({ item }: { item: Notification }) => {
    const isUnread = !item.read_at;
    const iconName = NOTIFICATION_ICONS[item.type] || 'notifications-outline';

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.cardUnread]}
        onPress={() => {
          if (isUnread) markAsRead(item.id);
        }}
        activeOpacity={isUnread ? 0.7 : 1}
      >
        {/* Unread indicator dot */}
        {isUnread && <View style={styles.unreadDot} />}

        <View style={styles.iconContainer}>
          <Ionicons
            name={iconName}
            size={22}
            color={isUnread ? colors.primary : colors.textDark}
          />
        </View>

        <View style={styles.contentContainer}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.message && (
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
          )}
          <Text style={styles.time}>
            {formatNotificationDate(item.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notificacoes</Text>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllAsRead}
              disabled={isMarkingAll}
              style={styles.markAllBtn}
            >
              {isMarkingAll ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.markAllText}>Marcar todas como lidas</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={item => item.id}
            renderItem={renderNotification}
            contentContainerStyle={
              notifications.length === 0
                ? styles.emptyContainer
                : styles.listContent
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.card}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              <EmptyState
                icon="notifications-off-outline"
                title="Nenhuma notificacao"
                message="Voce nao tem notificacoes no momento."
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    ...typography.caption,
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardUnread: {
    borderColor: colors.primary + '40',
    backgroundColor: colors.cardAlt,
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodySm,
    color: colors.text,
    marginBottom: 2,
  },
  titleUnread: {
    ...typography.bodySmBold,
  },
  message: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
  time: {
    ...typography.tiny,
    color: colors.textDark,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
