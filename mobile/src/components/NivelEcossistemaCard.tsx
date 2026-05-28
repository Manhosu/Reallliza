import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const NIVEL_INFO: Record<string, { label: string; cor: string }> = {
  bronze: { label: 'Bronze', cor: '#CD7F32' },
  prata: { label: 'Prata', cor: '#A8A8B3' },
  ouro: { label: 'Ouro', cor: '#FFD600' },
};

/**
 * Card do perfil profissional no ecossistema (Marco 6): foto, nível
 * Bronze/Prata/Ouro, score geral e os 3 scores (Sistema, Cliente,
 * Qualidade) + especialidades. Dados vêm da Reallliza Execução
 * (perfil do usuário logado).
 */
export function NivelEcossistemaCard() {
  const { profile, fetchProfile } = useAuthStore();
  const [uploadingFoto, setUploadingFoto] = useState(false);

  if (!profile) return null;

  const nivel = NIVEL_INFO[profile.level ?? 'bronze'] ?? NIVEL_INFO.bronze;
  const fmt = (v: number | null | undefined) =>
    typeof v === 'number' ? String(Math.round(v)) : '—';

  async function capturarFoto(origem: 'camera' | 'galeria') {
    try {
      let res: ImagePicker.ImagePickerResult;
      if (origem === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Autorize o uso da câmera.');
          return;
        }
        res = await ImagePicker.launchCameraAsync({
          quality: 0.6,
          allowsEditing: true,
          aspect: [1, 1],
        });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({
          quality: 0.6,
          allowsEditing: true,
          aspect: [1, 1],
        });
      }
      if (res.canceled || !res.assets?.[0]) return;

      const a = res.assets[0];
      setUploadingFoto(true);
      await apiClient.upload<{ avatar_url: string }>('/profile/me/avatar', {
        uri: a.uri,
        name: a.fileName ?? `foto_${Date.now()}.jpg`,
        type: a.mimeType ?? 'image/jpeg',
      });
      await fetchProfile();
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a foto de perfil.');
    } finally {
      setUploadingFoto(false);
    }
  }

  function escolherFoto() {
    Alert.alert('Foto de perfil', 'Escolha a origem da imagem', [
      { text: 'Tirar foto', onPress: () => capturarFoto('camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.card}>
      {/* Foto de perfil */}
      <View style={styles.avatarWrap}>
        <TouchableOpacity
          onPress={escolherFoto}
          disabled={uploadingFoto}
          activeOpacity={0.8}
        >
          <View style={styles.avatarCircle}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImg}
              />
            ) : (
              <Ionicons name="person" size={34} color={colors.textMuted} />
            )}
            {uploadingFoto && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </View>
          <View style={styles.camBadge}>
            <Ionicons name="camera" size={13} color={colors.black} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Nível + score geral */}
      <View style={styles.nivelRow}>
        <View style={[styles.nivelBadge, { backgroundColor: nivel.cor + '22' }]}>
          <Ionicons name="ribbon" size={18} color={nivel.cor} />
          <Text style={[styles.nivelText, { color: nivel.cor }]}>
            Nível {nivel.label}
          </Text>
        </View>
        <View style={styles.overallBox}>
          <Text style={styles.overallValue}>{fmt(profile.overall_score)}</Text>
          <Text style={styles.overallLabel}>score geral</Text>
        </View>
      </View>

      {/* Desempenho — estrelas por especialidade (fallback: 3 scores antigos) */}
      {profile.specialty_ratings && profile.specialty_ratings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Desempenho</Text>
          <View style={styles.specialtyList}>
            {profile.specialty_ratings.map((r, i) => (
              <SpecialtyStarsRow key={`${r.name}-${i}`} name={r.name} stars={r.stars} />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.scoresRow}>
          <ScoreCell label="Sistema" value={fmt(profile.system_score)} />
          <ScoreCell label="Cliente" value={fmt(profile.client_score)} />
          <ScoreCell label="Qualidade" value={fmt(profile.quality_score)} />
        </View>
      )}

      {/* Lista de especialidades em chips — só mostra se NÃO houver estrelas
          (com estrelas, o nome já aparece na lista acima e duplicaria). */}
      {(!profile.specialty_ratings || profile.specialty_ratings.length === 0) &&
        profile.specialties &&
        profile.specialties.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Especialidades</Text>
            <View style={styles.chips}>
              {profile.specialties.map((e, i) => (
                <View key={`${e}-${i}`} style={styles.chip}>
                  <Text style={styles.chipText}>{e}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
    </View>
  );
}

function SpecialtyStarsRow({ name, stars }: { name: string; stars: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(stars || 0)));
  return (
    <View style={styles.specialtyRow}>
      <Text style={styles.specialtyName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Ionicons
            key={n}
            name={n <= clamped ? 'star' : 'star-outline'}
            size={16}
            color={n <= clamped ? '#FFD600' : colors.textMuted}
            style={{ marginLeft: 2 }}
          />
        ))}
      </View>
    </View>
  );
}

function ScoreCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.scoreCell}>
      <Text style={styles.scoreValue}>{value}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  nivelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nivelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  nivelText: { ...typography.button, fontSize: 13 },
  overallBox: { alignItems: 'flex-end' },
  overallValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  overallLabel: { ...typography.caption, color: colors.textMuted },
  scoresRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  scoreCell: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scoreValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  scoreLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  section: { marginTop: 14 },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.primary + '15',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { ...typography.caption, color: colors.primary },
  specialtyList: { gap: 8 },
  specialtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  specialtyName: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
});
