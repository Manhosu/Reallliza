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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { Photo, PauseLogEntry, formatDurationShort } from '../lib/types';
import { useStepExecutionsRealtime } from '../lib/hooks/useStepExecutionsRealtime';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type StepRouteProp = RouteProp<OsStackParamList, 'Steps'>;
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

interface StepExecution {
  id: string;
  service_order_id: string;
  template_id: string | null;
  template_item_id: string | null;
  step_key: string;
  order_index: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  photos_count: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  photo_initial_url?: string | null;
  photo_final_url?: string | null;
  occurrence_text?: string | null;
  // Migration 036 — pausa por etapa e lock por cura/secagem.
  paused_at?: string | null;
  pause_count?: number;
  total_pause_seconds?: number;
  pause_log?: PauseLogEntry[];
  unlocked_at?: string | null;
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

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${String(mm).padStart(2, '0')}min`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StepsScreen() {
  const route = useRoute<StepRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { serviceOrderId } = route.params;

  const [steps, setSteps] = useState<StepWithTemplate[]>([]);
  const [photosByStep, setPhotosByStep] = useState<Record<string, number>>({});
  const [thumbsByStep, setThumbsByStep] = useState<Record<string, Photo[]>>({});
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
        const fromMeta = (s.metadata || {}) as Record<string, unknown>;
        const fallback = STEP_LABELS[s.step_key] || {
          name: s.step_key,
          description: '',
          minPhotos: 0,
          needsNotes: false,
          needsSignature: false,
        };
        return {
          ...s,
          template: {
            name: (fromMeta.name as string) || fallback.name,
            description: (fromMeta.description as string) || fallback.description,
            requires_photos_min:
              (fromMeta.photos_required_min as number | undefined) ?? fallback.minPhotos,
            requires_notes: fallback.needsNotes,
            requires_signature: fallback.needsSignature,
          },
        };
      });
      setSteps(enriched);

      // Conta fotos por step E acumula até 4 thumbs por etapa.
      // Categorização pelo prefixo `[STEP_KEY]` na descrição (gravado pelo
      // CameraScreen quando navegamos com stepKey + pelo StepDetailScreen).
      const counts: Record<string, number> = {};
      const thumbs: Record<string, Photo[]> = {};
      enriched.forEach((s) => {
        counts[s.step_key] = 0;
        thumbs[s.step_key] = [];
      });
      photoData.forEach((p) => {
        const key = (p.description || '').match(/^\[(.*?)\]/)?.[1];
        if (key && counts[key] !== undefined) {
          counts[key]++;
          if (thumbs[key].length < 4) thumbs[key].push(p);
        }
      });
      setPhotosByStep(counts);
      setThumbsByStep(thumbs);

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

  // Realtime: refresca quando admin pausa/retoma OS de outro lugar (Jessica 18/06)
  useStepExecutionsRealtime({ osId: serviceOrderId, onChange: fetchData });

  // Tick para countdown de cura/secagem em etapas locked.
  // Roda apenas quando ha pelo menos uma etapa com unlocked_at futuro.
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const hasFutureWait = steps.some(
      (s) =>
        s.unlocked_at && new Date(s.unlocked_at).getTime() > Date.now()
    );
    if (!hasFutureWait) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      // Quando todos os countdowns expirarem, busca dados do servidor pra liberar
      const stillWaiting = steps.some(
        (s) => s.unlocked_at && new Date(s.unlocked_at).getTime() > now
      );
      if (!stillWaiting) {
        fetchData();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [steps, fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handlePause = async (step: StepWithTemplate) => {
    Alert.prompt(
      'Pausar etapa',
      'Motivo da pausa (opcional)',
      async (reason) => {
        try {
          setActingId(step.id);
          await apiClient.post(
            `/service-orders/${serviceOrderId}/steps/${step.id}/pause`,
            reason ? { reason } : {}
          );
          await fetchData();
        } catch (error: unknown) {
          const msg =
            error && typeof error === 'object' && 'message' in error
              ? (error as { message: string }).message
              : 'Erro ao pausar etapa';
          Alert.alert('Erro', msg);
        } finally {
          setActingId(null);
        }
      },
      'plain-text'
    );
  };

  const handleResume = async (step: StepWithTemplate) => {
    try {
      setActingId(step.id);
      await apiClient.post(
        `/service-orders/${serviceOrderId}/steps/${step.id}/resume`,
        {}
      );
      await fetchData();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao retomar etapa';
      Alert.alert('Erro', msg);
    } finally {
      setActingId(null);
    }
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
    // Vincula a foto à etapa via stepKey: a foto entra como
    // "[STEP_KEY] ..." e o contador da etapa enxerga automaticamente.
    navigation.navigate('Camera', {
      serviceOrderId,
      stepKey: step.step_key,
      stepTitle: step.template?.name || step.step_key,
    });
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
        // Lock sequencial: bloqueia qualquer etapa pending cuja anterior não esteja concluída.
        const isLockedBySequence =
          idx > 0 &&
          steps[idx - 1].status !== 'completed' &&
          step.status === 'pending';
        // Lock por cura/secagem (Jessica 18/06): etapa anterior concluiu mas
        // unlocked_at ainda no futuro -> ainda nao destrava.
        const unlockedAtMs = step.unlocked_at
          ? new Date(step.unlocked_at).getTime()
          : 0;
        const remainingMs = Math.max(0, unlockedAtMs - nowTick);
        const isLockedByWait =
          step.status === 'pending' && remainingMs > 0;
        const isLocked = isLockedBySequence || isLockedByWait;
        const isCompleted = step.status === 'completed';
        const isInProgress = step.status === 'in_progress';
        const isPausedNow = !!step.paused_at;
        const photosCount = photosByStep[step.step_key] ?? step.photos_count;
        const canComplete =
          isInProgress &&
          (!step.template || photosCount >= step.template.requires_photos_min);

        const openDetail = () => {
          if (isLocked) return;
          navigation.navigate('StepDetail', {
            serviceOrderId,
            stepId: step.id,
          });
        };

        return (
          <View
            key={step.id}
            style={[
              styles.stepCard,
              isCompleted && styles.stepCardCompleted,
              isLocked && styles.stepCardLocked,
            ]}
          >
            <TouchableOpacity
              disabled={isLocked}
              onPress={openDetail}
              activeOpacity={0.7}
              style={styles.stepHeader}
            >
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
              {!isLocked && (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>

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

                {/* Thumbs das fotos vinculadas à etapa
                    (Jessica 10/06 áudio 14:55: precisa mostrar as fotos,
                     não só o contador). */}
                {(thumbsByStep[step.step_key]?.length ?? 0) > 0 && (
                  <View style={styles.thumbsRow}>
                    {thumbsByStep[step.step_key].map((p) => (
                      <Image
                        key={p.id}
                        source={{ uri: p.thumbnail_url || p.url }}
                        style={styles.thumb}
                      />
                    ))}
                    {(photosByStep[step.step_key] ?? 0) >
                      (thumbsByStep[step.step_key]?.length ?? 0) && (
                      <View style={styles.thumbMore}>
                        <Text style={styles.thumbMoreText}>
                          +
                          {(photosByStep[step.step_key] ?? 0) -
                            (thumbsByStep[step.step_key]?.length ?? 0)}
                        </Text>
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

                {/* Badge de pausa — quando ha pause_count > 0 ou esta pausada agora. */}
                {isInProgress && (step.pause_count ?? 0) > 0 && (
                  <View
                    style={[
                      styles.pauseBadge,
                      isPausedNow && styles.pauseBadgeActive,
                    ]}
                  >
                    <Ionicons
                      name={isPausedNow ? 'pause-circle' : 'pause-outline'}
                      size={14}
                      color={isPausedNow ? colors.warning : colors.textMuted}
                    />
                    <Text style={styles.pauseBadgeText}>
                      {isPausedNow ? 'Pausada agora' : 'Etapa retomada'} ·{' '}
                      {step.pause_count}× pausa
                      {(step.pause_count ?? 0) === 1 ? '' : 's'} ·{' '}
                      {formatDurationShort(step.total_pause_seconds ?? 0)} total
                    </Text>
                  </View>
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

                        {/* Pausar/Retomar (Jessica 18/06): para servicos longos. */}
                        {isPausedNow ? (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnResume]}
                            onPress={() => handleResume(step)}
                            disabled={actingId === step.id}
                          >
                            {actingId === step.id ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.black}
                              />
                            ) : (
                              <>
                                <Ionicons
                                  name="play"
                                  size={16}
                                  color={colors.black}
                                />
                                <Text style={styles.actionBtnPrimaryText}>
                                  Retomar
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnPause]}
                            onPress={() => handlePause(step)}
                            disabled={actingId === step.id}
                          >
                            <Ionicons
                              name="pause"
                              size={16}
                              color={colors.text}
                            />
                            <Text style={styles.actionBtnSecondaryText}>
                              Pausar
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            canComplete && !isPausedNow
                              ? styles.actionBtnSuccess
                              : styles.actionBtnDisabled,
                          ]}
                          onPress={() => handleComplete(step)}
                          disabled={
                            !canComplete || isPausedNow || actingId === step.id
                          }
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

            {isLocked && isLockedByWait && (
              <View style={styles.lockedWaitBox}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={styles.lockedWaitText}>
                  Aguardando cura/secagem · libera em{' '}
                  <Text style={styles.lockedWaitTimer}>
                    {formatCountdown(remainingMs)}
                  </Text>
                </Text>
              </View>
            )}
            {isLocked && !isLockedByWait && (
              <Text style={styles.lockedText}>
                Conclua a etapa anterior primeiro.
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
  thumbsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 6,
    backgroundColor: colors.cardAlt,
  },
  thumbMore: {
    width: 58,
    height: 58,
    borderRadius: 6,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbMoreText: {
    ...typography.bodyBold,
    color: colors.textMuted,
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
  actionBtnPause: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  actionBtnResume: {
    backgroundColor: colors.warning,
  },
  pauseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginVertical: 4,
  },
  pauseBadgeActive: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  pauseBadgeText: {
    ...typography.caption,
    color: colors.text,
  },
  lockedWaitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderRadius: 8,
  },
  lockedWaitText: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  lockedWaitTimer: {
    fontWeight: '700',
    color: colors.primary,
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
