import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OsStackParamList } from '../navigation/os-stack';
import { useAuthStore } from '../stores/auth-store';
import {
  fetchPropostasOS,
  fetchMinhasOS,
  aceitarOS,
  type PropostaOS,
  type MinhaOS,
} from '../lib/garantias-api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = NativeStackScreenProps<OsStackParamList, 'Ecossistema'>;

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const OS_STATUS: Record<string, string> = {
  ACEITA: 'Aceita',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
};

export function EcossistemaScreen({ navigation }: Props) {
  const email = useAuthStore((s) => s.user?.email);
  const [aba, setAba] = useState<'propostas' | 'minhas'>('propostas');
  const [propostas, setPropostas] = useState<PropostaOS[]>([]);
  const [minhas, setMinhas] = useState<MinhaOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [aceitando, setAceitando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, m] = await Promise.all([fetchPropostasOS(email), fetchMinhasOS(email)]);
      setPropostas(p);
      setMinhas(m);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as ordens de serviço.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  async function aceitar(prop: PropostaOS) {
    if (!email || !prop.os) return;
    setAceitando(prop.id);
    try {
      await aceitarOS(email, prop.os.id);
      Alert.alert('OS aceita', 'A ordem de serviço foi adicionada às suas OS.');
      carregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível aceitar.');
    } finally {
      setAceitando(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Abas */}
      <View style={styles.tabs}>
        {(['propostas', 'minhas'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, aba === t && styles.tabActive]}
            onPress={() => setAba(t)}
          >
            <Text style={[styles.tabText, aba === t && styles.tabTextActive]}>
              {t === 'propostas' ? `Propostas (${propostas.length})` : `Minhas OS (${minhas.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={carregar} tintColor={colors.primary} />
          }
        >
          {aba === 'propostas' && (
            propostas.length === 0 ? (
              <Empty icon="document-text-outline" texto="Nenhuma proposta de OS no momento" />
            ) : (
              propostas.map((p) => (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.numero}>{p.os?.numero ?? 'OS'}</Text>
                    <Text style={styles.valor}>{brl(p.os?.valor_repasse_total ?? 0)}</Text>
                  </View>
                  <Text style={styles.cliente}>{p.os?.cliente_nome}</Text>
                  {p.os?.endereco && (
                    <Text style={styles.endereco}>
                      <Ionicons name="location-outline" size={12} /> {p.os.endereco}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => aceitar(p)}
                    disabled={aceitando === p.id}
                  >
                    {aceitando === p.id ? (
                      <ActivityIndicator color={colors.black} size="small" />
                    ) : (
                      <Text style={styles.btnText}>Aceitar OS</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )
          )}

          {aba === 'minhas' && (
            minhas.length === 0 ? (
              <Empty icon="briefcase-outline" texto="Você ainda não tem OS atribuídas" />
            ) : (
              minhas.map((os) => (
                <TouchableOpacity
                  key={os.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('EcossistemaOsDetail', { osId: os.id })}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.numero}>{os.numero}</Text>
                    <Text style={styles.valor}>{brl(os.valor_repasse_total)}</Text>
                  </View>
                  <Text style={styles.cliente}>{os.cliente_nome}</Text>
                  {os.endereco && (
                    <Text style={styles.endereco}>
                      <Ionicons name="location-outline" size={12} /> {os.endereco}
                    </Text>
                  )}
                  <View style={styles.statusRow}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{OS_STATUS[os.status] ?? os.status}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Empty({ icon, texto }: { icon: keyof typeof Ionicons.glyphMap; texto: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.textDark} />
      <Text style={styles.emptyText}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.button, fontSize: 13, color: colors.textMuted },
  tabTextActive: { color: colors.black },
  list: { padding: 12, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 6 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { ...typography.h3, color: colors.text },
  valor: { ...typography.button, color: colors.primary },
  cliente: { ...typography.body, color: colors.textSecondary },
  endereco: { ...typography.caption, color: colors.textMuted },
  btn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnText: { ...typography.button, color: colors.black },
  statusRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { ...typography.caption, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...typography.body, color: colors.textMuted },
});
