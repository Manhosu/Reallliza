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
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient, isDeviceOnline, queueOfflineAction } from '../lib/api';
import { PauseLogEntry, formatDurationShort } from '../lib/types';
import { useStepExecutionsRealtime } from '../lib/hooks/useStepExecutionsRealtime';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type RouteProps = RouteProp<OsStackParamList, 'StepDetail'>;
type Nav = NativeStackNavigationProp<OsStackParamList, 'StepDetail'>;

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
  // Migration 036
  paused_at?: string | null;
  pause_count?: number;
  total_pause_seconds?: number;
  pause_log?: PauseLogEntry[];
  unlocked_at?: string | null;
}

interface Coords {
  latitude: number;
  longitude: number;
}

async function captureImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permissão necessária',
      'O app precisa de acesso à câmera para registrar a foto.',
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

async function captureLocation(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Faz upload de uma foto vinculada à OS, retornando a URL pública (se online)
 * ou enfileirando para sync posterior. O backend categoriza por descrição
 * ("[STEP_KEY]" prefixo) — ver StepsScreen / fetchData.
 */
async function uploadStepPhoto(
  serviceOrderId: string,
  uri: string,
  stepKey: string,
  kind: 'initial' | 'final',
  coords: Coords | null,
): Promise<{ url: string | null; queued: boolean }> {
  const filename = uri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  const fields: Record<string, string> = {
    type: kind === 'initial' ? 'before' : 'after',
    description: `[${stepKey}] ${kind === 'initial' ? 'Foto inicial' : 'Foto final'}`,
  };
  if (coords) {
    fields.geo_lat = String(coords.latitude);
    fields.geo_lng = String(coords.longitude);
  }

  if (!isDeviceOnline()) {
    await queueOfflineAction({
      type: 'photo_upload',
      endpoint: `/service-orders/${serviceOrderId}/photos`,
      method: 'POST',
      fileUri: uri,
      fileFields: fields,
      fileName: filename,
      fileType: type,
    });
    return { url: null, queued: true };
  }

  try {
    const res = await apiClient.upload<{ url: string }>(
      `/service-orders/${serviceOrderId}/photos`,
      { uri, type, name: filename },
      fields,
    );
    return { url: res?.url || null, queued: false };
  } catch {
    // fallback: enfileira
    await queueOfflineAction({
      type: 'photo_upload',
      endpoint: `/service-orders/${serviceOrderId}/photos`,
      method: 'POST',
      fileUri: uri,
      fileFields: fields,
      fileName: filename,
      fileType: type,
    });
    return { url: null, queued: true };
  }
}

export function StepDetailScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<Nav>();
  const { serviceOrderId, stepId } = route.params;

  const [step, setStep] = useState<StepExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [occurrence, setOccurrence] = useState('');

  const fetchStep = useCallback(async () => {
    try {
      const all = await apiClient.get<StepExecution[]>(
        `/service-orders/${serviceOrderId}/steps`,
      );
      const found = all.find((s) => s.id === stepId) ?? null;
      setStep(found);
      if (found?.occurrence_text) setOccurrence(found.occurrence_text);
    } catch (err) {
      console.error('Error loading step detail:', err);
      Alert.alert('Erro', 'Não foi possível carregar a etapa.');
    }
  }, [serviceOrderId, stepId]);

  useEffect(() => {
    setIsLoading(true);
    fetchStep().finally(() => setIsLoading(false));
  }, [fetchStep]);

  // Refresh em tempo real (Jessica 18/06): admin pode pausar/retomar via web
  useStepExecutionsRealtime({ osId: serviceOrderId, onChange: fetchStep });

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchStep();
    setIsRefreshing(false);
  };

  const handlePause = async () => {
    if (!step) return;
    Alert.prompt(
      'Pausar etapa',
      'Por que você está pausando? (opcional)',
      async (reason) => {
        setIsActing(true);
        try {
          await apiClient.post(
            `/service-orders/${serviceOrderId}/steps/${step.id}/pause`,
            reason ? { reason } : {},
          );
          await fetchStep();
        } catch (err: unknown) {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? (err as { message: string }).message
              : 'Não foi possível pausar a etapa.';
          Alert.alert('Erro', msg);
        } finally {
          setIsActing(false);
        }
      },
      'plain-text',
    );
  };

  const handleResume = async () => {
    if (!step) return;
    setIsActing(true);
    try {
      await apiClient.post(
        `/service-orders/${serviceOrderId}/steps/${step.id}/resume`,
        {},
      );
      await fetchStep();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Não foi possível retomar a etapa.';
      Alert.alert('Erro', msg);
    } finally {
      setIsActing(false);
    }
  };

  const meta = (step?.metadata || {}) as Record<string, unknown>;
  const stepName = (meta.name as string) || step?.step_key || 'Etapa';
  const stepDescription = (meta.description as string) || '';
  const photosInitialMin = (meta.photos_required_min as number) ?? 1;
  const photosFinalMin = (meta.final_photos_required_min as number) ?? 1;
  const occurrenceEnabled = (meta.occurrence_enabled as boolean) ?? true;

  const handleStart = async () => {
    if (!step) return;
    if (photosInitialMin > 0) {
      Alert.alert(
        'Foto inicial',
        `Tire ${photosInitialMin === 1 ? 'a foto' : `${photosInitialMin} fotos`} de início agora. Sem ela a etapa não inicia.`,
      );
    }
    setIsActing(true);
    try {
      let photoUrl: string | null = null;
      if (photosInitialMin > 0) {
        const uri = await captureImage();
        if (!uri) {
          setIsActing(false);
          return;
        }
        const coords = await captureLocation();
        const up = await uploadStepPhoto(
          serviceOrderId,
          uri,
          step.step_key,
          'initial',
          coords,
        );
        photoUrl = up.url;

        // Inicia a etapa: chama endpoint backend /start.
        // Se offline, enfileira.
        if (!isDeviceOnline()) {
          await queueOfflineAction({
            type: 'status_change',
            endpoint: `/service-orders/${serviceOrderId}/steps/${step.id}/start`,
            method: 'POST',
            body: {
              photo_initial_url: photoUrl,
              started_lat: coords?.latitude,
              started_lng: coords?.longitude,
            },
          });
          Alert.alert(
            'Sem conexão',
            'A etapa será iniciada quando a conexão voltar.',
          );
          navigation.goBack();
          return;
        }

        await apiClient.post(
          `/service-orders/${serviceOrderId}/steps/${step.id}/start`,
          {
            photo_initial_url: photoUrl,
            started_lat: coords?.latitude,
            started_lng: coords?.longitude,
          },
        );
      } else {
        await apiClient.post(
          `/service-orders/${serviceOrderId}/steps/${step.id}/start`,
        );
      }
      await fetchStep();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao iniciar etapa';
      Alert.alert('Erro', msg);
    } finally {
      setIsActing(false);
    }
  };

  const handleComplete = async () => {
    if (!step) return;
    setIsActing(true);
    try {
      let photoUrl: string | null = null;
      if (photosFinalMin > 0) {
        const uri = await captureImage();
        if (!uri) {
          setIsActing(false);
          return;
        }
        const coords = await captureLocation();
        const up = await uploadStepPhoto(
          serviceOrderId,
          uri,
          step.step_key,
          'final',
          coords,
        );
        photoUrl = up.url;

        const payload: Record<string, unknown> = {
          photos_count: (step.photos_count || 0) + 1,
          photo_final_url: photoUrl,
          completed_lat: coords?.latitude,
          completed_lng: coords?.longitude,
        };
        if (occurrenceEnabled && occurrence.trim()) {
          payload.occurrence_text = occurrence.trim();
          payload.notes = occurrence.trim();
        }

        if (!isDeviceOnline()) {
          await queueOfflineAction({
            type: 'status_change',
            endpoint: `/service-orders/${serviceOrderId}/steps/${step.id}/complete`,
            method: 'POST',
            body: payload,
          });
          Alert.alert(
            'Sem conexão',
            'A etapa será concluída quando a conexão voltar.',
          );
          navigation.goBack();
          return;
        }

        await apiClient.post(
          `/service-orders/${serviceOrderId}/steps/${step.id}/complete`,
          payload,
        );
      } else {
        await apiClient.post(
          `/service-orders/${serviceOrderId}/steps/${step.id}/complete`,
          occurrenceEnabled && occurrence.trim()
            ? { occurrence_text: occurrence.trim(), notes: occurrence.trim() }
            : {},
        );
      }
      await fetchStep();
      Alert.alert('Sucesso', 'Etapa concluída.');
      navigation.goBack();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao concluir etapa';
      Alert.alert('Erro', msg);
    } finally {
      setIsActing(false);
    }
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

  if (!step) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textDark} />
          <Text style={styles.emptyText}>Etapa não encontrada.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPending = step.status === 'pending';
  const isInProgress = step.status === 'in_progress';
  const isCompleted = step.status === 'completed';

  const totalDurationMs =
    step.completed_at && step.started_at
      ? new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusBadge,
              isCompleted && { backgroundColor: colors.success + '22' },
              isInProgress && { backgroundColor: colors.warning + '22' },
              isPending && { backgroundColor: colors.cardAlt },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isCompleted && { color: colors.success },
                isInProgress && { color: colors.warning },
              ]}
            >
              {isCompleted
                ? 'Concluída'
                : isInProgress
                  ? 'Em andamento'
                  : 'Pendente'}
            </Text>
          </View>
          <Text style={styles.stepIndex}>Etapa {step.order_index}</Text>
        </View>
        <Text style={styles.stepName}>{stepName}</Text>
        {!!stepDescription && (
          <Text style={styles.stepDescription}>{stepDescription}</Text>
        )}
      </View>

      {isInProgress && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.sectionRowText}>
              Iniciada{' '}
              {step.started_at
                ? format(new Date(step.started_at), "dd/MM 'às' HH:mm", {
                    locale: ptBR,
                  })
                : ''}
            </Text>
          </View>
          {!!step.photo_initial_url && (
            <Image
              source={{ uri: step.photo_initial_url }}
              style={styles.photo}
              resizeMode="cover"
            />
          )}
        </View>
      )}

      {isCompleted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          {!!step.photo_initial_url && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.smallLabel}>Foto inicial</Text>
              <Image
                source={{ uri: step.photo_initial_url }}
                style={styles.photo}
                resizeMode="cover"
              />
            </View>
          )}
          {!!step.photo_final_url && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.smallLabel}>Foto final</Text>
              <Image
                source={{ uri: step.photo_final_url }}
                style={styles.photo}
                resizeMode="cover"
              />
            </View>
          )}
          {totalDurationMs != null && (
            <View style={styles.sectionRow}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.sectionRowText}>
                Duração: {Math.round(totalDurationMs / 60000)} min
              </Text>
            </View>
          )}
          {!!step.occurrence_text && (
            <View style={styles.completedBox}>
              <Text style={styles.smallLabel}>Ocorrência</Text>
              <Text style={styles.completedText}>{step.occurrence_text}</Text>
            </View>
          )}
        </View>
      )}

      {isInProgress && occurrenceEnabled && (
        <View style={styles.section}>
          <Text style={styles.smallLabel}>Ocorrência (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Algum imprevisto ou observação?"
            placeholderTextColor={colors.textDark}
            multiline
            value={occurrence}
            onChangeText={setOccurrence}
          />
        </View>
      )}

      {isPending && (
        <TouchableOpacity
          style={[styles.cta, isActing && styles.ctaDisabled]}
          onPress={handleStart}
          disabled={isActing}
        >
          {isActing ? (
            <ActivityIndicator size="small" color={colors.black} />
          ) : (
            <>
              <Ionicons name="play" size={18} color={colors.black} />
              <Text style={styles.ctaText}>Iniciar etapa</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Historico de pausas (Jessica 18/06): exibe quando ja houve pelo
          menos uma pausa nesta etapa, mesmo durante execucao. */}
      {(step.pause_count ?? 0) > 0 && (step.pause_log?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Histórico de pausas</Text>
          <View style={styles.pauseSummary}>
            <Text style={styles.pauseSummaryText}>
              {step.pause_count}× pausa{(step.pause_count ?? 0) === 1 ? '' : 's'} ·{' '}
              {formatDurationShort(step.total_pause_seconds ?? 0)} total
            </Text>
          </View>
          {(step.pause_log ?? []).map((p, i) => (
            <View key={i} style={styles.pauseLogRow}>
              <Ionicons name="pause-outline" size={14} color={colors.warning} />
              <Text style={styles.pauseLogText}>
                {format(new Date(p.paused_at), 'dd/MM HH:mm', { locale: ptBR })}
                {' → '}
                {format(new Date(p.resumed_at), 'HH:mm', { locale: ptBR })}
                {'  ('}
                {formatDurationShort(p.duration_seconds)}
                {')'}
                {p.reason ? ` — ${p.reason}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Pausar/Retomar — botoes acima do Finalizar pra reforcar acao secundaria */}
      {isInProgress && step.paused_at && (
        <View style={styles.pausedBanner}>
          <Ionicons name="pause-circle" size={20} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pausedBannerTitle}>Etapa pausada</Text>
            <Text style={styles.pausedBannerSub}>
              Pausada{' '}
              {format(new Date(step.paused_at), "dd/MM 'às' HH:mm", {
                locale: ptBR,
              })}
              . Toque em Retomar para continuar.
            </Text>
          </View>
        </View>
      )}

      {isInProgress && (
        <View style={styles.actionsRow}>
          {step.paused_at ? (
            <TouchableOpacity
              style={[styles.ctaSecondary, isActing && styles.ctaDisabled]}
              onPress={handleResume}
              disabled={isActing}
            >
              {isActing ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <>
                  <Ionicons name="play" size={18} color={colors.black} />
                  <Text style={styles.ctaText}>Retomar</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaPause, isActing && styles.ctaDisabled]}
              onPress={handlePause}
              disabled={isActing}
            >
              <Ionicons name="pause" size={18} color={colors.text} />
              <Text style={styles.ctaPauseText}>Pausar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.cta,
              styles.ctaFlex,
              (isActing || !!step.paused_at) && styles.ctaDisabled,
            ]}
            onPress={handleComplete}
            disabled={isActing || !!step.paused_at}
          >
            {isActing ? (
              <ActivityIndicator size="small" color={colors.black} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={colors.black} />
                <Text style={styles.ctaText}>Finalizar etapa</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyText: { ...typography.bodySm, color: colors.textMuted },
  header: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    ...typography.captionBold,
    color: colors.textMuted,
  },
  stepIndex: { ...typography.caption, color: colors.textMuted },
  stepName: { ...typography.h4, color: colors.text },
  stepDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  sectionTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionRowText: { ...typography.bodySm, color: colors.textMuted },
  smallLabel: { ...typography.captionBold, color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    ...typography.bodySm,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
  },
  completedBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  completedText: { ...typography.bodySm, color: colors.text },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  ctaFlex: { flex: 1 },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.button, color: colors.black },
  ctaPause: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  ctaPauseText: { ...typography.button, color: colors.text },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.warning,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  pausedBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  pausedBannerTitle: { ...typography.buttonSm, color: colors.text },
  pausedBannerSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  pauseSummary: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pauseSummaryText: { ...typography.captionBold, color: colors.text },
  pauseLogRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 3,
  },
  pauseLogText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
});
