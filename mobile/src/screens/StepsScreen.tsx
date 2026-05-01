import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { Photo } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type StepRouteProp = RouteProp<OsStackParamList, 'Steps'>;
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

interface StepExecution {
  id: string;
  service_order_id: string;
  template_id: string;
  step_key: string;
  order_index: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  photos_count: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
}

interface StepWithTemplate extends StepExecution {
  template?: {
    name: string;
    description: string | null;
    requires_photos_min: number;
    requires_notes: boolean;
    requires_signature: boolean;
  };
}

const STEP_LABELS: Record<string, { name: string; description: string; minPhotos: number; needsNotes: boolean; needsSignature: boolean }> = {
  FOTO_INICIAL: {
    name: 'Foto Inicial',
    description: 'Registre fotos da situação encontrada antes de qualquer intervenção.',
    minPhotos: 2,
    needsNotes: true,
    needsSignature: false,
  },
  PREPARACAO: {
    name: 'Preparação',
    description: 'Foto da preparação do ambiente e checklist de pré-execução.',
    minPhotos: 1,
    needsNotes: false,
    needsSignature: false,
  },
  EXECUCAO: {
    name: 'Execução',
    description: 'Fotos durante a execução e observações técnicas.',
    minPhotos: 2,
    needsNotes: true,
    needsSignature: false,
  },
  VISTORIA: {
    name: 'Vistoria Técnica',
    description: 'Preencha os 7 itens do checklist de perícia (temperatura, condições, patologias).',
    minPhotos: 3,
    needsNotes: true,
    needsSignature: false,
  },
  EVIDENCIAS: {
    name: 'Evidências',
    description: 'Fotos das patologias e medições.',
    minPhotos: 3,
    needsNotes: true,
    needsSignature: false,
  },
  FINALIZACAO: {
    name: 'Finalização',
    description: 'Fotos do resultado final e assinatura do cliente.',
    minPhotos: 2,
    needsNotes: true,
    needsSignature: true,
  },
};

