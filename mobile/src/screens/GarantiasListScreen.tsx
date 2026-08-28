import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { GarantiasStackParamList } from '../navigation/garantias-stack';

/**
 * Lista de garantias do homologado (Jose 27/08).
 *
 * GET /warranties já filtra pra `assigned_technician_id = eu` quando quem
 * pede é homologado — nada de query extra aqui, a API decide o escopo.
 */

type WarrantyStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';

interface Warranty {
  id: string;
  status: WarrantyStatus;
  description: string;
  opened_at: string;
  service_order?: {
    order_number: number | null;
    client_name: string | null;
  } | null;
}

const STATUS_CONFIG: Record<
  WarrantyStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  open: { label: 'Aberta', icon: 'alert-circle-outline', color: colors.warning },
  in_progress: { label: 'Em análise', icon: 'time-outline', color: colors.info },
  resolved: { label: 'Resolvida', icon: 'checkmark-circle-outline', color: colors.success },
  rejected: { label: 'Recusada', icon: 'close-circle-outline', color: colors.textMuted },
};

type ListRoute = RouteProp<GarantiasStackParamList, 'GarantiasList'>;

export function GarantiasListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<ListRoute>();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const alvoAplicadoRef = useRef<string | null>(null);

  const fetchWarranties = useCallback(async () => {
    try {
      const data = await apiClient.get<Warranty[]>('/warranties');
      setWarranties(data);
    } catch (error) {
      console.error('Error fetching warranties:', error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchWarranties().finally(() => setIsLoading(false));
  }, [fetchWarranties]);

  // Chegou por notificação (warranty_opened) — abre direto no detalhe.
  useEffect(() => {
    const alvo = route.params?.warrantyId;
    if (!alvo || alvoAplicadoRef.current === alvo) return;
    alvoAplicadoRef.current = alvo;
    navigation.navigate('GarantiaDetail', { warrantyId: alvo });
  }, [route.params?.warrantyId, navigation]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchWarranties();
    setIsRefreshing(false);
  };

  const formatDate = (dateStr: string): string => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: Warranty }) => {
    const cfg = STATUS_CONFIG[item.status];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('GarantiaDetail', { warrantyId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.osTitle} numberOfLines={1}>
            OS #{item.service_order?.order_number ?? '—'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.color + '20' }]}>
            <Ionicons name={cfg.icon} size={13} color={cfg.color} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {item.service_order?.client_name && (
          <Text style={styles.clientText}>Cliente: {item.service_order.client_name}</Text>
        )}
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
        <Text style={styles.dateText}>Aberta em {formatDate(item.opened_at)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={warranties}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={
              warranties.length === 0 ? styles.emptyContainer : styles.listContent
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="shield-checkmark-outline"
                title="Nenhuma garantia"
                message="Quando uma loja abrir uma garantia sobre um serviço seu, ela aparece aqui."
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  osTitle: { ...typography.bodySmBold, color: colors.text, flex: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: { ...typography.captionBold },
  clientText: { ...typography.bodySm, color: colors.textSecondary, marginBottom: 4 },
  description: { ...typography.bodySm, color: colors.textSecondary },
  dateText: { ...typography.caption, color: colors.textMuted, marginTop: 8 },
});
