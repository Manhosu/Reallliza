import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient, isDeviceOnline } from '../lib/api';
import { offlineStorage } from '../lib/offline-storage';
import { useSyncStore } from '../lib/sync-manager';
import {
  ServiceOrder,
  OsStatus,
  PaginatedResponse,
} from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncIndicator } from '../components/SyncIndicator';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

type FilterStatus = 'all' | OsStatus.PENDING | OsStatus.ASSIGNED | OsStatus.IN_PROGRESS | OsStatus.COMPLETED;

const FILTER_OPTIONS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: OsStatus.PENDING, label: 'Pendentes' },
  { key: OsStatus.ASSIGNED, label: 'Atribuidas' },
  { key: OsStatus.IN_PROGRESS, label: 'Em Andamento' },
  { key: OsStatus.COMPLETED, label: 'Concluidas' },
];

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchOrders = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        if (!isDeviceOnline()) {
          // Offline: load from local storage
          const cachedOrders = await offlineStorage.getServiceOrders();
          const filtered =
            filter === 'all'
              ? cachedOrders
              : cachedOrders.filter(o => o.status === filter);
          setOrders(filtered);
          setHasMore(false);
          setPage(1);
          return;
        }

        const params: Record<string, unknown> = {
          page: pageNum,
          limit: 20,
          sort: 'scheduled_date',
          order: 'desc',
        };

        if (filter !== 'all') {
          params.status = filter;
        }

        const response = await apiClient.get<PaginatedResponse<ServiceOrder>>(
          '/service-orders/my',
          params,
        );

        if (isRefresh || pageNum === 1) {
          setOrders(response.data);
          // Cache for offline use (save unfiltered first page)
          if (filter === 'all') {
            await offlineStorage.saveServiceOrders(response.data);
          }
        } else {
          setOrders(prev => [...prev, ...response.data]);
        }

        setHasMore(pageNum < response.meta.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('Error fetching orders:', error);
        // On network error, try to load from cache
        try {
          const cachedOrders = await offlineStorage.getServiceOrders();
          if (cachedOrders.length > 0) {
            const filtered =
              filter === 'all'
                ? cachedOrders
                : cachedOrders.filter(o => o.status === filter);
            setOrders(filtered);
            setHasMore(false);
          }
        } catch {
          // ignore cache read error
        }
      }
    },
    [filter],
  );

  useEffect(() => {
    setIsLoading(true);
    fetchOrders(1).finally(() => setIsLoading(false));
  }, [fetchOrders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchOrders(1, true);
    setIsRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    await fetchOrders(page + 1);
    setIsLoadingMore(false);
  };

  const formatAddress = (order: ServiceOrder): string => {
    const parts = [
      order.address_street,
      order.address_number,
      order.address_neighborhood,
      order.address_city,
    ].filter(Boolean);
    return parts.join(', ') || 'Endereco nao informado';
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Sem data';
    try {
      return format(new Date(dateStr), "dd 'de' MMM, HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateStr;
    }
  };

  const renderOrder = ({ item }: { item: ServiceOrder }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OsDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderNumber}>#{item.order_number}</Text>
        <PriorityBadge priority={item.priority} />
      </View>

      <Text style={styles.orderTitle} numberOfLines={2}>
        {item.title}
      </Text>

      <Text style={styles.clientName} numberOfLines={1}>
        {item.client_name}
      </Text>

      <View style={styles.orderInfo}>
        <View style={styles.infoRow}>
          <Ionicons
            name="location-outline"
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.infoText} numberOfLines={1}>
            {formatAddress(item)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.infoText}>
            {formatDate(item.scheduled_date)}
          </Text>
        </View>
      </View>

      <View style={styles.orderFooter}>
        <StatusBadge status={item.status} />
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textDark}
        />
      </View>
    </TouchableOpacity>
  );

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
      {/* Offline / Sync indicators */}
      <OfflineBanner />
      <SyncIndicator />

      {/* Filter Pills */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          keyExtractor={item => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterPill,
                filter === item.key && styles.filterPillActive,
              ]}
              onPress={() => setFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Orders List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={
            orders.length === 0
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
              icon="clipboard-outline"
              title="Nenhuma OS encontrada"
              message="Nao existem ordens de servico para este filtro."
            />
          }
        />
      )}
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.bodySmBold,
    color: colors.textMuted,
  },
  filterTextActive: {
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
    gap: 12,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    ...typography.captionBold,
    color: colors.primary,
  },
  orderTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 4,
  },
  clientName: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  orderInfo: {
    gap: 6,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
