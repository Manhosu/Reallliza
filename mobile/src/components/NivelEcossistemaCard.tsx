import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
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

const SCORE_LABEL = (score: number | null | undefined): string => {
  if (typeof score !== 'number') return '';
  if (score >= 90) return 'Excelente';
  if (score >= 75) return 'Muito bom';
  if (score >= 60) return 'Bom';
  if (score >= 40) return 'Regular';
  return 'Em formação';
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  technician: 'Técnico Instalador',
  partner: 'Parceiro',
};

/**
 * Card do perfil profissional no ecossistema (rev 01/06/2026).
 *
 * Conforme referência visual enviada pela Jessica: cabeçalho com foto+nível+
 * score geral, 3 cards de Avaliações Gerais (Sistema/Cliente/Qualidade),
 * lista de Especialidades com nota decimal, Relacionamento com cliente,
 * Estatísticas (5 métricas) — Dados pessoais e Alterar senha ficam no
 * ProfileScreen (este componente termina antes).
 */
export function NivelEcossistemaCard() {
  const { profile, fetchProfile } = useAuthStore();
  const [uploadingFoto, setUploadingFoto] = useState(false);

  if (!profile) return null;

  const nivel = NIVEL_INFO[profile.level ?? 'bronze'] ?? NIVEL_INFO.bronze;
  const overall = profile.overall_score;
  const overallLabel = SCORE_LABEL(overall);
  const fmtInt = (v: number | null | undefined) =>
    typeof v === 'number' ? String(Math.round(v)) : '—';
  const fmtDec = (v: number | null | undefined, fixed = 1) =>
    typeof v === 'number'
      ? v.toFixed(fixed).replace('.', ',')
      : '—';

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

  // specialty_ratings_enriched (novo, com nota decimal e ordem) tem
  // preferência sobre specialty_ratings (legado, sem ordem).
  const specs = profile.specialty_ratings_enriched ?? null;
  const specsLegacy = profile.specialty_ratings ?? null;
  const hasSpecs = (specs && specs.length > 0) || (specsLegacy && specsLegacy.length > 0);

  return (
    <View style={styles.card}>
      {/* ============ Header ============ */}
      <View style={styles.headerRow}>
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
              <Ionicons name="person" size={30} color={colors.textMuted} />
            )}
            {uploadingFoto && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            <View style={styles.camBadge}>
              <Ionicons name="camera" size={11} color={colors.black} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {profile.full_name}
          </Text>
          <Text style={styles.headerEmail} numberOfLines={1}>
            {profile.email}
          </Text>
          {ROLE_LABEL[profile.role] && (
            <Text style={styles.headerRole} numberOfLines={1}>
              {ROLE_LABEL[profile.role]}
            </Text>
          )}
          <View style={[styles.nivelBadge, { backgroundColor: nivel.cor + '22' }]}>
            <Ionicons name="ribbon" size={14} color={nivel.cor} />
            <Text style={[styles.nivelText, { color: nivel.cor }]}>
              Nível {nivel.label}
            </Text>
          </View>
        </View>

        <View style={styles.overallBox}>
          <Text style={styles.overallLabel}>Score Geral</Text>
          <Text style={styles.overallValue}>{fmtInt(overall)}</Text>
          {overallLabel && (
            <View style={styles.overallChip}>
              <Text style={styles.overallChipText}>{overallLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ============ Avaliações Gerais ============ */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Avaliações Gerais</Text>
        <View style={styles.evalRow}>
          <EvalCard
            icon="desktop-outline"
            tint={colors.info}
            label="Sistema"
            value={fmtInt(profile.system_score)}
            sub={SCORE_LABEL(profile.system_score)}
          />
          <EvalCard
            icon="people-outline"
            tint="#10B981"
            label="Cliente"
            value={fmtDec(
              profile.client_score !== null && profile.client_score !== undefined
                ? profile.client_score / 20
                : null
            )}
            sub={
              profile.client_relationship?.ratings_count
                ? `${profile.client_relationship.ratings_count} avaliações`
                : 'Aguardando'
            }
            star
          />
          <EvalCard
            icon="shield-checkmark-outline"
            tint="#F59E0B"
            label="Qualidade"
            value={fmtDec(
              profile.quality_score !== null && profile.quality_score !== undefined
                ? profile.quality_score / 20
                : null
            )}
            sub="Avaliação Reallliza"
            star
          />
        </View>
      </View>

      {/* ============ Especialidades ============ */}
      {hasSpecs && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Especialidades</Text>
          <View style={styles.specialtyList}>
            {specs && specs.length > 0
              ? specs.map((r) => (
                  <SpecialtyStarsRow
                    key={r.specialty_id}
                    name={r.name}
                    stars={r.stars}
                  />
                ))
              : (specsLegacy ?? []).map((r, i) => (
                  <SpecialtyStarsRow
                    key={`${r.name}-${i}`}
                    name={r.name}
                    stars={r.stars}
                  />
                ))}
          </View>
        </View>
      )}

      {/* ============ Relacionamento com cliente ============ */}
      {profile.client_relationship && profile.client_relationship.ratings_count > 0 && (
        <View style={styles.section}>
          <View style={styles.relationshipCard}>
            <Ionicons name="heart-outline" size={22} color="#10B981" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.relationshipTitle}>
                Relacionamento com o cliente
              </Text>
              <Text style={styles.relationshipSubtitle}>
                Avaliado pelos clientes
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <StarsRow stars={profile.client_relationship.rating_avg ?? 0} size={14} />
              <Text style={styles.relationshipCount}>
                {profile.client_relationship.ratings_count} avaliações
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ============ Estatísticas ============ */}
      {profile.stats && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Estatísticas</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}
          >
            <StatCard
              icon="checkmark-circle-outline"
              tint="#10B981"
              value={String(profile.stats.os_completed)}
              label="OS Concluídas"
            />
            <StatCard
              icon="time-outline"
              tint={colors.info}
              value={String(profile.stats.os_in_progress)}
              label="Em Andamento"
            />
            <StatCard
              icon="close-circle-outline"
              tint="#EF4444"
              value={String(profile.stats.os_cancelled)}
              label="Canceladas"
            />
            <StatCard
              icon="speedometer-outline"
              tint="#A855F7"
              value={
                profile.stats.punctuality_pct !== null
                  ? `${profile.stats.punctuality_pct}%`
                  : '—'
              }
              label="Pontualidade"
            />
            <StatCard
              icon="hourglass-outline"
              tint="#F59E0B"
              value={
                profile.stats.avg_completion_days !== null
                  ? `${fmtDec(profile.stats.avg_completion_days)} dias`
                  : '—'
              }
              label="Tempo Médio"
            />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function SpecialtyStarsRow({ name, stars }: { name: string; stars: number }) {
  const clamped = Math.max(0, Math.min(5, stars));
  return (
    <View style={styles.specialtyRow}>
      <Text style={styles.specialtyName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.specialtyRight}>
        <StarsRow stars={clamped} size={14} />
        <Text style={styles.specialtyValue}>
          {clamped.toFixed(1).replace('.', ',')}
        </Text>
      </View>
    </View>
  );
}

function StarsRow({ stars, size = 14 }: { stars: number; size?: number }) {
  const safe = Math.max(0, Math.min(5, stars));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const half = n - 0.5;
        let name: 'star' | 'star-half' | 'star-outline';
        if (safe >= n) name = 'star';
        else if (safe >= half) name = 'star-half';
        else name = 'star-outline';
        return (
          <Ionicons
            key={n}
            name={name}
            size={size}
            color={name === 'star-outline' ? colors.textMuted : '#FBBF24'}
            style={{ marginLeft: 1 }}
          />
        );
      })}
    </View>
  );
}

