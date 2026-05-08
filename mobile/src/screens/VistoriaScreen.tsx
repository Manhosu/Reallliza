import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  fetchVistoria,
  saveVistoriaRemote,
  uploadEvidenciaRemote,
  GARANTIAS_API_KEY,
} from '../lib/garantias-api';
import {
  VistoriaAmbiente,
  VistoriaData,
  VistoriaPatologia,
  VistoriaPatologiaTipo,
  PericiaEvidencia,
  LADOS,
  PATOLOGIA_OPTIONS,
  emptyEspacamento,
  emptyTemperatura,
  newAmbiente,
  newPatologia,
  LadoChave,
} from '../lib/vistoria-types';
import { isDeviceOnline } from '../lib/api';
import type { OsStackParamList } from '../navigation/os-stack';

type VistoriaRoute = RouteProp<OsStackParamList, 'Vistoria'>;
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

const DRAFT_PREFIX = '@vistoria:draft:';

function extractProtocolFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = title.match(/(TK-\d{4,})/i);
  return m ? m[1].toUpperCase() : null;
}

export function VistoriaScreen() {
  const route = useRoute<VistoriaRoute>();
  const navigation = useNavigation<NavigationProp>();
  const { ticketId: initialTicketId, ticketProtocol: initialProtocol } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [ticketId, setTicketId] = useState<string | null>(initialTicketId || null);
  const [protocol, setProtocol] = useState<string | null>(initialProtocol || null);
  const [ticketTitle, setTicketTitle] = useState<string>('');
  const [isFinalized, setIsFinalized] = useState(false);

  const [ambientes, setAmbientes] = useState<VistoriaAmbiente[]>([]);
  const [evidencias, setEvidencias] = useState<PericiaEvidencia[]>([]);
  const [showPatologiaMenu, setShowPatologiaMenu] = useState<string | null>(null);
  const [uploadingRef, setUploadingRef] = useState<string | null>(null);

  const draftKey = useMemo(
    () => (ticketId ? `${DRAFT_PREFIX}${ticketId}` : null),
    [ticketId],
  );
  const hasLoadedRef = useRef(false);

  const loadFromServer = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (!GARANTIAS_API_KEY) {
        throw new Error('EXPO_PUBLIC_GARANTIAS_API_KEY nao configurada');
      }
      const data = await fetchVistoria({
        ticketId: initialTicketId,
        protocol: initialProtocol || undefined,
      });
      setTicketId(data.ticket.id);
      setProtocol(data.ticket.protocolo);
      setTicketTitle(`${data.ticket.protocolo} — ${data.ticket.cliente_nome}`);
      setIsFinalized(!!data.laudo?.vistoria_finalizada_at);
      const remoteAmb = data.laudo?.vistoria?.ambientes || [];
      setAmbientes(remoteAmb.length ? remoteAmb : []);
      setEvidencias(data.evidencias || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setErrorMsg(msg);
    }
  }, [initialTicketId, initialProtocol]);

  const loadFromDraft = useCallback(async () => {
    if (!draftKey) return;
    try {
      const raw = await AsyncStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        ambientes: VistoriaAmbiente[];
        savedAt: string;
      };
      if (parsed?.ambientes?.length) {
        setAmbientes(parsed.ambientes);
      }
    } catch {
      // ignore
    }
  }, [draftKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const online = isDeviceOnline();
      if (online) {
        await loadFromServer();
      } else {
        // sem rede: tenta usar protocolo como label
        if (initialProtocol) setTicketTitle(initialProtocol);
        setErrorMsg('Sem conexao — usando rascunho local.');
      }
      await loadFromDraft();
      if (!cancelled) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFromServer, loadFromDraft, initialProtocol]);

  // Auto-save em rascunho local
  useEffect(() => {
    if (!hasLoadedRef.current || !draftKey) return;
    AsyncStorage.setItem(
      draftKey,
      JSON.stringify({ ambientes, savedAt: new Date().toISOString() }),
    ).catch(() => {});
  }, [ambientes, draftKey]);

  // Auto-sync para o Garantias enquanto o tecnico preenche.
  // Jessica 08/05: "Ao mesmo tempo que ele preenche a vistoria no app
  // de execucao a plataforma de garantia vai sendo alimentada".
  // Debounce de 4s para nao spammar a rede.
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'offline'>('idle');
  useEffect(() => {
    if (!hasLoadedRef.current || !ticketId || isFinalized) return;
    setSyncStatus('idle');
    const timer = setTimeout(async () => {
      try {
        const online = await isDeviceOnline();
        if (!online) {
          setSyncStatus('offline');
          return;
        }
        setSyncStatus('syncing');
        const vistoria: VistoriaData = {
          ambientes,
          finalizada_at: null,
        };
        await saveVistoriaRemote({ ticketId, vistoria, finalizar: false });
        setSyncStatus('synced');
      } catch {
        setSyncStatus('offline');
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [ambientes, ticketId, isFinalized]);

  // ===================== Mutators =====================

  function updateAmbiente(id: string, updater: (a: VistoriaAmbiente) => VistoriaAmbiente) {
    setAmbientes((prev) => prev.map((a) => (a.id === id ? updater(a) : a)));
  }

  function addAmbiente() {
    setAmbientes((prev) => [...prev, newAmbiente()]);
  }

  function removeAmbiente(id: string) {
    Alert.alert('Remover ambiente?', 'Esta acao nao pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => setAmbientes((prev) => prev.filter((a) => a.id !== id)),
      },
    ]);
  }

  function updateEspacamento(
    ambId: string,
    tipo: 'longitudinal' | 'transversal',
    lado: LadoChave,
    field: 'valor' | 'descricao',
    value: number | string | null,
  ) {
    updateAmbiente(ambId, (a) => {
      const key = tipo === 'longitudinal' ? 'espacamento_longitudinal' : 'espacamento_transversal';
      const current = a[key] || emptyEspacamento();
      if (field === 'valor') {
        return { ...a, [key]: { ...current, [lado]: value as number | null } };
      }
      return {
        ...a,
        [key]: {
          ...current,
          descricoes: { ...(current.descricoes || {}), [lado]: value as string },
        },
      };
    });
  }

  function updateTemperatura(
    ambId: string,
    field: 'minima' | 'media' | 'maxima' | 'descricao_tecnica' | 'descricao_patologias',
    value: number | string,
  ) {
    updateAmbiente(ambId, (a) => ({
      ...a,
      temperatura: { ...emptyTemperatura(), ...(a.temperatura || {}), [field]: value },
    }));
  }

  function addPatologia(ambId: string, tipo: VistoriaPatologiaTipo) {
    updateAmbiente(ambId, (a) => ({
      ...a,
      patologias: [...(a.patologias || []), newPatologia(tipo)],
    }));
    setShowPatologiaMenu(null);
  }

  function updatePatologia(
    ambId: string,
    patId: string,
    updater: (p: VistoriaPatologia) => VistoriaPatologia,
  ) {
    updateAmbiente(ambId, (a) => ({
      ...a,
      patologias: (a.patologias || []).map((p) => (p.id === patId ? updater(p) : p)),
    }));
  }

  function removePatologia(ambId: string, patId: string) {
    updateAmbiente(ambId, (a) => ({
      ...a,
      patologias: (a.patologias || []).filter((p) => p.id !== patId),
    }));
  }

  // ===================== Upload =====================

  async function pickAndUpload(referencia: string) {
    if (!ticketId) {
      Alert.alert('Aguarde', 'Ticket ainda nao foi carregado.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (lib.status !== 'granted') {
        Alert.alert('Permissao necessaria', 'Permita acesso a camera ou galeria para anexar fotos.');
        return;
      }
    }

    Alert.alert('Adicionar foto', 'Escolha a origem', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Camera',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });
          if (!result.canceled && result.assets?.[0]) {
            await doUpload(referencia, result.assets[0]);
          }
        },
      },
      {
        text: 'Galeria',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });
          if (!result.canceled && result.assets?.[0]) {
            await doUpload(referencia, result.assets[0]);
          }
        },
      },
    ]);
  }

  async function doUpload(referencia: string, asset: ImagePicker.ImagePickerAsset) {
    if (!ticketId) return;
    if (!isDeviceOnline()) {
      Alert.alert(
        'Sem conexao',
        'O upload sera feito quando o app voltar a ficar online. Salve o rascunho.',
      );
      return;
    }
    setUploadingRef(referencia);
    try {
      const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0];
      const fileName = `vistoria_${Date.now()}.${ext}`;
      const result = await uploadEvidenciaRemote({
        ticketId,
        referenciaItem: referencia,
        file: {
          uri: asset.uri,
          name: fileName,
          type: asset.mimeType || `image/${ext}`,
        },
      });
      setEvidencias((prev) => [...prev, result.evidencia]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      Alert.alert('Erro ao enviar foto', msg);
    } finally {
      setUploadingRef(null);
    }
  }

  function getEvidenciasPorRef(ref: string) {
    return evidencias.filter((e) => e.referencia_item === ref);
  }

  // ===================== Save / Finalize =====================

  async function handleSave() {
    if (!ticketId) {
      Alert.alert('Aguarde', 'Ticket ainda nao foi carregado.');
      return;
    }
    if (!isDeviceOnline()) {
      Alert.alert('Rascunho local salvo', 'Sem conexao — os dados serao enviados quando estiver online.');
      return;
    }
    setSaving(true);
    try {
      const vistoria: VistoriaData = { ambientes };
      await saveVistoriaRemote({ ticketId, vistoria, finalizar: false });
      Alert.alert('Salvo', 'Rascunho enviado para o servidor.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      Alert.alert('Erro', msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizar() {
    if (!ticketId) return;
    if (ambientes.length === 0) {
      Alert.alert('Atencao', 'Adicione pelo menos um ambiente.');
      return;
    }
    if (ambientes.some((a) => !a.nome.trim())) {
      Alert.alert('Atencao', 'Todos os ambientes precisam ter nome.');
      return;
    }
    if (!isDeviceOnline()) {
      Alert.alert('Sem conexao', 'Conecte-se a internet para finalizar a vistoria.');
      return;
    }
    Alert.alert(
      'Finalizar vistoria?',
      'Apos finalizar, o operador podera elaborar o laudo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            setFinalizing(true);
            try {
              const vistoria: VistoriaData = { ambientes };
              await saveVistoriaRemote({ ticketId, vistoria, finalizar: true });
              if (draftKey) await AsyncStorage.removeItem(draftKey);
              setIsFinalized(true);
              Alert.alert('Vistoria finalizada', 'Voce sera redirecionado.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Erro ao finalizar';
              Alert.alert('Erro', msg);
            } finally {
              setFinalizing(false);
            }
          },
        },
      ],
    );
  }

  // ===================== Render =====================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!ticketId && !initialTicketId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
          <Text style={[styles.errorTitle]}>Esta OS nao e uma pericia</Text>
          <Text style={styles.errorBody}>
            A vistoria tecnica so esta disponivel para OS do tipo PERICIA criadas pela plataforma de
            garantias.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vistoria Tecnica</Text>
          <Text style={styles.headerSubtitle}>{ticketTitle || protocol || ''}</Text>
          {isFinalized && (
            <View style={styles.finalizadaBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600' }}>
                Finalizada
              </Text>
            </View>
          )}
          {!isFinalized && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              {syncStatus === 'syncing' && (
                <>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Enviando para o Garantias...
                  </Text>
                </>
              )}
              {syncStatus === 'synced' && (
                <>
                  <Ionicons name="cloud-done-outline" size={14} color={colors.success} />
                  <Text style={{ color: colors.success, fontSize: 11 }}>
                    Sincronizado com o Garantias
                  </Text>
                </>
              )}
              {syncStatus === 'offline' && (
                <>
                  <Ionicons name="cloud-offline-outline" size={14} color="#FCD34D" />
                  <Text style={{ color: '#FCD34D', fontSize: 11 }}>
                    Sem internet (rascunho local salvo)
                  </Text>
                </>
              )}
            </View>
          )}
          {(route.params as any)?.osId && (
            <TouchableOpacity
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() =>
                navigation.navigate('OsDetail', {
                  id: (route.params as any).osId,
                })
              }
            >
              <Ionicons name="information-circle-outline" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                Detalhes da OS
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#FCD34D" />
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        )}

        {ambientes.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="grid-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum ambiente registrado</Text>
            <Text style={styles.emptyBody}>
              Toque em &quot;Adicionar Ambiente&quot; para comecar.
            </Text>
          </View>
        )}

        {ambientes.map((amb, idx) => (
          <AmbienteCard
            key={amb.id}
            ambiente={amb}
            index={idx}
            disabled={isFinalized}
            uploadingRef={uploadingRef}
            evidencias={evidencias}
            onChange={(updater) => updateAmbiente(amb.id, updater)}
            onRemove={() => removeAmbiente(amb.id)}
            onUpdateEspacamento={(tipo, lado, field, value) =>
              updateEspacamento(amb.id, tipo, lado, field, value)
            }
            onUpdateTemperatura={(field, value) => updateTemperatura(amb.id, field, value)}
            onAddPatologia={() => setShowPatologiaMenu(amb.id)}
            onUpdatePatologia={(patId, updater) => updatePatologia(amb.id, patId, updater)}
            onRemovePatologia={(patId) => removePatologia(amb.id, patId)}
            onUploadFor={pickAndUpload}
            getEvidenciasPorRef={getEvidenciasPorRef}
          />
        ))}

        {!isFinalized && (
          <TouchableOpacity style={styles.addBtn} onPress={addAmbiente} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.addBtnText}>Adicionar Ambiente</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {!isFinalized && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnSecondary]}
            onPress={handleSave}
            disabled={saving || finalizing}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color={colors.text} />
                <Text style={[styles.footerBtnText, { color: colors.text }]}>Salvar Rascunho</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnPrimary]}
            onPress={handleFinalizar}
            disabled={saving || finalizing}
          >
            {finalizing ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.black} />
                <Text style={[styles.footerBtnText, { color: colors.black }]}>
                  Finalizar Vistoria
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={!!showPatologiaMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPatologiaMenu(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => setShowPatologiaMenu(null)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adicionar patologia</Text>
            {PATOLOGIA_OPTIONS.map((opt) => {
              const amb = ambientes.find((a) => a.id === showPatologiaMenu);
              const jaTem = amb?.patologias?.some((p) => p.tipo === opt.tipo);
              return (
                <TouchableOpacity
                  key={opt.tipo}
                  disabled={jaTem}
                  onPress={() => {
                    if (showPatologiaMenu) addPatologia(showPatologiaMenu, opt.tipo);
                  }}
                  style={[styles.modalItem, jaTem && { opacity: 0.4 }]}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemTitle}>{opt.label}</Text>
                    {jaTem && (
                      <Text style={styles.modalItemBadge}>(ja adicionada)</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ===================== Subcomponents =====================

interface AmbienteCardProps {
  ambiente: VistoriaAmbiente;
  index: number;
  disabled: boolean;
  uploadingRef: string | null;
  evidencias: PericiaEvidencia[];
  onChange: (updater: (a: VistoriaAmbiente) => VistoriaAmbiente) => void;
  onRemove: () => void;
  onUpdateEspacamento: (
    tipo: 'longitudinal' | 'transversal',
    lado: LadoChave,
    field: 'valor' | 'descricao',
    value: number | string | null,
  ) => void;
  onUpdateTemperatura: (
    field: 'minima' | 'media' | 'maxima' | 'descricao_tecnica' | 'descricao_patologias',
    value: number | string,
  ) => void;
  onAddPatologia: () => void;
  onUpdatePatologia: (patId: string, updater: (p: VistoriaPatologia) => VistoriaPatologia) => void;
  onRemovePatologia: (patId: string) => void;
  onUploadFor: (referencia: string) => void;
  getEvidenciasPorRef: (ref: string) => PericiaEvidencia[];
}

function AmbienteCard(props: AmbienteCardProps) {
  const { ambiente: amb, index, disabled } = props;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardHeaderTitle}>Ambiente {index + 1}</Text>
        {!disabled && (
          <TouchableOpacity onPress={props.onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      <Field label="Nome do Ambiente">
        <TextInput
          style={styles.input}
          value={amb.nome}
          editable={!disabled}
          placeholder="Ex: Sala, Quarto 1..."
          placeholderTextColor={colors.textDark}
          onChangeText={(v) => props.onChange((a) => ({ ...a, nome: v }))}
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Largura (m)" style={{ flex: 1 }}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={amb.largura ? String(amb.largura) : ''}
            editable={!disabled}
            placeholder="0.00"
            placeholderTextColor={colors.textDark}
            onChangeText={(v) => props.onChange((a) => ({ ...a, largura: parseFloat(v) || 0 }))}
          />
        </Field>
        <Field label="Comprimento (m)" style={{ flex: 1 }}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={amb.comprimento ? String(amb.comprimento) : ''}
            editable={!disabled}
            placeholder="0.00"
            placeholderTextColor={colors.textDark}
            onChangeText={(v) => props.onChange((a) => ({ ...a, comprimento: parseFloat(v) || 0 }))}
          />
        </Field>
      </View>

      <Field label="Tipo de Substituicao">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['COMPLETO', 'PARCIAL'] as const).map((tipo) => {
            const active = (amb.tipo_substituicao || 'COMPLETO') === tipo;
            return (
              <TouchableOpacity
                key={tipo}
                disabled={disabled}
                onPress={() => props.onChange((a) => ({ ...a, tipo_substituicao: tipo }))}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                  {tipo === 'COMPLETO' ? 'Completo' : 'Parcial'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <EspacamentoBlock
        title="Espacamento Longitudinal (mm)"
        data={amb.espacamento_longitudinal || emptyEspacamento()}
        disabled={disabled}
        onChange={(lado, field, value) =>
          props.onUpdateEspacamento('longitudinal', lado, field, value)
        }
      />
      <EspacamentoBlock
        title="Espacamento Transversal (mm)"
        data={amb.espacamento_transversal || emptyEspacamento()}
        disabled={disabled}
        onChange={(lado, field, value) =>
          props.onUpdateEspacamento('transversal', lado, field, value)
        }
      />

      {/* Fotos por lado */}
      <Field label="Evidencias fotograficas por lado">
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {LADOS.map((lado) => {
            const ref = `ambiente:${amb.nome || amb.id}:lado_${lado}`;
            const fotos = props.getEvidenciasPorRef(ref);
            const isUp = props.uploadingRef === ref;
            return (
              <View key={lado} style={styles.ladoBox}>
                <Text style={styles.ladoLabel}>
                  Lado {lado.toUpperCase()} ({fotos.length})
                </Text>
                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                  {fotos.slice(0, 3).map((f) => (
                    <Image key={f.id} source={{ uri: f.url }} style={styles.thumbSm} />
                  ))}
                  {!disabled && (
                    <TouchableOpacity
                      style={styles.thumbAdd}
                      onPress={() => props.onUploadFor(ref)}
                      disabled={isUp}
                    >
                      {isUp ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="camera-outline" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 4, fontSize: 11, height: 32 }]}
                  placeholder={`Descricao Lado ${lado.toUpperCase()}`}
                  placeholderTextColor={colors.textDark}
                  editable={!disabled}
                  value={
                    amb.espacamento_longitudinal?.descricoes?.[lado] ||
                    amb.espacamento_transversal?.descricoes?.[lado] ||
                    ''
                  }
                  onChangeText={(v) => props.onUpdateEspacamento('longitudinal', lado, 'descricao', v)}
                />
              </View>
            );
          })}
        </View>
      </Field>

      <TemperaturaBlock
        ambNome={amb.nome || amb.id}
        data={amb.temperatura || emptyTemperatura()}
        disabled={disabled}
        uploadingRef={props.uploadingRef}
        onChange={props.onUpdateTemperatura}
        onUploadFor={props.onUploadFor}
        getEvidenciasPorRef={props.getEvidenciasPorRef}
      />

      {(amb.patologias || []).map((pat) => (
        <PatologiaBlock
          key={pat.id}
          ambNome={amb.nome || amb.id}
          patologia={pat}
          disabled={disabled}
          uploadingRef={props.uploadingRef}
          onChange={(updater) => props.onUpdatePatologia(pat.id, updater)}
          onRemove={() => props.onRemovePatologia(pat.id)}
          onUploadFor={props.onUploadFor}
          getEvidenciasPorRef={props.getEvidenciasPorRef}
        />
      ))}

      {!disabled && (
        <TouchableOpacity style={styles.addPatologiaBtn} onPress={props.onAddPatologia}>
          <Ionicons name="add-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.addPatologiaText}>Adicionar outras patologias</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  style?: { [key: string]: unknown };
}
function Field({ label, children, style }: FieldProps) {
  return (
    <View style={[{ marginTop: 10 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

interface EspacamentoBlockProps {
  title: string;
  data: NonNullable<VistoriaAmbiente['espacamento_longitudinal']>;
  disabled: boolean;
  onChange: (lado: LadoChave, field: 'valor' | 'descricao', value: number | string | null) => void;
}
function EspacamentoBlock({ title, data, disabled, onChange }: EspacamentoBlockProps) {
  return (
    <Field label={title}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {LADOS.map((lado) => (
          <View key={lado} style={{ flex: 1 }}>
            <Text style={styles.ladoLabel}>Lado {lado.toUpperCase()}</Text>
            <TextInput
              style={[styles.input, { height: 36, fontSize: 12 }]}
              keyboardType="decimal-pad"
              editable={!disabled}
              value={data[lado] != null ? String(data[lado]) : ''}
              placeholder="0.0"
              placeholderTextColor={colors.textDark}
              onChangeText={(v) => onChange(lado, 'valor', parseFloat(v) || null)}
            />
          </View>
        ))}
      </View>
    </Field>
  );
}

interface TemperaturaBlockProps {
  ambNome: string;
  data: NonNullable<VistoriaAmbiente['temperatura']>;
  disabled: boolean;
  uploadingRef: string | null;
  onChange: (
    field: 'minima' | 'media' | 'maxima' | 'descricao_tecnica' | 'descricao_patologias',
    value: number | string,
  ) => void;
  onUploadFor: (referencia: string) => void;
  getEvidenciasPorRef: (ref: string) => PericiaEvidencia[];
}
function TemperaturaBlock({
  ambNome,
  data,
  disabled,
  uploadingRef,
  onChange,
  onUploadFor,
  getEvidenciasPorRef,
}: TemperaturaBlockProps) {
  const ref = `ambiente:${ambNome}:temperatura`;
  const fotos = getEvidenciasPorRef(ref);
  const isUp = uploadingRef === ref;

  return (
    <View style={styles.subCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="thermometer-outline" size={16} color={colors.warning} />
        <Text style={styles.subCardTitle}>Temperatura</Text>
      </View>
      <Text style={styles.subCardDesc}>
        Aferir minima (~10°C), media (18-25°C) e maxima (ate 30°C).
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {(['minima', 'media', 'maxima'] as const).map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{k} (°C)</Text>
            <TextInput
              style={[styles.input, { height: 36, fontSize: 12 }]}
              keyboardType="decimal-pad"
              editable={!disabled}
              value={data[k] ? String(data[k]) : ''}
              placeholder="0"
              placeholderTextColor={colors.textDark}
              onChangeText={(v) => onChange(k, parseFloat(v) || 0)}
            />
          </View>
        ))}
      </View>
      <Field label="Descricao tecnica">
        <TextInput
          style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
          editable={!disabled}
          multiline
          value={data.descricao_tecnica || ''}
          onChangeText={(v) => onChange('descricao_tecnica', v)}
        />
      </Field>
      <Field label="Outras patologias observadas">
        <TextInput
          style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
          editable={!disabled}
          multiline
          value={data.descricao_patologias || ''}
          onChangeText={(v) => onChange('descricao_patologias', v)}
        />
      </Field>
      <Field label={`Evidencias fotograficas (${fotos.length})`}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {fotos.map((f) => (
            <Image key={f.id} source={{ uri: f.url }} style={styles.thumb} />
          ))}
          {!disabled && (
            <TouchableOpacity style={styles.thumbAddLg} onPress={() => onUploadFor(ref)} disabled={isUp}>
              {isUp ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </Field>
    </View>
  );
}

interface PatologiaBlockProps {
  ambNome: string;
  patologia: VistoriaPatologia;
  disabled: boolean;
  uploadingRef: string | null;
  onChange: (updater: (p: VistoriaPatologia) => VistoriaPatologia) => void;
  onRemove: () => void;
  onUploadFor: (referencia: string) => void;
  getEvidenciasPorRef: (ref: string) => PericiaEvidencia[];
}
function PatologiaBlock(props: PatologiaBlockProps) {
  const config = PATOLOGIA_OPTIONS.find((o) => o.tipo === props.patologia.tipo);
  if (!config) return null;
  const ref = `ambiente:${props.ambNome}:patologia_${props.patologia.tipo.toLowerCase()}`;
  const fotos = props.getEvidenciasPorRef(ref);
  const isUp = props.uploadingRef === ref;

  return (
    <View style={[styles.subCard, { backgroundColor: '#1a1408' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.subCardTitle}>{config.label}</Text>
        </View>
        {!props.disabled && (
          <TouchableOpacity onPress={props.onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.subCardDesc}>{config.descricao}</Text>

      {config.temExposicao && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Exposicao solar</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[true, false].map((val) => {
                const active = props.patologia.exposicao_solar?.sim === val;
                return (
                  <TouchableOpacity
                    key={String(val)}
                    disabled={props.disabled}
                    onPress={() =>
                      props.onChange((p) => ({
                        ...p,
                        exposicao_solar: {
                          ...(p.exposicao_solar || { sim: false, periodo: null }),
                          sim: val,
                        },
                      }))
                    }
                    style={[styles.toggleBtnSm, active && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                      {val ? 'Sim' : 'Nao'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ flex: 1.5 }}>
            <Text style={styles.fieldLabel}>Periodo</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(['MANHA', 'TARDE', 'INTEGRAL'] as const).map((per) => {
                const active = props.patologia.exposicao_solar?.periodo === per;
                return (
                  <TouchableOpacity
                    key={per}
                    disabled={props.disabled}
                    onPress={() =>
                      props.onChange((p) => ({
                        ...p,
                        exposicao_solar: {
                          ...(p.exposicao_solar || { sim: false, periodo: null }),
                          periodo: per,
                        },
                      }))
                    }
                    style={[styles.toggleBtnSm, active && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                      {per === 'MANHA' ? 'Manha' : per === 'TARDE' ? 'Tarde' : 'Integral'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {config.temDirecao && (
        <Field label="Direcao">
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['TRANSVERSAL', 'LONGITUDINAL'] as const).map((dir) => {
              const active = props.patologia.direcao === dir;
              return (
                <TouchableOpacity
                  key={dir}
                  disabled={props.disabled}
                  onPress={() => props.onChange((p) => ({ ...p, direcao: dir }))}
                  style={[styles.toggleBtnSm, active && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
                    {dir === 'TRANSVERSAL' ? 'Transversal' : 'Longitudinal'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
      )}

      <Field label="Descricao tecnica">
        <TextInput
          style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
          editable={!props.disabled}
          multiline
          value={props.patologia.descricao_tecnica}
          onChangeText={(v) => props.onChange((p) => ({ ...p, descricao_tecnica: v }))}
        />
      </Field>
      <Field label="Outras patologias observadas">
        <TextInput
          style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
          editable={!props.disabled}
          multiline
          value={props.patologia.descricao_patologias}
          onChangeText={(v) => props.onChange((p) => ({ ...p, descricao_patologias: v }))}
        />
      </Field>
      <Field label={`Evidencias fotograficas (${fotos.length})`}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {fotos.map((f) => (
            <Image key={f.id} source={{ uri: f.url }} style={styles.thumb} />
          ))}
          {!props.disabled && (
            <TouchableOpacity
              style={styles.thumbAddLg}
              onPress={() => props.onUploadFor(ref)}
              disabled={isUp}
            >
              {isUp ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </Field>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { ...typography.h3, color: colors.text, marginTop: 12 },
  errorBody: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { ...typography.h2, color: colors.text },
  headerSubtitle: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  finalizadaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16331E',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#78350F',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorBannerText: { color: '#FCD34D', fontSize: 12, flex: 1 },
  empty: { alignItems: 'center', padding: 36 },
  emptyTitle: { ...typography.bodyBold, color: colors.text, marginTop: 12 },
  emptyBody: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    margin: 12,
    marginBottom: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderTitle: { ...typography.bodyBold, color: colors.textMuted, fontSize: 12 },
  fieldLabel: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toggleBtnSm: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleBtnText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  toggleBtnTextActive: { color: colors.black },
  ladoBox: { width: '23%', minWidth: 80 },
  ladoLabel: { fontSize: 9, color: colors.textMuted, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase' },
  thumb: { width: 50, height: 50, borderRadius: 6 },
  thumbSm: { width: 28, height: 28, borderRadius: 4 },
  thumbAdd: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAddLg: {
    width: 50,
    height: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCard: {
    backgroundColor: '#1a1408',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  subCardTitle: { ...typography.bodySmBold, color: colors.text },
  subCardDesc: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  addPatologiaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  addPatologiaText: { color: colors.warning, fontWeight: '600', fontSize: 13 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 8,
    margin: 12,
    backgroundColor: colors.card,
  },
  addBtnText: { color: colors.primary, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
  },
  footerBtnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  footerBtnPrimary: { backgroundColor: colors.primary },
  footerBtnText: { fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 8 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  modalItemTitle: { color: colors.text, fontSize: 13 },
  modalItemBadge: { color: colors.textMuted, fontSize: 10 },
});
