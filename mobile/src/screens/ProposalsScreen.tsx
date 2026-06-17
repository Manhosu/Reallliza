import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { PaginatedResponse } from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useProposalsRealtime } from '../lib/hooks/useProposalsRealtime';

// ============================================================
// Types
// ============================================================

interface Proposal {
  id: string;
  service_order_id: string;
  partner_id: string | null;
  accepted_by: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  proposed_value: number | null;
  message: string | null;
  response_message: string | null;
  proposed_by: string;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  service_order?: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    client_name: string | null;    // null quando pending (privacidade)
    address_neighborhood: string | null;
    address_city: string | null;
    address_state: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    scheduled_date: string | null;
    estimated_value: number | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
  expired: 'Expirada',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa', medium: 'Normal', high: 'Alta', urgent: 'Urgente',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6B7280', medium: '#3B82F6', high: '#F59E0B', urgent: '#EF4444',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  accepted: colors.success,
  rejected: colors.danger,
};

// ============================================================
// Component
// ============================================================

export function ProposalsScreen() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const fetchProposals = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const response = await apiClient.get<PaginatedResponse<Proposal>>(
          '/proposals',
          { page: pageNum, limit: 20 },
        );

        if (isRefresh || pageNum === 1) {
          setProposals(response.data);
        } else {
          setProposals(prev => [...prev, ...response.data]);
        }

        setHasMore(pageNum < response.meta.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('Error fetching proposals:', error);
      }
    },
    [],
  );

  useEffect(() => {
    setIsLoading(true);
    fetchProposals(1).finally(() => setIsLoading(false));
  }, [fetchProposals]);

  // Realtime: nova proposta broadcast cai imediatamente na lista, e quando
  // outro técnico aceita um broadcast em que esse user também recebeu, a
  // entrada some/atualiza pra "expirada" sem precisar puxar refresh.
  const onProposalChange = useCallback(() => {
    fetchProposals(1, true);
  }, [fetchProposals]);
  useProposalsRealtime({ onChange: onProposalChange });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchProposals(1, true);
    setIsRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    await fetchProposals(page + 1);
    setIsLoadingMore(false);
  };

  const handleRespond = (proposalId: string, action: 'accept' | 'reject') => {
    const label = action === 'accept' ? 'aceitar' : 'rejeitar';
    Alert.alert(
      'Confirmar',
      `Deseja ${label} esta proposta?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: action === 'accept' ? 'Aceitar' : 'Rejeitar',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setRespondingId(proposalId);
              await apiClient.post(`/proposals/${proposalId}/respond`, {
                action,
              });
              await fetchProposals(1, true);
              Alert.alert(
                'Sucesso',
                action === 'accept'
                  ? 'Proposta aceita com sucesso!'
                  : 'Proposta rejeitada.',
              );
            } catch (error) {
              console.error('Error responding to proposal:', error);
              Alert.alert('Erro', `Nao foi possivel ${label} a proposta.`);
            } finally {
              setRespondingId(null);
            }
          },
        },
      ],
    );
  };

  const formatDate = (dateStr: string): string => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'as' HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number | null): string => {
    if (value == null) return '-';
    return `R$ ${Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    })}`;
  };

  const renderProposal = ({ item }: { item: Proposal }) => {
    const statusColor = STATUS_COLORS[item.status] || colors.textMuted;
    const isPending = item.status === 'pending';
    const isResponding = respondingId === item.id;

    const os = item.service_order;
    const priority = os?.priority || 'medium';

    return (
      <View style={styles.card}>
        {/* Header: status + priority */}
        <View style={styles.cardHeader}>
          <View style={styles.osInfo}>
            <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
            <Text style={styles.osTitle} numberOfLines={1}>
              {os?.title || 'OS sem título'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {priority !== 'medium' && (
              <View style={[styles.statusBadge, { backgroundColor: PRIORITY_COLORS[priority] + '20' }]}>
                <Text style={[styles.statusText, { color: PRIORITY_COLORS[priority] }]}>
                  {PRIORITY_LABELS[priority]}
                </Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Localização — visível sempre */}
        {(os?.address_city || os?.address_neighborhood) && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>
              {[os?.address_neighborhood, os?.address_city, os?.address_state].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}

        {/* Cliente — somente após aceite */}
        {item.status !== 'pending' && os?.client_name && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>Cliente: {os.client_name}</Text>
          </View>
        )}

        {/* Aviso de privacidade para propostas pendentes */}
        {isPending && (
          <View style={styles.privacyRow}>
            <Ionicons name="eye-off-outline" size={12} color={colors.textMuted} />
            <Text style={styles.privacyText}>Dados do cliente visíveis após aceite</Text>
          </View>
        )}

        {/* Value */}
        {item.proposed_value != null && (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>
              Valor: {formatCurrency(item.proposed_value)}
            </Text>
          </View>
        )}

        {/* Message */}
        {item.message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText} numberOfLines={3}>
              {item.message}
            </Text>
          </View>
        )}

        {/* Data agendada */}
        {os?.scheduled_date && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>
              Agendado: {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
            </Text>
          </View>
        )}

        {/* Date */}
        <Text style={styles.dateText}>
          Recebida em {formatDate(item.created_at)}
        </Text>

        {/* Expiration warning */}
        {isPending && item.expires_at && (
          <View style={styles.expirationRow}>
            <Ionicons name="time-outline" size={14} color={colors.warning} />
            <Text style={styles.expirationText}>
              Expira em {formatDate(item.expires_at)}
            </Text>
          </View>
        )}

        {/* Action buttons for pending proposals */}
        {isPending && (
          <View style={styles.actionButtons}>
            {isResponding ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleRespond(item.id, 'reject')}
                >
                  <Ionicons name="close" size={18} color={colors.danger} />
                  <Text style={[styles.actionBtnText, { color: colors.danger }]}>
                    Rejeitar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleRespond(item.id, 'accept')}
                >
                  <Ionicons name="checkmark" size={18} color={colors.black} />
                  <Text style={[styles.actionBtnText, { color: colors.black }]}>
                    Aceitar
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Response message if responded */}
        {item.response_message && item.status !== 'pending' && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>Sua resposta:</Text>
            <Text style={styles.responseText}>{item.response_message}</Text>
          </View>
        )}
      </View>
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
          <Text style={styles.headerTitle}>Propostas</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={proposals}
            keyExtractor={item => item.id}
            renderItem={renderProposal}
            contentContainerStyle={
              proposals.length === 0 ? styles.emptyContainer : styles.listContent
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
                icon="document-text-outline"
                title="Nenhuma proposta"
                message="Voce ainda nao recebeu propostas."
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
  },
  headerTitle: {
    ...typography.h3,
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
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  osInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  osTitle: {
    ...typography.bodySmBold,
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    ...typography.captionBold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  messageBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  messageText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  dateText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 8,
  },
  expirationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  expirationText: {
    ...typography.caption,
    color: colors.warning,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    opacity: 0.6,
  },
  privacyText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    justifyContent: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },
  rejectBtn: {
    backgroundColor: colors.danger + '15',
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  acceptBtn: {
    backgroundColor: colors.success,
  },
  actionBtnText: {
    ...typography.buttonSm,
  },
  responseBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  responseLabel: {
    ...typography.captionBold,
    color: colors.textMuted,
    marginBottom: 2,
  },
  responseText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
