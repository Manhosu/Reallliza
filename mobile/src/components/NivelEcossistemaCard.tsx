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

// Ícone visual por especialidade (Ionicons). Resolução por nome
// normalizado (lowercase, sem acento) — pega o primeiro match.
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
 * Card do perfil profissional (rev 02/06/2026 — layout aprovado pela Jessica).
 *
 * Estrutura:
 *  - Header centralizado: foto grande + nome + badge nível com troféu +
 *    "Nível do técnico" + subtítulo explicativo.
 *  - Lista de Especialidades com ícone visual + estrelas + nota decimal.
 *    "Atendimento ao cliente" sempre como último item, destacado em azul
 *    com sub "Avaliado pelos clientes" — fonte: client_relationship.
 *  - Estatísticas horizontais (OS concluídas/andamento/canceladas/
 *    pontualidade/tempo médio) — mantidas como funcionalidade.
 *
 * Dados pessoais e Alterar Senha ficam no ProfileScreen.
 */
export function NivelEcossistemaCard() {
  const { profile, fetchProfile } = useAuthStore();
  const [uploadingFoto, setUploadingFoto] = useState(false);

  if (!profile) return null;

  const nivel = NIVEL_INFO[profile.level ?? 'bronze'] ?? NIVEL_INFO.bronze;
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

  // specialty_ratings_enriched (novo) tem preferência sobre legado.
  // Remove "Atendimento ao cliente" da lista regular — ele é renderizado
  // separadamente no fim com dados de client_relationship.
  const specsRaw = profile.specialty_ratings_enriched
    ?? profile.specialty_ratings?.map((r) => ({
      specialty_id: r.name,
      name: r.name,
      stars: r.stars,
    }))
    ?? [];
  const specs = specsRaw.filter(
    (r) => !r.name.toLowerCase().includes('atendimento ao cliente')
  );

  const clientRel = profile.client_relationship;
  const hasClientRel = !!(clientRel && clientRel.ratings_count > 0);

  return (
    <View>
      {/* ============ Header centralizado ============ */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={escolherFoto}
          disabled={uploadingFoto}
          activeOpacity={0.8}
        >
          <View style={styles.avatarBig}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImg}
              />
            ) : (
              <Ionicons name="person" size={48} color={colors.textMuted} />
            )}
            {uploadingFoto && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            <View style={styles.camBadge}>
              <Ionicons name="camera" size={14} color={colors.black} />
            </View>
          </View>
        </TouchableOpacity>

        <Text style={styles.name} numberOfLines={1}>
          {profile.full_name}
        </Text>

        <View style={[styles.nivelBadge, { backgroundColor: nivel.cor + '1F' }]}>
          <Ionicons name="medal" size={18} color={nivel.cor} />
          <Text style={[styles.nivelLabel, { color: nivel.cor }]}>
            {nivel.label}
          </Text>
        </View>
        <Text style={styles.nivelSub}>Nível do técnico</Text>
        <Text style={styles.nivelDesc}>
          Baseado na avaliação técnica e na avaliação dos clientes.
        </Text>
      </View>

      {/* ============ Especialidades ============ */}
      {(specs.length > 0 || hasClientRel) && (
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
            {specs.map((r, i) => (
              <React.Fragment key={r.specialty_id}>
                <SpecialtyRow
                  icon={iconForSpecialty(r.name)}
                  name={r.name}
                  stars={r.stars}
                />
                {(i < specs.length - 1 || hasClientRel) && (
                  <View style={styles.rowDivider} />
                )}
              </React.Fragment>
            ))}

            {hasClientRel && (
              <SpecialtyRow
                icon="people"
                name="Atendimento ao cliente"
                sub="Avaliado pelos clientes"
                stars={clientRel!.rating_avg ?? 0}
                highlight
              />
            )}
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
  sub,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  stars: number;
  sub?: string;
  highlight?: boolean;
}) {
  const clamped = Math.max(0, Math.min(5, stars));
  const tint = highlight ? colors.info : colors.textMuted;
  return (
    <View style={[styles.specRow, highlight && styles.specRowHighlight]}>
      <View
        style={[
          styles.specIconWrap,
          { backgroundColor: tint + (highlight ? '22' : '15') },
        ]}
      >
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.specName, highlight && { color: colors.info }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {sub && <Text style={styles.specSub}>{sub}</Text>}
      </View>
      <View style={styles.specRight}>
        <StarsRow stars={clamped} size={14} />
        <Text
          style={[styles.specValue, highlight && { color: colors.info }]}
        >
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
  /* ============ Header centralizado ============ */
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  avatarBig: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 14,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  nivelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  nivelLabel: {
    ...typography.button,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 14,
  },
  nivelSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 6,
    fontSize: 12,
  },
  nivelDesc: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    fontSize: 11,
    paddingHorizontal: 8,
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

  /* ============ Especialidades — linha ============ */
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  specRowHighlight: {
    backgroundColor: colors.info + '0F',
  },
  specIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specName: { ...typography.bodySm, color: colors.text },
  specSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  specRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specValue: {
    ...typography.bodySmBold,
    color: colors.text,
    minWidth: 28,
    textAlign: 'right',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 62,
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
