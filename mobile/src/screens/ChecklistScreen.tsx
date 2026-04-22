import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, ApiError, isDeviceOnline, queueOfflineAction } from '../lib/api';
import { offlineStorage } from '../lib/offline-storage';
import { Checklist, ChecklistItem } from '../lib/types';
import { OfflineBanner } from '../components/OfflineBanner';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type ChecklistRoute = RouteProp<OsStackParamList, 'Checklist'>;

export function ChecklistScreen() {
  const route = useRoute<ChecklistRoute>();
  const navigation = useNavigation();
  const { serviceOrderId } = route.params;

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [versions, setVersions] = useState<Record<string, number | undefined>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const fetchChecklists = useCallback(async () => {
    try {
      if (!isDeviceOnline()) {
        // Load from local cache
        const cached = await offlineStorage.getChecklists(serviceOrderId);
        if (cached.length > 0) {
          setChecklists(cached);
          return;
        }
      }

      const data = await apiClient.get<Checklist[]>(
        `/service-orders/${serviceOrderId}/checklists`,
      );
      setChecklists(data);
      // Store versions for optimistic concurrency control
      const versionMap: Record<string, number | undefined> = {};
      data.forEach(cl => { versionMap[cl.id] = cl.version; });
      setVersions(versionMap);
      // Cache for offline use
      await offlineStorage.saveChecklists(serviceOrderId, data);
    } catch (error) {
      console.error('Error fetching checklists:', error);
      // Try loading from cache on error
      try {
        const cached = await offlineStorage.getChecklists(serviceOrderId);
        if (cached.length > 0) {
          setChecklists(cached);
          return;
        }
      } catch {
        // ignore cache error
      }
      Alert.alert('Erro', 'Nao foi possivel carregar os checklists.');
    }
  }, [serviceOrderId]);

  // Template de perícia para OS tipo PERICIA (7 itens técnicos)
  const PERICIA_TEMPLATE_ITEMS: ChecklistItem[] = [
    { id: 'pericia_1', label: 'Temperatura (Mínima/Média/Máxima) — Aferir temperatura do ambiente', checked: false, notes: null, checked_at: null },
    { id: 'pericia_2', label: 'Condições Ambientais — Exposição solar direta (verificar período)', checked: false, notes: null, checked_at: null },
    { id: 'pericia_3', label: 'Canoamento (empenamento longitudinal) — Verificar desníveis e espaçamento irregular', checked: false, notes: null, checked_at: null },
    { id: 'pericia_4', label: 'Clique quebrado — Verificar desalinhamento, folgas, movimento e fissuras', checked: false, notes: null, checked_at: null },
    { id: 'pericia_5', label: 'Rebarba na extremidade de peça — Toque, visualização, raspe e alinhamento', checked: false, notes: null, checked_at: null },
    { id: 'pericia_6', label: 'Peças levantando-se (transversal/longitudinal) — Verificar curvatura e espaços abertos', checked: false, notes: null, checked_at: null },
    { id: 'pericia_7', label: 'Deslocamento de capa protetora de fio decorativo — Verificar alinhamento e folgas', checked: false, notes: null, checked_at: null },
  ];

  useEffect(() => {
    setIsLoading(true);
    fetchChecklists().finally(() => setIsLoading(false));
  }, [fetchChecklists]);

  // Quando não há checklists carregados, verificar se é OS PERICIA e criar template local
  useEffect(() => {
    if (!isLoading && checklists.length === 0) {
      // Buscar metadata da OS para detectar tipo PERICIA
      apiClient.get<any>(`/service-orders/${serviceOrderId}`)
        .then((os) => {
          const meta = os.external_metadata || os.metadata;
          if (meta?.tipo === 'PERICIA' || os.title?.toLowerCase().includes('perícia')) {
            setChecklists([{
              id: `pericia-local-${serviceOrderId}`,
              service_order_id: serviceOrderId,
              template_id: null,
              title: 'Checklist de Vistoria Técnica',
              items: PERICIA_TEMPLATE_ITEMS,
              completed_at: null,
              completed_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }]);
          }
        })
        .catch(() => {});
    }
  }, [isLoading, checklists.length, serviceOrderId]);

  const toggleItem = (checklistId: string, itemId: string) => {
    setChecklists(prev =>
      prev.map(cl => {
        if (cl.id !== checklistId) return cl;
        return {
          ...cl,
          items: cl.items.map(item => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              checked: !item.checked,
              checked_at: !item.checked ? new Date().toISOString() : null,
            };
          }),
        };
      }),
    );
  };

  const updateItemNotes = (
    checklistId: string,
    itemId: string,
    notes: string,
  ) => {
    setChecklists(prev =>
      prev.map(cl => {
        if (cl.id !== checklistId) return cl;
        return {
          ...cl,
          items: cl.items.map(item => {
            if (item.id !== itemId) return item;
            return { ...item, notes: notes || null };
          }),
        };
      }),
    );
  };

  const toggleNotes = (itemId: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const saveChecklist = async (checklistId: string) => {
    const checklist = checklists.find(cl => cl.id === checklistId);
    if (!checklist) return;

    const version = versions[checklistId];

    try {
      setIsSaving(true);

      if (!isDeviceOnline()) {
        // Save locally and queue for sync
        await offlineStorage.saveChecklists(serviceOrderId, checklists);
        await queueOfflineAction({
          type: 'checklist_update',
          endpoint: `/checklists/${checklistId}`,
          method: 'PUT',
          body: { items: checklist.items, version },
        });
        Alert.alert('Salvo localmente', 'O checklist sera sincronizado quando a conexao for restaurada.');
        return;
      }

      const result = await apiClient.put<Checklist>(`/checklists/${checklistId}`, {
        items: checklist.items,
        version,
      });
      // Update version from server response
      if (result?.version !== undefined) {
        setVersions(prev => ({ ...prev, [checklistId]: result.version }));
      }
      // Update local cache after successful save
      await offlineStorage.saveChecklists(serviceOrderId, checklists);
      Alert.alert('Sucesso', 'Checklist salvo com sucesso.');
    } catch (error) {
      console.error('Error saving checklist:', error);

      // Handle 409 conflict
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert(
          'Conflito',
          'Este checklist foi modificado por outro usuario. Os dados serao recarregados.',
          [{ text: 'OK', onPress: () => {
            setIsLoading(true);
            fetchChecklists().finally(() => setIsLoading(false));
          }}],
        );
        return;
      }

      // Fallback to offline save on network error
      try {
        await offlineStorage.saveChecklists(serviceOrderId, checklists);
        await queueOfflineAction({
          type: 'checklist_update',
          endpoint: `/checklists/${checklistId}`,
          method: 'PUT',
          body: { items: checklist.items, version },
        });
        Alert.alert('Salvo localmente', 'O checklist sera sincronizado quando a conexao for restaurada.');
      } catch {
        Alert.alert('Erro', 'Nao foi possivel salvar o checklist.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const completeChecklist = async (checklistId: string) => {
    const checklist = checklists.find(cl => cl.id === checklistId);
    if (!checklist) return;

    const uncheckedItems = checklist.items.filter(item => !item.checked);
    if (uncheckedItems.length > 0) {
      Alert.alert(
        'Itens pendentes',
        `Ainda existem ${uncheckedItems.length} item(ns) nao marcados. Deseja completar mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Completar',
            onPress: () => doCompleteChecklist(checklistId),
          },
        ],
      );
      return;
    }

    doCompleteChecklist(checklistId);
  };

  const doCompleteChecklist = async (checklistId: string) => {
    const checklist = checklists.find(cl => cl.id === checklistId);
    if (!checklist) return;

    const version = versions[checklistId];

    try {
      setIsSaving(true);

      if (!isDeviceOnline()) {
        // Save locally and queue for sync
        const updatedChecklists = checklists.map(cl =>
          cl.id === checklistId
            ? { ...cl, completed_at: new Date().toISOString() }
            : cl,
        );
        setChecklists(updatedChecklists);
        await offlineStorage.saveChecklists(serviceOrderId, updatedChecklists);
        await queueOfflineAction({
          type: 'checklist_complete',
          endpoint: `/checklists/${checklistId}`,
          method: 'PUT',
          body: { items: checklist.items, completed: true, version },
        });
        Alert.alert(
          'Salvo localmente',
          'O checklist sera concluido no servidor quando a conexao for restaurada.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }

      await apiClient.put(`/checklists/${checklistId}`, {
        items: checklist.items,
        completed: true,
        version,
      });
      await offlineStorage.saveChecklists(serviceOrderId, checklists);
      Alert.alert('Sucesso', 'Checklist concluido com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error completing checklist:', error);

      // Handle 409 conflict
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert(
          'Conflito',
          'Este checklist foi modificado por outro usuario. Os dados serao recarregados.',
          [{ text: 'OK', onPress: () => {
            setIsLoading(true);
            fetchChecklists().finally(() => setIsLoading(false));
          }}],
        );
        return;
      }

      Alert.alert('Erro', 'Nao foi possivel concluir o checklist.');
    } finally {
      setIsSaving(false);
    }
  };

  const getProgress = (items: ChecklistItem[]) => {
    const checked = items.filter(i => i.checked).length;
    return { checked, total: items.length, percentage: items.length > 0 ? (checked / items.length) * 100 : 0 };
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (checklists.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Ionicons
            name="checkbox-outline"
            size={48}
            color={colors.textDark}
          />
          <Text style={styles.emptyTitle}>Nenhum checklist</Text>
          <Text style={styles.emptyMessage}>
            Nao ha checklists associados a esta OS.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <ScrollView style={styles.container}>
      <OfflineBanner />
      {checklists.map(checklist => {
        const progress = getProgress(checklist.items);

        return (
          <View key={checklist.id} style={styles.checklistCard}>
            <View style={styles.checklistHeader}>
              <Text style={styles.checklistTitle}>{checklist.title}</Text>
              {checklist.completed_at && (
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.success}
                  />
                  <Text style={styles.completedText}>Concluido</Text>
                </View>
              )}
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress.percentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {progress.checked}/{progress.total} itens
              </Text>
            </View>

            {/* Checklist Items */}
            <View style={styles.itemsList}>
              {checklist.items.map((item, index) => (
                <View key={item.id} style={styles.itemContainer}>
                  <TouchableOpacity
                    style={styles.itemRow}
                    onPress={() => toggleItem(checklist.id, item.id)}
                    activeOpacity={0.7}
                    disabled={!!checklist.completed_at}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        item.checked && styles.checkboxChecked,
                      ]}
                    >
                      {item.checked && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={colors.black}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.itemLabel,
                        item.checked && styles.itemLabelChecked,
                      ]}
                    >
                      {index + 1}. {item.label}
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggleNotes(item.id)}
                      style={styles.notesToggle}
                    >
                      <Ionicons
                        name={
                          expandedNotes[item.id]
                            ? 'chatbubble'
                            : 'chatbubble-outline'
                        }
                        size={16}
                        color={
                          item.notes
                            ? colors.primary
                            : colors.textDark
                        }
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {expandedNotes[item.id] && (
                    <TextInput
                      style={styles.notesInput}
                      value={item.notes || ''}
                      onChangeText={text =>
                        updateItemNotes(checklist.id, item.id, text)
                      }
                      placeholder="Adicionar observacao..."
                      placeholderTextColor={colors.textDark}
                      multiline
                      editable={!checklist.completed_at}
                    />
                  )}
                </View>
              ))}
            </View>

            {/* Actions */}
            {!checklist.completed_at && (
              <View style={styles.checklistActions}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => saveChecklist(checklist.id)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons
                        name="save-outline"
                        size={18}
                        color={colors.primary}
                      />
                      <Text style={styles.saveButtonText}>
                        Salvar Rascunho
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.completeButton}
                  onPress={() => completeChecklist(checklist.id)}
                  disabled={isSaving}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={colors.black}
                  />
                  <Text style={styles.completeButtonText}>
                    Concluir Checklist
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.bottomSpacer} />
    </ScrollView>
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
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 32,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
    marginTop: 16,
  },
  emptyMessage: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  checklistCard: {
    backgroundColor: colors.card,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  checklistTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  completedText: {
    ...typography.caption,
    color: colors.success,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  progressText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemsList: {
    gap: 2,
  },
  itemContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  itemLabel: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  itemLabelChecked: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  notesToggle: {
    padding: 4,
  },
  notesInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginLeft: 36,
    ...typography.caption,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  checklistActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveButtonText: {
    ...typography.buttonSm,
    color: colors.primary,
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  completeButtonText: {
    ...typography.buttonSm,
    color: colors.black,
  },
  bottomSpacer: {
    height: 32,
  },
});
