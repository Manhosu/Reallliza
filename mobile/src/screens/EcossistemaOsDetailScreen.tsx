import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OsStackParamList } from '../navigation/os-stack';
import { useAuthStore } from '../stores/auth-store';
import {
  fetchOsDetalhe,
  atualizarEtapaOS,
  concluirOS,
  uploadFotoOS,
  type OsDetalheMobile,
  type OsEtapaMobile,
} from '../lib/garantias-api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = NativeStackScreenProps<OsStackParamList, 'EcossistemaOsDetail'>;

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function tirarFoto(): Promise<{ uri: string; name: string; type: string } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permissão necessária', 'Autorize o uso da câmera para registrar a foto.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.fileName ?? `foto_${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' };
}

export function EcossistemaOsDetailScreen({ route, navigation }: Props) {
  const { osId } = route.params;
  const email = useAuthStore((s) => s.user?.email);
  const [os, setOs] = useState<OsDetalheMobile | null>(null);
  const [loading, setLoading] = useState(true);
  const [acao, setAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!email) return;
    try {
      setOs(await fetchOsDetalhe(email, osId));
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar a OS.');
    } finally {
      setLoading(false);
    }
  }, [email, osId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  async function mudarEtapa(etapa: OsEtapaMobile, status: 'EM_ANDAMENTO' | 'CONCLUIDA') {
    if (!email) return;
    setAcao(etapa.id);
    try {
      const foto = await tirarFoto();
      if (!foto) {
        setAcao(null);
        return;
      }
      const up = await uploadFotoOS({ email, osId, tipo: 'etapa', file: foto });
      await atualizarEtapaOS({
        email,
        osId,
        etapaId: etapa.id,
        status,
        fotoInicioUrl: status === 'EM_ANDAMENTO' ? up.url : undefined,
        fotoFimUrl: status === 'CONCLUIDA' ? up.url : undefined,
      });
      await carregar();
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao atualizar etapa.');
    } finally {
      setAcao(null);
    }
  }

  async function concluir() {
    if (!email) return;
    Alert.alert(
      'Concluir OS',
      'Registre a assinatura do cliente (foto) para concluir a ordem de serviço.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar e concluir',
          onPress: async () => {
            setAcao('concluir');
            try {
              const foto = await tirarFoto();
              if (!foto) {
                setAcao(null);
                return;
              }
              const up = await uploadFotoOS({ email, osId, tipo: 'assinatura', file: foto });
              await concluirOS({ email, osId, assinaturaClienteUrl: up.url });
              Alert.alert('OS concluída', 'A ordem de serviço foi finalizada com sucesso.');
              navigation.goBack();
            } catch (e) {
              Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao concluir.');
            } finally {
              setAcao(null);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!os) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>OS não encontrada</Text>
      </View>
    );
  }

  const concluida = os.status === 'CONCLUIDA';
  const todasEtapasOk =
    os.etapas.length > 0 && os.etapas.every((e) => e.status === 'CONCLUIDA');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Cabeçalho */}
        <View style={styles.card}>
          <Text style={styles.numero}>{os.numero}</Text>
          <Text style={styles.cliente}>{os.cliente_nome}</Text>
          {os.endereco && (
            <Text style={styles.muted}>
              <Ionicons name="location-outline" size={13} /> {os.endereco}
            </Text>
          )}
          <Text style={styles.repasse}>Repasse: {brl(os.valor_repasse_total)}</Text>
        </View>

        {/* Itens */}
        <View style={styles.card}>
          <Text style={styles.secTitle}>Serviços</Text>
          {os.itens.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Text style={styles.itemTxt}>
                {it.quantidade}× {it.descricao ?? 'Serviço'}
              </Text>
              <Text style={styles.itemVal}>{brl(it.valor_repasse_unit * it.quantidade)}</Text>
            </View>
          ))}
        </View>

        {/* Etapas */}
        <View style={styles.card}>
          <Text style={styles.secTitle}>Etapas da execução</Text>
          {os.etapas.length === 0 && (
            <Text style={styles.muted}>Nenhuma etapa cadastrada para esta OS.</Text>
          )}
          {os.etapas
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((et) => (
              <View key={et.id} style={styles.etapa}>
                <View style={styles.etapaHead}>
                  <Ionicons
                    name={
                      et.status === 'CONCLUIDA'
                        ? 'checkmark-circle'
                        : et.status === 'EM_ANDAMENTO'
                          ? 'time'
                          : 'ellipse-outline'
                    }
                    size={18}
                    color={
                      et.status === 'CONCLUIDA'
                        ? colors.success
                        : et.status === 'EM_ANDAMENTO'
                          ? colors.warning
                          : colors.textDark
                    }
                  />
                  <Text style={styles.etapaNome}>{et.nome}</Text>
                </View>
                {!concluida && et.status !== 'CONCLUIDA' && (
                  <TouchableOpacity
                    style={styles.etapaBtn}
                    disabled={acao === et.id}
                    onPress={() =>
                      mudarEtapa(et, et.status === 'PENDENTE' ? 'EM_ANDAMENTO' : 'CONCLUIDA')
                    }
                  >
                    {acao === et.id ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Text style={styles.etapaBtnTxt}>
                        <Ionicons name="camera" size={13} />{' '}
                        {et.status === 'PENDENTE' ? 'Iniciar (foto)' : 'Concluir (foto)'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}
        </View>

        {/* Conclusão */}
        {concluida ? (
          <View style={[styles.card, styles.okBox]}>
            <Ionicons name="checkmark-done-circle" size={22} color={colors.success} />
            <Text style={styles.okTxt}>OS concluída</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.concluirBtn, !todasEtapasOk && styles.concluirBtnOff]}
            disabled={!todasEtapasOk || acao === 'concluir'}
            onPress={concluir}
          >
            {acao === 'concluir' ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.concluirTxt}>
                {todasEtapasOk
                  ? 'Concluir OS com assinatura do cliente'
                  : 'Conclua todas as etapas primeiro'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 12, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 6 },
  numero: { ...typography.h2, color: colors.text },
  cliente: { ...typography.body, color: colors.textSecondary },
  muted: { ...typography.caption, color: colors.textMuted },
  repasse: { ...typography.button, color: colors.primary, marginTop: 4 },
  secTitle: { ...typography.button, color: colors.text, marginBottom: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemTxt: { ...typography.body, color: colors.textSecondary },
  itemVal: { ...typography.body, color: colors.text },
  etapa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  etapaHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  etapaNome: { ...typography.body, color: colors.text },
  etapaBtn: {
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  etapaBtnTxt: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  concluirBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  concluirBtnOff: { backgroundColor: colors.borderLight },
  concluirTxt: { ...typography.button, color: colors.black },
  okBox: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  okTxt: { ...typography.button, color: colors.success },
});
