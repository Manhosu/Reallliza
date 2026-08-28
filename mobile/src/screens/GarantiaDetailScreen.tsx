import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { GarantiasStackParamList } from '../navigation/garantias-stack';

/**
 * Tela de gestão da garantia pelo homologado (Jose 27/08).
 *
 * Mapeia o fluxo pedido (receber → ver motivo/fotos → aceitar → andamento
 * → registrar solução → anexar provas → finalizar) nos 4 status que a API
 * já tem — `open → in_progress → resolved|rejected` — sem estado novo:
 * "Aceitar" já é o accept + início do andamento; a nota e as fotos vão se
 * acumulando enquanto `in_progress`; "Finalizar" é o que fecha pra
 * `resolved`.
 */

type WarrantyStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';

interface WarrantyMedia {
  url: string;
  thumbnail_url?: string | null;
}

interface WarrantyDetail {
  id: string;
  status: WarrantyStatus;
  description: string;
  notes: string | null;
  photos: WarrantyMedia[];
  videos: WarrantyMedia[];
  resolution_notes: string | null;
  resolution_photos: WarrantyMedia[];
  opened_at: string;
  service_order?: {
    order_number: number | null;
    title: string | null;
    client_name: string | null;
    completed_at: string | null;
  } | null;
}

const STATUS_LABELS: Record<WarrantyStatus, string> = {
  open: 'Aberta',
  in_progress: 'Em análise',
  resolved: 'Resolvida',
  rejected: 'Recusada',
};

type DetailRoute = RouteProp<GarantiasStackParamList, 'GarantiaDetail'>;

