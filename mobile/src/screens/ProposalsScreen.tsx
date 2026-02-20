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

// ============================================================
// Types
// ============================================================

interface Proposal {
  id: string;
  service_order_id: string;
  partner_id: string;
  status: 'pending' | 'accepted' | 'rejected';
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
    client_name: string;
  };
  partner?: {
    id: string;
    company_name: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
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

    return (
      <View style={styles.card}>
        {/* Header: status badge */}
        <View style={styles.cardHeader}>
          <View style={styles.osInfo}>
            <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
            <Text style={styles.osTitle} numberOfLines={1}>
              {item.service_order?.title || 'OS sem titulo'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
        </View>

        {/* Client name */}
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={14} color={colors.textMuted} />
          <Text style={styles.infoText}>
            Cliente: {item.service_order?.client_name || '-'}
          </Text>
        </View>

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
