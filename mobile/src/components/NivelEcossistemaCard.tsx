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
  bronze: { label: 'BRONZE', cor: '#CD7F32' },
  prata: { label: 'PRATA', cor: '#A8A8B3' },
  ouro: { label: 'OURO', cor: '#FFD600' },
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

function iconForSpecialty(name: string): keyof typeof Ionicons.glyphMap {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('rodape')) return 'remove-outline';
  if (n.includes('painel')) return 'grid-outline';
  if (n.includes('forro')) return 'square-outline';
  if (n.includes('colado')) return 'apps-outline';
  if (n.includes('clicado')) return 'apps-outline';
  if (n.includes('acabamento')) return 'sparkles-outline';
  if (n.includes('atendimento')) return 'people-outline';
  return 'construct-outline';
}

/**
 * Card do perfil profissional (rev 05/06/2026 — v4 com Score Geral + Avaliações
 * Gerais de volta + card Relacionamento separado, conforme print final da Jessica).
 *
 * Estrutura:
 *  - Header HORIZONTAL: foto à esquerda · nome+email+badges (Técnico Instalador +
 *    BRONZE/PRATA/OURO + "Nível do técnico") · Score Geral grande + chip à direita.
 *  - Subtítulo full-width: "Baseado na avaliação do sistema, dos clientes e da
 *    Reallliza na execução das OS."
 *  - Avaliações Gerais (3 cards: Sistema 0-100 · Cliente estrelas+N · Qualidade estrelas).
 *  - Especialidades (ícone + estrelas + nota).
 *  - Relacionamento com o cliente (card único, só se ratings_count > 0).
 *  - Estatísticas (5 cards horizontais).
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
    typeof v === 'number' ? v.toFixed(fixed).replace('.', ',') : '—';

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

  const specs =
    profile.specialty_ratings_enriched ??
    profile.specialty_ratings?.map((r) => ({
      specialty_id: r.name,
      name: r.name,
      stars: r.stars,
    })) ??
    [];
  const specsFiltered = specs.filter(
    (r) => !r.name.toLowerCase().includes('atendimento ao cliente')
  );

  const clientRel = profile.client_relationship;
  const hasClientRel = !!(clientRel && clientRel.ratings_count > 0);

  return (
    <View>
      {/* ============ Header horizontal ============ */}
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={escolherFoto}
            disabled={uploadingFoto}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              {profile.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImg}
                />
              ) : (
                <Ionicons name="person" size={36} color={colors.textMuted} />
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
            <Text style={styles.name} numberOfLines={1}>
              {profile.full_name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {profile.email}
            </Text>
            {ROLE_LABEL[profile.role] && (
              <View style={styles.roleBadge}>
                <Ionicons
                  name="shield-outline"
                  size={12}
                  color={colors.textSecondary}
                />
                <Text style={styles.roleText}>{ROLE_LABEL[profile.role]}</Text>
              </View>
            )}
            <View
              style={[styles.nivelBadge, { backgroundColor: nivel.cor + '22' }]}
            >
              <Ionicons name="medal" size={14} color={nivel.cor} />
              <Text style={[styles.nivelText, { color: nivel.cor }]}>
                {nivel.label}
              </Text>
            </View>
            <Text style={styles.nivelSub}>Nível do técnico</Text>
          </View>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Score Geral</Text>
            <Text style={styles.scoreValue}>{fmtInt(overall)}</Text>
            {overallLabel && (
              <View style={styles.scoreChip}>
                <Text style={styles.scoreChipText}>{overallLabel}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.headerDesc}>
          Baseado na avaliação do sistema, dos clientes e da Reallliza na
          execução das OS.
        </Text>
      </View>

      {/* ============ Avaliações Gerais ============ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Avaliações Gerais</Text>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.textMuted}
          />
        </View>
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
              profile.quality_score !== null &&
                profile.quality_score !== undefined
                ? profile.quality_score / 20
                : null
            )}
            sub="Avaliação Reallliza"
            star
          />
        </View>
      </View>

      {/* ============ Especialidades ============ */}
      {specsFiltered.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Especialidades</Text>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.textMuted}
            />
          </View>
          <View style={styles.card}>
            {specsFiltered.map((r, i) => (
              <React.Fragment key={r.specialty_id}>
                <SpecialtyRow
                  icon={iconForSpecialty(r.name)}
                  name={r.name}
                  stars={r.stars}
                />
                {i < specsFiltered.length - 1 && (
                  <View style={styles.rowDivider} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {/* ============ Relacionamento com o cliente ============ */}
      {hasClientRel && (
        <View style={styles.section}>
          <View style={styles.relCard}>
            <View style={[styles.relIconWrap, { backgroundColor: '#10B98122' }]}>
              <Ionicons name="people" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.relTitle}>Relacionamento com o cliente</Text>
              <Text style={styles.relSub}>Avaliado pelos clientes</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <StarsRow stars={clientRel!.rating_avg ?? 0} size={14} />
              <Text style={styles.relCount}>
                {clientRel!.ratings_count} avaliações recebidas
              </Text>
              <Text style={styles.relValue}>
                {fmtDec(clientRel!.rating_avg)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ============ Estatísticas ============ */}
      {profile.stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estatísticas</Text>
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
                profile.stats.punctuality_pct !== null &&
                profile.stats.punctuality_pct !== undefined
                  ? `${profile.stats.punctuality_pct}%`
                  : '—'
              }
              label="Pontualidade"
            />
            <StatCard
              icon="hourglass-outline"
              tint="#F59E0B"
              value={
                profile.stats.avg_completion_days !== null &&
                profile.stats.avg_completion_days !== undefined
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

function SpecialtyRow({
  icon,
  name,
  stars,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  stars: number;
}) {
  const clamped = Math.max(0, Math.min(5, stars));
  return (
    <View style={styles.specRow}>
      <View style={styles.specIconWrap}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      </View>
      <Text style={styles.specName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.specRight}>
        <StarsRow stars={clamped} size={14} />
        <Text style={styles.specValue}>
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
          <Ionicons
            name="star"
            size={14}
            color="#FBBF24"
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
      {sub && (
        <View style={[styles.evalChip, { backgroundColor: '#10B98122' }]}>
          <Text style={[styles.evalChipText, { color: '#10B981' }]}>{sub}</Text>
        </View>
      )}
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
  /* ============ Header ============ */
  headerWrap: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyBold, color: colors.text },
  email: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },
  nivelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  nivelText: {
    ...typography.button,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  nivelSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  scoreBox: { alignItems: 'flex-end' },
  scoreLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.info,
    marginTop: 2,
  },
  scoreChip: {
    backgroundColor: '#10B98122',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  scoreChipText: {
    ...typography.caption,
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  headerDesc: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },

  /* ============ Section base ============ */
  section: {
    paddingHorizontal: 16,
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  /* ============ Avaliações Gerais ============ */
  evalRow: { flexDirection: 'row', gap: 8 },
  evalCard: {
    flex: 1,
    backgroundColor: colors.card,
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
  evalChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  evalChipText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },

  /* ============ Especialidades ============ */
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  specIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specName: { ...typography.bodySm, color: colors.text, flex: 1 },
  specRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specValue: {
    ...typography.bodySmBold,
    color: colors.info,
    minWidth: 28,
    textAlign: 'right',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 62,
  },

  /* ============ Relacionamento ============ */
  relCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  relIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  relTitle: { ...typography.bodySmBold, color: colors.text },
  relSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  relCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  relValue: {
    ...typography.bodySmBold,
    color: colors.info,
    marginTop: 1,
  },

  /* ============ Estatísticas ============ */
  statsRow: { gap: 8, paddingRight: 16 },
  statCard: {
    width: 120,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
