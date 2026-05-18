import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../stores/auth-store';
import {
  fetchEcossistemaPerfil,
  uploadFotoPerfil,
  type EcossistemaPerfil,
} from '../lib/garantias-api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const NIVEL_INFO: Record<string, { label: string; cor: string }> = {
  BRONZE: { label: 'Bronze', cor: '#CD7F32' },
  PRATA: { label: 'Prata', cor: '#A8A8B3' },
  OURO: { label: 'Ouro', cor: '#FFD600' },
};

/**
 * Card do perfil profissional no ecossistema (Marco 5):
 * foto de perfil, nível Bronze/Prata/Ouro, especialidades com
 * estrelas, avaliação do cliente e certificações Reallliza.
 * Dados vêm do Garantias. A foto é a mesma enviada ao cliente
 * na avaliação pós-OS.
 */
export function NivelEcossistemaCard() {
  const { user } = useAuthStore();
  const [perfil, setPerfil] = useState<EcossistemaPerfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const email = user?.email;

  useEffect(() => {
    if (!email) {
      setLoading(false);
      return;
    }
    fetchEcossistemaPerfil(email)
      .then(setPerfil)
      .catch(() => setErro('Perfil do ecossistema indisponível'))
      .finally(() => setLoading(false));
  }, [email]);

  async function capturarFoto(origem: 'camera' | 'galeria') {
    if (!email) return;
    try {
      let res: ImagePicker.ImagePickerResult;
      if (origem === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Autorize o uso da câmera para tirar a foto.');
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
      const up = await uploadFotoPerfil({
        email,
        file: {
          uri: a.uri,
          name: a.fileName ?? `foto_${Date.now()}.jpg`,
          type: a.mimeType ?? 'image/jpeg',
        },
      });
      setPerfil((prev) => (prev ? { ...prev, avatar_url: up.url } : prev));
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
      {/* Foto de perfil */}
      <View style={styles.avatarWrap}>
        <TouchableOpacity onPress={escolherFoto} disabled={uploadingFoto} activeOpacity={0.8}>
          <View style={styles.avatarCircle}>
            {perfil.avatar_url ? (
              <Image source={{ uri: perfil.avatar_url }} style={styles.avatarImg} />
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

      {/* Competências: atendimento ao cliente + especialidades com estrelas */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Competências</Text>

        {/* Atendimento ao cliente — alimentado pelas avaliações dos clientes */}
        <View style={styles.espRow}>
          <Text style={styles.espNome}>Atendimento ao cliente</Text>
          <View style={styles.estrelas}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= Math.round(perfil.avaliacao_cliente.media) ? 'star' : 'star-outline'}
                size={13}
                color={
                  n <= Math.round(perfil.avaliacao_cliente.media)
                    ? colors.primary
                    : colors.textMuted
                }
              />
            ))}
          </View>
        </View>

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
  avatarImg: {
    width: '100%',
    height: '100%',
  },
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