function EvalCard({
  icon,
  tint,
  label,
  value,
  sub,
  star,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  star?: boolean;
}) {
  return (
    <View style={[styles.evalCard, { borderColor: tint + '40' }]}>
      <View style={[styles.evalIconWrap, { backgroundColor: tint + '15' }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.evalLabel}>{label}</Text>
      <View style={styles.evalValueRow}>
        <Text style={[styles.evalValue, { color: tint }]}>{value}</Text>
        {star && value !== '—' && (
          <Ionicons name="star" size={14} color="#FBBF24" style={{ marginLeft: 4 }} />
        )}
      </View>
      {sub && <Text style={styles.evalSub}>{sub}</Text>}
    </View>
  );
}

function StatCard({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: tint + '15' }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { ...typography.bodyBold, color: colors.text },
  headerEmail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  headerRole: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 6,
  },
  nivelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  nivelText: { ...typography.button, fontSize: 11 },
  overallBox: { alignItems: 'flex-end' },
  overallLabel: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  overallValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 2,
  },
  overallChip: {
    backgroundColor: '#10B98122',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  overallChipText: {
    ...typography.caption,
    color: '#10B981',
    fontSize: 10,
    fontWeight: '600',
  },
  section: { marginTop: 16 },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  evalRow: { flexDirection: 'row', gap: 8 },
  evalCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  evalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  evalLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  evalValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  evalValue: { fontSize: 18, fontWeight: '800' },
  evalSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  specialtyList: { gap: 6 },
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
  specialtyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specialtyValue: {
    ...typography.bodySmBold,
    color: colors.info,
    minWidth: 28,
    textAlign: 'right',
  },
  relationshipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
  },
  relationshipTitle: { ...typography.bodySmBold, color: colors.text },
  relationshipSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  relationshipCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  statsRow: { gap: 8, paddingRight: 16 },
  statCard: {
    width: 110,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