export function GarantiaDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<any>();
  const { warrantyId } = route.params;

  const [warranty, setWarranty] = useState<WarrantyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchWarranty = useCallback(async () => {
    try {
      const data = await apiClient.get<WarrantyDetail>(`/warranties/${warrantyId}`);
      setWarranty(data);
      setResolutionNotes(data.resolution_notes ?? '');
    } catch (error) {
      console.error('Error fetching warranty:', error);
      Alert.alert('Erro', 'Não foi possível carregar a garantia.');
    }
  }, [warrantyId]);

  useEffect(() => {
    setIsLoading(true);
    fetchWarranty().finally(() => setIsLoading(false));
  }, [fetchWarranty]);

  async function aceitar() {
    setSaving(true);
    try {
      await apiClient.patch(`/warranties/${warrantyId}`, { status: 'in_progress' });
      await fetchWarranty();
    } catch {
      Alert.alert('Erro', 'Não foi possível aceitar a garantia.');
    } finally {
      setSaving(false);
    }
  }

  async function anexarFoto(origem: 'camera' | 'galeria') {
    try {
      const permissao =
        origem === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissao.status !== 'granted') {
        Alert.alert('Permissão necessária', 'O app precisa de acesso pra anexar a foto.');
        return;
      }
      const result =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const filename = asset.uri.split('/').pop() || 'foto.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      setUploadingPhoto(true);
      await apiClient.upload(
        `/warranties/${warrantyId}/resolution-photos`,
        { uri: asset.uri, type, name: filename },
        {}
      );
      await fetchWarranty();
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a foto.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function finalizar() {
    if (!resolutionNotes.trim()) {
      Alert.alert('Descreva a solução', 'Conte o que foi feito pra resolver antes de finalizar.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(`/warranties/${warrantyId}`, {
        status: 'resolved',
        resolution_notes: resolutionNotes.trim(),
      });
      await fetchWarranty();
      Alert.alert('Garantia finalizada', 'A loja foi notificada.');
    } catch {
      Alert.alert('Erro', 'Não foi possível finalizar a garantia.');
    } finally {
      setSaving(false);
    }
  }

  function recusar() {
    Alert.alert(
      'Recusar garantia',
      'Escreva o motivo no campo de observação antes de recusar.',
      resolutionNotes.trim()
        ? [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Recusar',
              style: 'destructive',
              onPress: async () => {
                setSaving(true);
                try {
                  await apiClient.patch(`/warranties/${warrantyId}`, {
                    status: 'rejected',
                    resolution_notes: resolutionNotes.trim(),
                  });
                  await fetchWarranty();
                } catch {
                  Alert.alert('Erro', 'Não foi possível recusar a garantia.');
                } finally {
                  setSaving(false);
                }
              },
            },
          ]
        : [{ text: 'OK' }]
    );
  }

  if (isLoading || !warranty) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isFinal = warranty.status === 'resolved' || warranty.status === 'rejected';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.osTitle}>
            OS #{warranty.service_order?.order_number ?? '—'} —{' '}
            {warranty.service_order?.title ?? ''}
          </Text>
          <Text style={styles.statusBadge}>{STATUS_LABELS[warranty.status]}</Text>
        </View>
        {warranty.service_order?.client_name && (
          <Text style={styles.metaText}>Cliente: {warranty.service_order.client_name}</Text>
        )}
        {warranty.service_order?.completed_at && (
          <Text style={styles.metaText}>
            Concluída em{' '}
            {format(new Date(warranty.service_order.completed_at), 'dd/MM/yyyy', {
              locale: ptBR,
            })}
          </Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Problema relatado pela loja</Text>
          <Text style={styles.bodyText}>{warranty.description}</Text>
          {warranty.notes && (
            <Text style={styles.notesText}>Observações: {warranty.notes}</Text>
          )}
        </View>

        {(warranty.photos.length > 0 || warranty.videos.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotos/vídeos do problema</Text>
            <View style={styles.mediaRow}>
              {warranty.photos.map((p, i) => (
                <TouchableOpacity key={`p-${i}`} onPress={() => Linking.openURL(p.url)}>
                  <Image source={{ uri: p.thumbnail_url || p.url }} style={styles.thumb} />
                </TouchableOpacity>
              ))}
              {warranty.videos.map((v, i) => (
                <TouchableOpacity
                  key={`v-${i}`}
                  style={[styles.thumb, styles.videoThumb]}
                  onPress={() => Linking.openURL(v.url)}
                >
                  <Ionicons name="play-circle-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {warranty.status === 'open' && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={aceitar}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.primaryButtonText}>Aceitar garantia</Text>
            )}
          </TouchableOpacity>
        )}

        {(warranty.status === 'in_progress' || isFinal) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isFinal ? 'Solução registrada' : 'Solução / motivo da recusa'}
            </Text>
            {isFinal ? (
              <Text style={styles.bodyText}>{warranty.resolution_notes || '—'}</Text>
            ) : (
              <TextInput
                style={styles.textArea}
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                placeholder="Descreva o que foi feito pra resolver..."
                placeholderTextColor={colors.textDark}
                multiline
              />
            )}

            <View style={styles.mediaRow}>
              {warranty.resolution_photos.map((p, i) => (
                <TouchableOpacity key={`rp-${i}`} onPress={() => Linking.openURL(p.url)}>
                  <Image source={{ uri: p.thumbnail_url || p.url }} style={styles.thumb} />
                </TouchableOpacity>
              ))}
              {!isFinal && (
                <>
                  <TouchableOpacity
                    style={styles.addPhotoButton}
                    onPress={() => anexarFoto('camera')}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="camera-outline" size={22} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addPhotoButton}
                    onPress={() => anexarFoto('galeria')}
                    disabled={uploadingPhoto}
                  >
                    <Ionicons name="images-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {warranty.status === 'in_progress' && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={recusar}
                  disabled={saving}
                >
                  <Text style={styles.rejectButtonText}>Recusar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1 }]}
                  onPress={finalizar}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.black} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Finalizar garantia</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  osTitle: { ...typography.bodyBold, color: colors.text, flex: 1 },
  statusBadge: {
    ...typography.captionBold,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaText: { ...typography.bodySm, color: colors.textMuted },
  section: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  sectionTitle: { ...typography.bodySmBold, color: colors.textMuted },
  bodyText: { ...typography.bodySm, color: colors.text, lineHeight: 20 },
  notesText: { ...typography.bodySm, color: colors.textMuted, fontStyle: 'italic' },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  videoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  addPhotoButton: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    ...typography.bodySm,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryButtonText: { ...typography.button, color: colors.black },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: { ...typography.button, color: colors.danger },
});
