import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

interface CustodyWithTool extends ToolCustody {
  tool?: ToolInventory;
}

export function ToolsScreen() {
  const [custodies, setCustodies] = useState<CustodyWithTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);

  const fetchCustodies = useCallback(async () => {
    try {
      const data = await apiClient.get<CustodyWithTool[]>(
        '/tools/my-custody',
      );
      setCustodies(data);
    } catch (error) {
      console.error('Error fetching tool custody:', error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchCustodies().finally(() => setIsLoading(false));
  }, [fetchCustodies]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchCustodies();
    setIsRefreshing(false);
  };

  const handleReturn = (custody: CustodyWithTool) => {
    const toolName = custody.tool?.name || 'Ferramenta';
    Alert.alert(
      'Devolver Ferramenta',
      `Deseja devolver "${toolName}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Devolver',
          onPress: () => returnTool(custody.id),
        },
      ],
    );
  };

  const returnTool = async (custodyId: string) => {
    try {
      setReturningId(custodyId);
      await apiClient.patch(`/tools/custody/${custodyId}/return`, {
        condition_in: ToolCondition.GOOD,
      });
      await fetchCustodies();
      Alert.alert('Sucesso', 'Ferramenta devolvida com sucesso.');
    } catch (error) {
      console.error('Error returning tool:', error);
      Alert.alert('Erro', 'Nao foi possivel devolver a ferramenta.');
    } finally {
      setReturningId(null);
    }
  };

  const getConditionColor = (condition: ToolCondition): string => {
    switch (condition) {
      case ToolCondition.NEW:
        return colors.success;
      case ToolCondition.GOOD:
        return colors.success;
      case ToolCondition.FAIR:
        return colors.warning;
      case ToolCondition.POOR:
        return colors.danger;
      case ToolCondition.DAMAGED:
        return colors.danger;
      default:
        return colors.textMuted;
    }
  };

  const renderCustody = ({ item }: { item: CustodyWithTool }) => {
    const isReturning = returningId === item.id;

    return (
      <View style={styles.toolCard}>
        <View style={styles.toolIcon}>
          <Ionicons name="hammer-outline" size={28} color={colors.primary} />
        </View>

        <View style={styles.toolInfo}>
          <Text style={styles.toolName} numberOfLines={1}>
            {item.tool?.name || 'Ferramenta'}
          </Text>

          {item.tool?.serial_number && (
            <Text style={styles.serialNumber}>
              S/N: {item.tool.serial_number}
            </Text>
          )}

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons
                name="calendar-outline"
                size={12}
                color={colors.textMuted}
              />
              <Text style={styles.detailText}>
                Retirado:{' '}
                {format(new Date(item.checked_out_at), 'dd/MM/yy', {
                  locale: ptBR,
                })}
              </Text>
            </View>

            <View
              style={[
                styles.conditionBadge,
                {
                  backgroundColor:
                    getConditionColor(item.condition_out) + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.conditionText,
                  {
                    color: getConditionColor(item.condition_out),
                  },
                ]}
              >
                {TOOL_CONDITION_LABELS[item.condition_out]}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.returnButton,
            isReturning && styles.returnButtonDisabled,
          ]}
          onPress={() => handleReturn(item)}
          disabled={isReturning}
        >
          {isReturning ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons
                name="return-down-back-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.returnButtonText}>Devolver</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
          data={custodies}
          keyExtractor={item => item.id}
          renderItem={renderCustody}
          contentContainerStyle={
            custodies.length === 0
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
          ListEmptyComponent={
            <EmptyState
              icon="hammer-outline"
              title="Nenhuma ferramenta"
              message="Voce nao possui ferramentas em custodia no momento."
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
  toolCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
  },
  toolIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolInfo: {
    flex: 1,
    gap: 2,
  },
  toolName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  serialNumber: {
    ...typography.caption,
    color: colors.textDark,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  conditionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  conditionText: {
    ...typography.tiny,
    fontWeight: '600',
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
  returnButtonDisabled: {
    opacity: 0.5,
  },
  returnButtonText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '600',
  },
});
