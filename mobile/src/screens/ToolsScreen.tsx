import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import {
  ToolCustody,
  ToolInventory,
  TOOL_CONDITION_LABELS,
  ToolCondition,
} from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type Tab = 'custody' | 'requests' | 'history';

interface CustodyWithTool extends ToolCustody {
  tool?: ToolInventory;
}

interface ToolRequest {
  id: string;
  tool_id: string | null;
  tool_name: string;
  quantity: number;
  justification: string | null;
  status: 'pending' | 'approved' | 'released' | 'rejected' | 'cancelled';
  approved_at: string | null;
  released_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<ToolRequest['status'], string> = {
  pending: 'Enviado',
  approved: 'Aprovado',
  released: 'Liberado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
};

const STATUS_COLOR: Record<ToolRequest['status'], string> = {
  pending: colors.warning,
  approved: colors.info,
  released: colors.success,
  rejected: colors.danger,
  cancelled: colors.textDark,
};

export function ToolsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<OsStackParamList>>();
  const [tab, setTab] = useState<Tab>('custody');
  const [custodies, setCustodies] = useState<CustodyWithTool[]>([]);
  const [requests, setRequests] = useState<ToolRequest[]>([]);
  const [history, setHistory] = useState<CustodyWithTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [c, r, h] = await Promise.all([
        apiClient.get<CustodyWithTool[]>('/tools/my-custody'),
        apiClient.get<ToolRequest[]>('/tools/requests/my'),
        apiClient
          .get<CustodyWithTool[]>('/tools/my-custody?include_returned=true')
          .catch(() => [] as CustodyWithTool[]),
      ]);
      setCustodies(c);
      setRequests(r);
      setHistory(h.filter((x) => x.checked_in_at));
    } catch (error) {
      console.error('Tools fetch error:', error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handleReturn = (custody: CustodyWithTool) => {
    Alert.alert(
      'Devolver Ferramenta',
      `Devolver "${custody.tool?.name || 'Ferramenta'}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Devolver',
          onPress: async () => {
            try {
              setReturningId(custody.id);
              await apiClient.patch(`/tools/custody/${custody.id}/return`, {
                condition_in: ToolCondition.GOOD,
              });
              await fetchData();
            } catch {
              Alert.alert('Erro', 'Falha ao devolver');
            } finally {
              setReturningId(null);
            }
          },
        },
      ],
    );
  };

  const handleCancelRequest = (req: ToolRequest) => {
    Alert.alert('Cancelar pedido', `Cancelar pedido de "${req.tool_name}"?`, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim',
        onPress: async () => {
          try {
            await apiClient.patch(`/tools/requests/${req.id}/cancel`);
            await fetchData();
          } catch {
            Alert.alert('Erro', 'Falha ao cancelar');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Tab pills */}
      <View style={styles.tabBar}>
        {(['custody', 'requests', 'history'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'custody' ? 'Custódia' : t === 'requests' ? 'Pedidos' : 'Histórico'}
            </Text>
            {t === 'custody' && custodies.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{custodies.length}</Text>
              </View>
            )}
            {t === 'requests' &&
              requests.filter((r) => r.status === 'pending').length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {requests.filter((r) => r.status === 'pending').length}
                  </Text>
                </View>
              )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : tab === 'custody' ? (
          <>
            <TouchableOpacity
              style={styles.requestButton}
              onPress={() =>
                (navigation as any).getParent()?.navigate('ToolRequest')
              }
            >
              <Ionicons name="add-circle" size={20} color={colors.black} />
              <Text style={styles.requestButtonText}>Solicitar Ferramenta</Text>
            </TouchableOpacity>

            {custodies.length === 0 ? (
              <EmptyState
                icon="hammer-outline"
                title="Nenhuma ferramenta"
                message="Você não possui ferramentas em custódia no momento."
              />
            ) : (
              custodies.map((c) => (
                <View key={c.id} style={styles.toolCard}>
                  <View style={styles.toolIcon}>
                    <Ionicons name="hammer-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.toolInfo}>
                    <Text style={styles.toolName}>{c.tool?.name || 'Ferramenta'}</Text>
                    {c.tool?.serial_number && (
                      <Text style={styles.detailText}>S/N: {c.tool.serial_number}</Text>
                    )}
                    <Text style={styles.detailText}>
                      Retirado: {format(new Date(c.checked_out_at), 'dd/MM/yy', { locale: ptBR })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.returnButton}
                    onPress={() => handleReturn(c)}
                    disabled={returningId === c.id}
                  >
                    {returningId === c.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="return-down-back" size={16} color={colors.primary} />
                        <Text style={styles.returnButtonText}>Devolver</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        ) : tab === 'requests' ? (
          <>
            <TouchableOpacity
              style={styles.requestButton}
              onPress={() =>
                (navigation as any).getParent()?.navigate('ToolRequest')
              }
            >
              <Ionicons name="add-circle" size={20} color={colors.black} />
              <Text style={styles.requestButtonText}>Nova solicitação</Text>
            </TouchableOpacity>

            {requests.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="Nenhum pedido"
                message="Solicite uma ferramenta para começar."
              />
            ) : (
              requests.map((r) => (
                <View key={r.id} style={styles.toolCard}>
                  <View style={styles.toolInfo}>
                    <View style={styles.requestHeader}>
                      <Text style={styles.toolName}>
                        {r.quantity}x {r.tool_name}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: STATUS_COLOR[r.status] + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: STATUS_COLOR[r.status] },
                          ]}
                        >
                          {STATUS_LABEL[r.status]}
                        </Text>
                      </View>
                    </View>
                    {r.justification && (
                      <Text style={styles.detailText}>{r.justification}</Text>
                    )}
                    <Text style={styles.detailText}>
                      {format(new Date(r.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                    </Text>
                    {r.rejection_reason && (
                      <Text style={[styles.detailText, { color: colors.danger }]}>
                        Motivo: {r.rejection_reason}
                      </Text>
                    )}
                    {r.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.cancelLink}
                        onPress={() => handleCancelRequest(r)}
                      >
                        <Text style={styles.cancelLinkText}>Cancelar pedido</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          // history
          history.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="Sem histórico"
              message="Suas devoluções de ferramenta aparecerão aqui."
            />
          ) : (
            history.map((h) => (
              <View key={h.id} style={styles.toolCard}>
                <View style={styles.toolIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                </View>
                <View style={styles.toolInfo}>
                  <Text style={styles.toolName}>{h.tool?.name || 'Ferramenta'}</Text>
                  <Text style={styles.detailText}>
                    Retirou: {format(new Date(h.checked_out_at), 'dd/MM/yy', { locale: ptBR })}
                  </Text>
                  {h.checked_in_at && (
                    <Text style={styles.detailText}>
                      Devolveu: {format(new Date(h.checked_in_at), 'dd/MM/yy', { locale: ptBR })}
                    </Text>
                  )}
                  {h.condition_in && (
                    <Text style={styles.detailText}>
                      Condição: {TOOL_CONDITION_LABELS[h.condition_in]}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.black,
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  requestButtonText: {
    ...typography.button,
    color: colors.black,
  },
  toolCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolInfo: {
    flex: 1,
    gap: 2,
  },
  toolName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  detailText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    ...typography.tiny,
    fontWeight: '700',
  },
  returnButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  returnButtonText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '600',
  },
  cancelLink: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  cancelLinkText: {
    ...typography.captionBold,
    color: colors.danger,
    textDecorationLine: 'underline',
  },
});
