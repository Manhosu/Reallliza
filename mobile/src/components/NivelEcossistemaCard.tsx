import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';
import { fetchEcossistemaPerfil, type EcossistemaPerfil } from '../lib/garantias-api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const NIVEL_INFO: Record<string, { label: string; cor: string }> = {
  BRONZE: { label: 'Bronze', cor: '#CD7F32' },
  PRATA: { label: 'Prata', cor: '#A8A8B3' },
  OURO: { label: 'Ouro', cor: '#FFD600' },
};

/**
 * Card do perfil profissional no ecossistema (Marco 5):
 * nível Bronze/Prata/Ouro, especialidades com estrelas, avaliação
 * do cliente e certificações Reallliza. Dados vêm do Garantias.
 */
export function NivelEcossistemaCard() {
  const { user } = useAuthStore();
  const [perfil, setPerfil] = useState<EcossistemaPerfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const email = user?.email;
    if (!email) {
      setLoading(false);
      return;
    }
    fetchEcossistemaPerfil(email)
      .then(setPerfil)
      .catch(() => setErro('Perfil do ecossistema indisponível'))
      .finally(() => setLoading(false));
  }, [user?.email]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (erro || !perfil) {
    return null; // silencioso — não atrapalha o resto do perfil
  }

  const nivel = NIVEL_INFO[perfil.nivel] ?? NIVEL_INFO.BRONZE;

  return (
    <View style={styles.card}>
      {/* Nível */}
      <View style={styles.nivelRow}>
        <View style={[styles.nivelBadge, { backgroundColor: nivel.cor + '22' }]}>
          <Ionicons name="ribbon" size={18} color={nivel.cor} />
          <Text style={[styles.nivelText, { color: nivel.cor }]}>Nível {nivel.label}</Text>
        </View>
        <View style={styles.avalBox}>
          <Ionicons name="star" size={14} color={colors.primary} />
          <Text style={styles.avalText}>
            {perfil.avaliacao_cliente.media.toFixed(1)}
            <Text style={styles.avalSub}> ({perfil.avaliacao_cliente.total})</Text>
          </Text>
        </View>
      </View>

      {/* Especialidades com estrelas */}
      {perfil.especialidades.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Especialidades</Text>
          {perfil.especialidades.map((e) => (
            <View key={e.id} style={styles.espRow}>
              <Text style={styles.espNome}>{e.especialidade?.nome ?? '—'}</Text>
              <View style={styles.estrelas}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= e.nivel ? 'star' : 'star-outline'}
                    size={13}
                    color={n <= e.nivel ? colors.primary : colors.textMuted}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Certificações */}
      {perfil.certificacoes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Certificações Reallliza</Text>
          {perfil.certificacoes.map((c) => (
            <View key={c.id} style={styles.certRow}>
              <Ionicons name="school" size={14} color={colors.primary} />
              <Text style={styles.certNome}>{c.curso_nome ?? 'Curso'}</Text>
            </View>
          ))}
        </View>
      )}
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
  avalBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avalText: { ...typography.body, color: colors.text, fontWeight: '700' },
  avalSub: { ...typography.caption, color: colors.textMuted },
  section: { marginTop: 14 },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  espRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  espNome: { ...typography.body, color: colors.text },
  estrelas: { flexDirection: 'row', gap: 1 },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  certNome: { ...typography.body, color: colors.text },
});
