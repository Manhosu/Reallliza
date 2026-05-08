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
import {
  ServiceOrder,
  OsStatus,
  PaginatedResponse,
  getOsTipo,
} from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type FilterStatus = 'all' | 'pendentes' | 'concluidas';
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

const FILTER_OPTIONS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'concluidas', label: 'Concluídas' },
];

export function PericiasScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      if (!isDeviceOnline()) {
        const cachedOrders = await offlineStorage.getServiceOrders();
        setOrders(cachedOrders.filter((o) => getOsTipo(o) === 'PERICIA'));
        return;
      }
      const response = await apiClient.get<PaginatedResponse<ServiceOrder>>(
        '/service-orders/my',
        { page: 1, limit: 100, sort: 'scheduled_date', order: 'desc' },
      );
      setOrders((response.data || []).filter((o) => getOsTipo(o) === 'PERICIA'));
    } catch (error) {
      console.error('Error fetching pericias:', error);
      try {
        const cached = await offlineStorage.getServiceOrders();
        setOrders(cached.filter((o) => getOsTipo(o) === 'PERICIA'));
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchOrders().finally(() => setIsLoading(false));
  }, [fetchOrders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchOrders();
    setIsRefreshing(false);
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === 'pendentes') {
      return (
        o.status !== OsStatus.COMPLETED &&
        o.status !== OsStatus.CANCELLED &&
        o.status !== OsStatus.REJECTED
      );
    }
    if (filter === 'concluidas') return o.status === OsStatus.COMPLETED;
    return true;
  });

  const formatAddress = (order: ServiceOrder): string => {
    const parts = [
      order.address_street,
      order.address_number,
      order.address_neighborhood,
      order.address_city,
    ].filter(Boolean);
    return parts.join(', ') || 'Endereço não informado';
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Sem data';
    try {
      return format(new Date(dateStr), "dd 'de' MMM, HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const renderOrder = ({ item }: { item: ServiceOrder }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => {
        // Tap no card da pericia abre direto a Vistoria (atalho explicito
        // pedido pela Jessica). Para ver dados do cliente/endereco/historico,
        // ha botao "Detalhes" dentro da VistoriaScreen.
        const protocolMatch = item.title?.match(/TK-[A-Z0-9-]+/i);
        const ticketProtocol = protocolMatch ? protocolMatch[0] : undefined;
        const meta = (item as any)?.external_metadata || {};
        const ticketId = (meta as any)?.ticket_id as string | undefined;
        navigation.navigate('Vistoria', {
          osId: item.id,
          ticketId,
          ticketProtocol,
        });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.periciaBadge}>
        <Ionicons name="search" size={11} color={colors.black} />
        <Text style={styles.periciaBadgeText}>CHAMADO DE PERÍCIA</Text>
      </View>
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
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.infoText} numberOfLines={1}>
            {formatAddress(item)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <Text style={styles.infoText}>{formatDate(item.scheduled_date)}</Text>
        </View>
      </View>

      <View style={styles.orderFooter}>
        <StatusBadge status={item.status} />
        <Ionicons name="chevron-forward" size={18} color={colors.textDark} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.container}>
        <OfflineBanner />

        <View style={styles.headerWrap}>
          <View style={styles.headerLeft}>
            <Ionicons name="search" size={22} color={colors.primary} />
            <View>
              <Text style={styles.heading}>Perícias</Text>
              <Text style={styles.subheading}>
                Chamados de vistoria técnica
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.filterContainer}>
          <FlatList
            horizontal
            data={FILTER_OPTIONS}
            keyExtractor={(i) => i.key}
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

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            renderItem={renderOrder}
            contentContainerStyle={
              filteredOrders.length === 0 ? styles.emptyContainer : styles.listContent
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
            ListEmptyComponent={
              <EmptyState
                icon="search-outline"
                title="Nenhum chamado de perícia"
                message="Quando o operador designar uma perícia para você, ela aparecerá aqui."
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { ...typography.h3, color: colors.primary },
  subheading: { ...typography.caption, color: colors.textMuted },
  filterContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterList: { gap: 6, paddingHorizontal: 4 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { ...typography.captionBold, color: colors.textMuted },
  filterTextActive: { color: colors.black },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  listContent: { padding: 16, gap: 0 },
  orderCard: {
    backgroundColor: colors.primary + '08',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginBottom: 12,
  },
  periciaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  periciaBadgeText: {
    ...typography.tiny,
    color: colors.black,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  orderNumber: { ...typography.captionBold, color: colors.primary },
  orderTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 4,
  },
  clientName: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginBottom: 8,
  },
  orderInfo: { gap: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