export function StepsScreen() {
  const route = useRoute<StepRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { serviceOrderId } = route.params;

  const [steps, setSteps] = useState<StepWithTemplate[]>([]);
  const [photosByStep, setPhotosByStep] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [metragem, setMetragem] = useState<string>('');
  const [intercorrencias, setIntercorrencias] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const [stepData, photoData] = await Promise.all([
        apiClient.get<StepExecution[]>(`/service-orders/${serviceOrderId}/steps`),
        apiClient.get<Photo[]>(`/service-orders/${serviceOrderId}/photos`),
      ]);

      const enriched = stepData.map((s) => {
        const meta = STEP_LABELS[s.step_key] || {
          name: s.step_key,
          description: '',
          minPhotos: 0,
          needsNotes: false,
          needsSignature: false,
        };
        return {
          ...s,
          template: {
            name: meta.name,
            description: meta.description,
            requires_photos_min: meta.minPhotos,
            requires_notes: meta.needsNotes,
            requires_signature: meta.needsSignature,
          },
        };
      });
      setSteps(enriched);

      // Conta fotos por step (categoriza por description ou metadata)
      const counts: Record<string, number> = {};
      enriched.forEach((s) => (counts[s.step_key] = 0));
      photoData.forEach((p) => {
        const key = (p.description || '').match(/^\[(.*?)\]/)?.[1];
        if (key && counts[key] !== undefined) counts[key]++;
      });
      setPhotosByStep(counts);

      // Hidrata notes
      const initialNotes: Record<string, string> = {};
      enriched.forEach((s) => {
        if (s.notes) initialNotes[s.id] = s.notes;
      });
      setNotes((prev) => ({ ...initialNotes, ...prev }));
    } catch (error) {
      console.error('Error loading steps:', error);
      Alert.alert('Erro', 'Não foi possível carregar as etapas.');
    }
  }, [serviceOrderId]);

  useEffect(() => {
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handleStart = async (step: StepWithTemplate) => {
    try {
      setActingId(step.id);
      await apiClient.post(`/service-orders/${serviceOrderId}/steps/${step.id}/start`);
      await fetchData();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao iniciar etapa';
      Alert.alert('Erro', msg);
    } finally {
      setActingId(null);
    }
  };

  const handleComplete = async (step: StepWithTemplate) => {
    const stepNotes = notes[step.id] ?? step.notes ?? '';
    const photosCount = photosByStep[step.step_key] ?? step.photos_count;

    if (step.template && photosCount < step.template.requires_photos_min) {
      Alert.alert(
        'Fotos insuficientes',
        `Esta etapa exige no mínimo ${step.template.requires_photos_min} foto(s). Você tem ${photosCount}.`,
      );
      return;
    }
    if (step.template?.requires_notes && stepNotes.trim().length === 0) {
      Alert.alert('Observações obrigatórias', 'Preencha as observações desta etapa.');
      return;
    }

    // Validações específicas da FINALIZACAO
    const isFinal = step.step_key === 'FINALIZACAO';
    if (isFinal) {
      const metragemNum = parseFloat(metragem.replace(',', '.'));
      if (!metragem || isNaN(metragemNum) || metragemNum <= 0) {
        Alert.alert(
          'Metragem obrigatória',
          'Informe a metragem executada (m²) antes de finalizar.',
        );
        return;
      }
    }

    try {
      setActingId(step.id);
      const payload: Record<string, unknown> = {
        notes: stepNotes,
        photos_count: photosCount,
      };
      if (isFinal) {
        payload.metragem_executada = parseFloat(metragem.replace(',', '.'));
        if (intercorrencias.trim()) payload.intercorrencias = intercorrencias.trim();
      }
      await apiClient.post(
        `/service-orders/${serviceOrderId}/steps/${step.id}/complete`,
        payload,
      );
      await fetchData();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao concluir etapa';
      Alert.alert('Erro', msg);
    } finally {
      setActingId(null);
    }
  };

  const handleAddPhotos = (step: StepWithTemplate) => {
    navigation.navigate('Camera', { serviceOrderId });
  };

  const handleSignature = () => {
    navigation.navigate('Signature', { serviceOrderId });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (steps.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textDark} />
          <Text style={styles.emptyTitle}>Sem etapas configuradas</Text>
          <Text style={styles.emptyText}>
            Esta OS não tem template de etapas associado. Contacte o operador.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.banner}>
        <Ionicons name="information-circle" size={18} color={colors.primary} />
        <Text style={styles.bannerText}>
          Conclua cada etapa em ordem. Você não pode pular etapas nem finalizar a OS sem todas concluídas.
        </Text>
      </View>

      {steps.map((step, idx) => {
        const isLocked = idx > 0 && steps[idx - 1].status !== 'completed' && step.status === 'pending';
        const isCompleted = step.status === 'completed';
        const isInProgress = step.status === 'in_progress';
        const photosCount = photosByStep[step.step_key] ?? step.photos_count;
        const canComplete =
          isInProgress &&
          (!step.template || photosCount >= step.template.requires_photos_min);

        return (
          <View
            key={step.id}
            style={[
              styles.stepCard,
              isCompleted && styles.stepCardCompleted,
              isLocked && styles.stepCardLocked,
            ]}
          >
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumber, isCompleted && styles.stepNumberDone]}>
                {isCompleted ? (
                  <Ionicons name="checkmark" size={18} color={colors.black} />
                ) : (
                  <Text style={styles.stepNumberText}>{step.order_index}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepName}>{step.template?.name ?? step.step_key}</Text>
                {step.template?.description && (
                  <Text style={styles.stepDescription}>{step.template.description}</Text>
                )}
              </View>
              {isLocked && <Ionicons name="lock-closed" size={16} color={colors.textDark} />}
            </View>

            {!isLocked && (
              <View style={styles.stepBody}>
                {/* Requisitos */}
                {step.template && (
                  <View style={styles.requirements}>
                    <View style={styles.reqRow}>
                      <Ionicons
                        name={
                          photosCount >= step.template.requires_photos_min
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={14}
                        color={
                          photosCount >= step.template.requires_photos_min
                            ? colors.success
                            : colors.textDark
                        }
                      />
                      <Text style={styles.reqText}>
                        {photosCount}/{step.template.requires_photos_min} foto(s)
                      </Text>
                    </View>
                    {step.template.requires_notes && (
                      <View style={styles.reqRow}>
                        <Ionicons
                          name={
                            (notes[step.id] || step.notes || '').length > 0
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={14}
                          color={
                            (notes[step.id] || step.notes || '').length > 0
                              ? colors.success
                              : colors.textDark
                          }
                        />
                        <Text style={styles.reqText}>Observações</Text>
                      </View>
                    )}
                    {step.template.requires_signature && (
                      <View style={styles.reqRow}>
                        <Ionicons name="ellipse-outline" size={14} color={colors.textDark} />
                        <Text style={styles.reqText}>Assinatura do cliente</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Notes input quando in_progress */}
                {isInProgress && step.template?.requires_notes && (
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Digite as observações desta etapa..."
                    placeholderTextColor={colors.textDark}
                    multiline
                    value={notes[step.id] ?? step.notes ?? ''}
                    onChangeText={(t) => setNotes((p) => ({ ...p, [step.id]: t }))}
                  />
                )}

                {/* FINALIZACAO: metragem + intercorrências */}
                {isInProgress && step.step_key === 'FINALIZACAO' && (
                  <View style={styles.finalFields}>
                    <View>
                      <Text style={styles.fieldLabel}>Metragem executada (m²) *</Text>
                      <TextInput
                        style={styles.numberInput}
                        placeholder="Ex: 24,5"
                        placeholderTextColor={colors.textDark}
                        keyboardType="decimal-pad"
                        value={metragem}
                        onChangeText={setMetragem}
                      />
                    </View>
                    <View>
                      <Text style={styles.fieldLabel}>Intercorrências (opcional)</Text>
                      <TextInput
                        style={styles.notesInput}
                        placeholder="Descreva qualquer imprevisto durante a execução..."
                        placeholderTextColor={colors.textDark}
                        multiline
                        value={intercorrencias}
                        onChangeText={setIntercorrencias}
                      />
                    </View>
                  </View>
                )}

                {isCompleted && step.notes && (
                  <View style={styles.completedNotes}>
                    <Text style={styles.completedNotesLabel}>Observações:</Text>
                    <Text style={styles.completedNotesText}>{step.notes}</Text>
                  </View>
                )}

                {isCompleted && step.completed_at && (
                  <Text style={styles.completedAt}>
                    Concluída em {format(new Date(step.completed_at), 'dd/MM HH:mm', { locale: ptBR })}
                  </Text>
                )}

                {/* Actions */}
                {!isCompleted && (
                  <View style={styles.actions}>
                    {step.status === 'pending' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
                        onPress={() => handleStart(step)}
                        disabled={actingId === step.id}
                      >
                        {actingId === step.id ? (
                          <ActivityIndicator size="small" color={colors.black} />
                        ) : (
                          <>
                            <Ionicons name="play" size={16} color={colors.black} />
                            <Text style={styles.actionBtnPrimaryText}>Iniciar etapa</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {isInProgress && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnSecondary]}
                          onPress={() => handleAddPhotos(step)}
                        >
                          <Ionicons name="camera" size={16} color={colors.text} />
                          <Text style={styles.actionBtnSecondaryText}>Fotos</Text>
                        </TouchableOpacity>

                        {step.template?.requires_signature && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnSecondary]}
                            onPress={handleSignature}
                          >
                            <Ionicons name="pencil" size={16} color={colors.text} />
                            <Text style={styles.actionBtnSecondaryText}>Assinar</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            canComplete ? styles.actionBtnSuccess : styles.actionBtnDisabled,
                          ]}
                          onPress={() => handleComplete(step)}
                          disabled={!canComplete || actingId === step.id}
                        >
                          {actingId === step.id ? (
                            <ActivityIndicator size="small" color={colors.black} />
                          ) : (
                            <>
                              <Ionicons name="checkmark" size={16} color={colors.black} />
                              <Text style={styles.actionBtnPrimaryText}>Concluir</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {isLocked && (
              <Text style={styles.lockedText}>
                Conclua a etapa anterior para desbloquear.
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
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
  banner: {
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary + '40',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  bannerText: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepCardCompleted: {
    borderColor: colors.success + '60',
    backgroundColor: colors.success + '08',
  },
  stepCardLocked: {
    opacity: 0.55,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberDone: {
    backgroundColor: colors.success,
  },
  stepNumberText: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  stepName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  stepDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  stepBody: {
    marginTop: 12,
    gap: 10,
  },
  requirements: {
    gap: 4,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reqText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  notesInput: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    minHeight: 70,
    textAlignVertical: 'top',
    ...typography.bodySm,
  },
  finalFields: {
    gap: 10,
    marginTop: 4,
  },
  fieldLabel: {
    ...typography.captionBold,
    color: colors.textMuted,
    marginBottom: 4,
  },
  numberInput: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    ...typography.bodySm,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnPrimaryText: {
    ...typography.buttonSm,
    color: colors.black,
  },
  actionBtnSecondary: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnSecondaryText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  actionBtnSuccess: {
    backgroundColor: colors.success,
  },
  actionBtnDisabled: {
    backgroundColor: colors.border,
  },
  completedNotes: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
  },
  completedNotesLabel: {
    ...typography.captionBold,
    color: colors.textDark,
    marginBottom: 2,
  },
  completedNotesText: {
    ...typography.bodySm,
    color: colors.text,
  },
  completedAt: {
    ...typography.caption,
    color: colors.success,
  },
  lockedText: {
    ...typography.caption,
    color: colors.textDark,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
