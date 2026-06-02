import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient, isDeviceOnline } from '../lib/api';
import { offlineStorage } from '../lib/offline-storage';
import { startTracking, stopTracking } from '../lib/location-tracker';
import {
  ServiceOrder,
  OsStatus,
  Checklist,
  Photo,
  getOsTipo,
} from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type DetailRoute = RouteProp<OsStackParamList, 'OsDetail'>;
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

type TimelineStep = {
  key: string;
  label: string;
  isReached: (order: ServiceOrder) => boolean;
};

const TIMELINE_STEPS: TimelineStep[] = [
  {
    key: 'assigned',
    label: 'Atribuída',
    isReached: (o) =>
      o.status === OsStatus.ASSIGNED ||
      o.status === OsStatus.IN_PROGRESS ||
      o.status === OsStatus.PAUSED ||
      o.status === OsStatus.COMPLETED,
  },
  {
    key: 'in_transit',
    label: 'Deslocamento',
    isReached: (o) =>
      (o.status === OsStatus.IN_PROGRESS && !o.arrived_at) ||
      o.status === OsStatus.PAUSED ||
      !!o.arrived_at ||
      o.status === OsStatus.COMPLETED,
  },
  {
    key: 'arrived',
    label: 'No Local',
    isReached: (o) => !!o.arrived_at || o.status === OsStatus.COMPLETED,
  },
  {
    key: 'completed',
    label: 'Concluída',
    isReached: (o) => o.status === OsStatus.COMPLETED,
  },
];

export function OsDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<NavigationProp>();
  const { id } = route.params;

  type OsItem = {
    id: string;
    kind: 'S' | 'P';
    identification: string | null;
    description: string;
    unit: string | null;
    unit_value: number | string;
    quantity: number | string;
    total: number | string;
  };

  type StepLite = { id: string; status: 'pending' | 'in_progress' | 'completed' | 'skipped' };
  type OsProject = {
    id: string;
    file_url: string;
    file_name: string | null;
    mime_type: string;
    size_bytes: number | null;
  };

  const [order, setOrder] = useState<(ServiceOrder & { items?: OsItem[] }) | null>(null);
  const [items, setItems] = useState<OsItem[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [steps, setSteps] = useState<StepLite[]>([]);
  const [projects, setProjects] = useState<OsProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  const formatBRL = (n: number | string): string => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 'R$ 0,00';
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fetchData = useCallback(async () => {
    try {
      const [orderData, checklistData, photoData, stepData, projectsData] = await Promise.all([
        apiClient.get<ServiceOrder & { items?: OsItem[] }>(`/service-orders/${id}`),
        apiClient.get<Checklist[]>(`/service-orders/${id}/checklists`),
        apiClient.get<Photo[]>(`/service-orders/${id}/photos`),
        apiClient.get<StepLite[]>(`/service-orders/${id}/steps`).catch(() => [] as StepLite[]),
        apiClient
          .get<OsProject[]>(`/os-projects?service_order_id=${id}`)
          .catch(() => [] as OsProject[]),
      ]);
      setOrder(orderData);
      setItems(orderData.items || []);
      setChecklists(checklistData);
      setPhotos(photoData);
      setSteps(stepData);
      setProjects(projectsData);
      setIsFromCache(false);

      // Cache the full detail for offline use
      await offlineStorage.saveOsDetail(id, {
        order: orderData,
        checklists: checklistData,
        photos: photoData,
        steps: stepData,
      });
    } catch (error) {
      console.error('Error fetching OS detail:', error);

      // If offline, try loading from cache
      if (!isDeviceOnline()) {
        try {
          const cached = await offlineStorage.getOsDetail(id) as {
            order: ServiceOrder & { items?: OsItem[] };
            checklists: Checklist[];
            photos: Photo[];
            steps?: StepLite[];
          } | null;
          if (cached) {
            setOrder(cached.order);
            setItems(cached.order?.items || []);
            setChecklists(cached.checklists ?? []);
            setPhotos(cached.photos ?? []);
            setSteps(cached.steps ?? []);
            setIsFromCache(true);
            return;
          }
        } catch {
          // ignore cache read error
        }
      }

      Alert.alert('Erro', 'Nao foi possivel carregar os dados da OS.');
    }
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const updateStatus = async (newStatus: OsStatus, notes?: string) => {
    try {
      setIsUpdatingStatus(true);

      // Start location tracking when beginning displacement
      if (newStatus === OsStatus.IN_PROGRESS && order?.status === OsStatus.ASSIGNED) {
        const trackingStarted = await startTracking(id);
        if (!trackingStarted) {
          console.warn('Location tracking could not be started (permission denied)');
        }
      }

      await apiClient.patch(`/service-orders/${id}/status`, {
        status: newStatus,
        notes,
      });

      // Stop location tracking when service is completed or cancelled
      if (newStatus === OsStatus.COMPLETED || newStatus === OsStatus.CANCELLED) {
        await stopTracking();
      }

      await fetchData();
    } catch (error: unknown) {
      console.error('Error updating status:', error);
      let message = 'Nao foi possivel atualizar o status.';
      if (error && typeof error === 'object' && 'message' in error) {
        message = (error as { message: string }).message;
      }
      Alert.alert('Erro', message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const doMarkArrived = async (lat?: number, lng?: number, forceOverride?: boolean) => {
    try {
      setIsUpdatingStatus(true);
      await apiClient.patch(`/service-orders/${id}/arrived`, { lat, lng, force_override: forceOverride });
      await fetchData();
    } catch (error: unknown) {
      console.error('Error marking arrival:', error);
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Não foi possível registrar a chegada.';

      // Mapeia erros comuns em mensagens amigáveis + sempre oferece override
      const msg = typeof message === 'string' ? message : '';
      let titulo = 'Não foi possível registrar chegada';
      let descricao = msg;

      if (msg.includes('m do local')) {
        titulo = 'Fora do raio de chegada';
        descricao = msg;
      } else if (!lat || !lng) {
        titulo = 'Sem GPS disponível';
        descricao = 'Não conseguimos obter sua localização. Verifique se o GPS está ligado e a permissão concedida.';
      } else if (msg.toLowerCase().includes('coordenada') || msg.toLowerCase().includes('endereço')) {
        titulo = 'OS sem endereço georreferenciado';
        descricao = 'Esta OS não tem coordenadas no cadastro. Você pode confirmar a chegada manualmente.';
      }

      Alert.alert(
        titulo,
        `${descricao}\n\nDeseja confirmar a chegada mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar mesmo assim',
            style: 'destructive',
            onPress: () => doMarkArrived(lat, lng, true),
          },
        ],
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleArrived = async () => {
    let lat: number | undefined;
    let lng: number | undefined;
    let distanceMsg = '';

    try {
      const Location = await import('expo-location');
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;

        if (order?.geo_lat && order?.geo_lng) {
          const R = 6_371_000;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(order.geo_lat - lat);
          const dLng = toRad(order.geo_lng - lng);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat)) * Math.cos(toRad(order.geo_lat)) * Math.sin(dLng / 2) ** 2;
          const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
          distanceMsg = dist < 1000
            ? `\nDistância do local: ${dist}m`
            : `\nDistância do local: ${(dist / 1000).toFixed(1)}km`;
        }
      }
    } catch {
      // GPS opcional
    }

    Alert.alert(
      'Cheguei no Local',
      `Deseja registrar sua chegada no local da OS?${distanceMsg}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => doMarkArrived(lat, lng, false) },
      ],
    );
  };

  const handleStatusAction = (newStatus: OsStatus, label: string) => {
    // Gate para finalização: exige todas as etapas concluídas e ao menos 1 foto.
    if (newStatus === OsStatus.COMPLETED) {
      const totalSteps = steps.length;
      const doneSteps = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
      const pendentes = totalSteps - doneSteps;
      const totalFotos = photos.length;

      if (totalSteps > 0 && pendentes > 0) {
        Alert.alert(
          'Etapas pendentes',
          `Você precisa concluir todas as etapas antes de finalizar (${doneSteps}/${totalSteps} concluídas).`,
          [{ text: 'OK' }],
        );
        return;
      }
      if (totalFotos < 1) {
        Alert.alert(
          'Fotos obrigatórias',
          'Envie pelo menos 1 foto antes de finalizar a OS.',
          [{ text: 'OK' }],
        );
        return;
      }
    }

    Alert.alert(
      'Confirmar',
      `Deseja ${label.toLowerCase()}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => updateStatus(newStatus),
        },
      ],
    );
  };

  // "Iniciar Deslocamento" — após confirmar, atualiza status E abre rota
  // no Google Maps. Bug reportado pela Jessica em 01/06: antes o mapa abria,
  // agora não abria mais. Voltamos a abrir explicitamente aqui.
  const handleStartDisplacement = () => {
    Alert.alert(
      'Iniciar Deslocamento',
      'Vamos atualizar a OS para "Em Andamento" e abrir a rota no Google Maps.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            await updateStatus(OsStatus.IN_PROGRESS);
            // Abrir mapa logo depois — não esperamos refetch porque o openMaps
            // só depende do endereço/coordenadas (já carregadas).
            openMaps();
          },
        },
      ],
    );
  };

  const openMaps = () => {
    if (!order) return;
    const address = [
      order.address_street,
      order.address_number,
      order.address_neighborhood,
      order.address_city,
      order.address_state,
    ]
      .filter(Boolean)
      .join(', ');

    if (order.geo_lat && order.geo_lng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${order.geo_lat},${order.geo_lng}`;
      Linking.openURL(url);
    } else if (address) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
      Linking.openURL(url);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'as' HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateStr;
    }
  };

  const formatAddress = (): string => {
    if (!order) return '';
    const parts = [
      order.address_street,
      order.address_number,
      order.address_complement,
    ].filter(Boolean);
    const line1 = parts.join(', ');
    const line2 = [
      order.address_neighborhood,
      order.address_city,
      order.address_state,
    ]
      .filter(Boolean)
      .join(' - ');
    return [line1, line2].filter(Boolean).join('\n');
  };

  const getCheckedCount = (): { checked: number; total: number } => {
    let checked = 0;
    let total = 0;
    checklists.forEach(cl => {
      cl.items.forEach(item => {
        total++;
        if (item.checked) checked++;
      });
    });
    return { checked, total };
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>OS nao encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const checklistProgress = getCheckedCount();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      {/* Offline cache banner */}
      {isFromCache && (
        <View style={{
          backgroundColor: '#78350F',
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 8,
          marginBottom: 12,
          marginHorizontal: 16,
          marginTop: 16,
        }}>
          <Ionicons name="cloud-offline-outline" size={18} color="#FCD34D" />
          <Text style={{ color: '#FCD34D', fontSize: 13 }}>
            Dados offline - podem estar desatualizados
          </Text>
        </View>
      )}

      {/* OS Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Text style={styles.orderNumber}>#{order.order_number}</Text>
          <PriorityBadge priority={order.priority} size="md" />
        </View>
        <Text style={styles.orderTitle}>{order.title}</Text>
        {order.description && (
          <Text style={styles.orderDescription}>{order.description}</Text>
        )}

        <View style={styles.divider} />

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Cliente:</Text>
            <Text style={styles.infoValue}>{order.client_name}</Text>
          </View>

          {order.client_phone && (
            <TouchableOpacity
              style={styles.infoRow}
              onPress={() =>
                Linking.openURL(`tel:${order.client_phone}`)
              }
            >
              <Ionicons name="call-outline" size={18} color={colors.primary} />
              <Text style={styles.infoLabel}>Telefone:</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {order.client_phone}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.infoRow} onPress={openMaps}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={[styles.addressText, { color: colors.primary }]}>
              {formatAddress() || 'Endereco nao informado'}
            </Text>
          </TouchableOpacity>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            <Text style={styles.infoLabel}>Agendado:</Text>
            <Text style={styles.infoValue}>
              {formatDate(order.scheduled_date)}
            </Text>
          </View>
        </View>
      </View>

      {/* Banner Perícia Técnica */}
      {order && getOsTipo(order) === 'PERICIA' && (
        <View style={{
          backgroundColor: '#EAB30815',
          borderWidth: 1,
          borderColor: '#EAB30840',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="clipboard-outline" size={20} color="#EAB308" />
            <Text style={{ color: '#EAB308', fontWeight: '700', fontSize: 14 }}>
              Vistoria Técnica de Garantia
            </Text>
          </View>
          <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 18 }}>
            Preencha o checklist de verificação técnica (temperatura, condições ambientais, patologias) e registre as evidências fotográficas de cada item.
          </Text>
          {(order.external_metadata as any)?.descricao_reclamacao && (
            <View style={{ marginTop: 8, backgroundColor: '#27272a', borderRadius: 8, padding: 10 }}>
              <Text style={{ color: '#71717a', fontSize: 10, fontWeight: '600', marginBottom: 2 }}>RECLAMAÇÃO DO CLIENTE</Text>
              <Text style={{ color: '#d4d4d8', fontSize: 12 }}>
                {(order.external_metadata as any).descricao_reclamacao}
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              const meta = order.external_metadata as Record<string, unknown> | null;
              const ticketId = (meta?.ticket_id as string | undefined) || undefined;
              const protoFromTitle = (() => {
                const m = order.title?.match(/(TK-\d{4,})/i);
                return m ? m[1].toUpperCase() : undefined;
              })();
              const ticketProtocol =
                (meta?.protocolo as string | undefined) ||
                (meta?.ticket_protocolo as string | undefined) ||
                protoFromTitle;
              navigation.navigate('Vistoria', { ticketId, ticketProtocol });
            }}
            style={{
              marginTop: 12,
              backgroundColor: '#EAB308',
              borderRadius: 10,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="clipboard" size={18} color="#000" />
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>
              Iniciar Vistoria Tecnica
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status Timeline */}
      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Status</Text>
        <StatusBadge status={order.status} size="md" />

        <View style={styles.timeline}>
          {TIMELINE_STEPS.map((step, index) => {
            const isActive = step.isReached(order);
            const previousActive =
              index === 0 || TIMELINE_STEPS[index - 1].isReached(order);
            const isCurrent = isActive && !TIMELINE_STEPS[index + 1]?.isReached(order);

            return (
              <View key={step.key} style={styles.timelineStep}>
                <View
                  style={[
                    styles.timelineDot,
                    isActive && styles.timelineDotActive,
                    isCurrent && styles.timelineDotCurrent,
                  ]}
                >
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={12}
                      color={colors.black}
                    />
                  )}
                </View>
                {index < TIMELINE_STEPS.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      previousActive && isActive && styles.timelineLineActive,
                    ]}
                  />
                )}
                <Text
                  style={[
                    styles.timelineLabel,
                    isActive && styles.timelineLabelActive,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {order.arrived_at && (
          <View style={styles.arrivedInfo}>
            <Ionicons name="location" size={14} color={colors.success} />
            <Text style={styles.arrivedText}>
              Chegou em {format(new Date(order.arrived_at), "dd/MM HH:mm", { locale: ptBR })}
            </Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Acoes</Text>

        {isUpdatingStatus ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.actionLoading}
          />
        ) : (
          <View style={styles.actionButtons}>
            {order.status === OsStatus.ASSIGNED && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleStartDisplacement}
              >
                <Ionicons name="car-outline" size={20} color={colors.black} />
                <Text style={styles.actionButtonPrimaryText}>
                  Iniciar Deslocamento
                </Text>
              </TouchableOpacity>
            )}

            {order.status === OsStatus.IN_PROGRESS && !order.arrived_at && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonInfo]}
                onPress={handleArrived}
              >
                <Ionicons name="location-outline" size={20} color={colors.white} />
                <Text style={[styles.actionButtonPrimaryText, { color: colors.white }]}>
                  Cheguei no Local
                </Text>
              </TouchableOpacity>
            )}

            {/* GATE SEQUENCIAL — IN_PROGRESS:
                1. Cheguei no Local (acima)
                2. Etapas (navega pra Steps) — só após chegar
                3. Capturar Assinatura — só após TODAS as etapas concluídas
                4. Finalizar Serviço — só após assinatura capturada
                Pausar fica disponível durante todo o IN_PROGRESS. */}
            {order.status === OsStatus.IN_PROGRESS && order.arrived_at && (() => {
              const totalSteps = steps.length;
              const doneSteps = steps.filter(
                (s) => s.status === 'completed' || s.status === 'skipped'
              ).length;
              const allStepsDone = totalSteps > 0 && doneSteps >= totalSteps;
              const hasSignature = photos.some((p) => p.type === 'signature');

              return (
                <>
                  {!allStepsDone && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonInfo]}
                      onPress={() =>
                        navigation.navigate('Steps', { serviceOrderId: id })
                      }
                    >
                      <Ionicons name="list-outline" size={20} color={colors.white} />
                      <Text
                        style={[styles.actionButtonPrimaryText, { color: colors.white }]}
                      >
                        Executar Etapas ({doneSteps}/{totalSteps || '?'})
                      </Text>
                    </TouchableOpacity>
                  )}

                  {allStepsDone && !hasSignature && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.info }]}
                      onPress={() =>
                        navigation.navigate('Signature', { serviceOrderId: id })
                      }
                    >
                      <Ionicons name="pencil-outline" size={20} color={colors.white} />
                      <Text
                        style={[styles.actionButtonPrimaryText, { color: colors.white }]}
                      >
                        Capturar Assinatura
                      </Text>
                    </TouchableOpacity>
                  )}

                  {allStepsDone && hasSignature && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonSuccess]}
                      onPress={() =>
                        handleStatusAction(OsStatus.COMPLETED, 'Finalizar Servico')
                      }
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color={colors.black}
                      />
                      <Text style={styles.actionButtonPrimaryText}>
                        Finalizar Servico
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}

            {order.status === OsStatus.IN_PROGRESS && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonWarning]}
                onPress={() =>
                  handleStatusAction(OsStatus.PAUSED, 'Pausar Servico')
                }
              >
                <Ionicons name="pause-outline" size={20} color={colors.black} />
                <Text style={styles.actionButtonPrimaryText}>
                  Pausar Servico
                </Text>
              </TouchableOpacity>
            )}

            {order.status === OsStatus.PAUSED && (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={() =>
                  handleStatusAction(OsStatus.IN_PROGRESS, 'Retomar Servico')
                }
              >
                <Ionicons name="play-outline" size={20} color={colors.black} />
                <Text style={styles.actionButtonPrimaryText}>
                  Retomar Servico
                </Text>
              </TouchableOpacity>
            )}

            {/* Em COMPLETED, manter possibilidade de re-capturar assinatura
                caso precise (uso técnico raro, mas mantém compat). */}
            {order.status === OsStatus.COMPLETED && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.info }]}
                onPress={() =>
                  navigation.navigate('Signature', { serviceOrderId: id })
                }
              >
                <Ionicons name="pencil-outline" size={20} color={colors.white} />
                <Text style={[styles.actionButtonPrimaryText, { color: colors.white }]}>
                  Capturar Assinatura
                </Text>
              </TouchableOpacity>
            )}

            {(order.status === OsStatus.PENDING ||
              order.status === OsStatus.CANCELLED) && (
              <Text style={styles.noActionsText}>
                Nenhuma acao disponivel para este status.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Itens da OS (read-only) */}
      {items.length > 0 && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="cube-outline" size={22} color={colors.primary} />
              <Text style={styles.sectionTitle}>Itens da OS</Text>
            </View>
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </Text>
          </View>
          <View style={{ marginTop: 8, gap: 8 }}>
            {items.map((it) => (
              <View
                key={it.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: colors.background,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: it.kind === 'S' ? '#1E3A8A' : '#581C87',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                      {it.kind === 'S' ? 'SERV' : 'PROD'}
                    </Text>
                  </View>
                  {it.identification && (
                    <Text style={{ ...typography.caption, color: colors.textMuted }}>
                      #{it.identification}
                    </Text>
                  )}
                </View>
                <Text style={{ ...typography.bodySmBold, color: colors.text }}>
                  {it.description}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>
                    {Number(it.quantity)} {it.unit || ''} x {formatBRL(it.unit_value)}
                  </Text>
                  <Text style={{ ...typography.bodySmBold, color: colors.primary }}>
                    {formatBRL(it.total)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Etapas Obrigatórias da Execução */}
      {(order.status === OsStatus.IN_PROGRESS ||
        order.status === OsStatus.PAUSED ||
        order.status === OsStatus.COMPLETED) && (
        <TouchableOpacity
          style={[styles.sectionCard, !order.arrived_at && order.status === OsStatus.IN_PROGRESS && styles.sectionCardDisabled]}
          onPress={() => {
            if (!order.arrived_at && order.status === OsStatus.IN_PROGRESS) {
              Alert.alert(
                'Registre sua chegada',
                'Antes de iniciar a execução, registre que chegou no local.',
              );
              return;
            }
            navigation.navigate('Steps', { serviceOrderId: id });
          }}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons
                name="list-outline"
                size={22}
                color={colors.primary}
              />
              <Text style={styles.sectionTitle}>Etapas da Execução</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textDark}
            />
          </View>
          <Text style={styles.noDataText}>
            {order.arrived_at
              ? 'Toque para ver as etapas obrigatórias'
              : 'Registre sua chegada primeiro'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Checklist Section (legado — útil para perícia técnica) */}
      <TouchableOpacity
        style={styles.sectionCard}
        onPress={() =>
          navigation.navigate('Checklist', {
            serviceOrderId: id,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons
              name="checkbox-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Checklist</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textDark}
          />
        </View>

        {checklistProgress.total > 0 ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      (checklistProgress.checked / checklistProgress.total) * 100
                    }%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {checklistProgress.checked}/{checklistProgress.total} itens
            </Text>
          </View>
        ) : (
          <Text style={styles.noDataText}>Nenhum checklist</Text>
        )}
      </TouchableOpacity>

      {/* Projetos Section — anexos do admin (PDF/imagem), técnico só visualiza */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="document-text-outline" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>Projetos</Text>
          </View>
        </View>

        {projects.length === 0 ? (
          <Text style={styles.noDataText}>
            Nenhum projeto anexado pelo administrador.
          </Text>
        ) : (
          <View>
            {projects.map((p) => {
              const isPdf = p.mime_type === 'application/pdf';
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.projectRow}
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(p.file_url)}
                >
                  <Ionicons
                    name={isPdf ? 'document-text' : 'image'}
                    size={20}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {p.file_name ?? 'Arquivo'}
                    </Text>
                    <Text style={styles.projectMeta}>
                      {isPdf ? 'PDF' : 'Imagem'}
                      {p.size_bytes ? ` · ${Math.round(p.size_bytes / 1024)} KB` : ''}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.textDark} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Map Section */}
      <TouchableOpacity
        style={styles.sectionCard}
        onPress={openMaps}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons
              name="map-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Mapa</Text>
          </View>
          <Ionicons
            name="open-outline"
            size={18}
            color={colors.textDark}
          />
        </View>
        <Text style={styles.mapHint}>
          Toque para abrir no Google Maps
        </Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  infoCard: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  orderTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  orderDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  infoSection: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  addressText: {
    ...typography.bodySm,
    flex: 1,
  },
  timelineCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 12,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timelineStep: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineDotActive: {
    backgroundColor: colors.primary,
  },
  timelineDotCurrent: {
    borderWidth: 3,
    borderColor: colors.primaryLight,
  },
  timelineLine: {
    position: 'absolute',
    top: 11,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: colors.border,
  },
  timelineLineActive: {
    backgroundColor: colors.primary,
  },
  timelineLabel: {
    ...typography.tiny,
    color: colors.textDark,
    marginTop: 6,
    textAlign: 'center',
  },
  timelineLabelActive: {
    color: colors.text,
  },
  actionsCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLoading: {
    paddingVertical: 16,
  },
  actionButtons: {
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonWarning: {
    backgroundColor: colors.warning,
  },
  actionButtonSuccess: {
    backgroundColor: colors.success,
  },
  actionButtonInfo: {
    backgroundColor: colors.info,
  },
  arrivedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  arrivedText: {
    ...typography.caption,
    color: colors.success,
  },
  actionButtonPrimaryText: {
    ...typography.button,
    color: colors.black,
  },
  noActionsText: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  sectionCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionCardDisabled: {
    opacity: 0.55,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressContainer: {
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  progressText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  noDataText: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 4,
  },
  photoGrid: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  projectName: {
    ...typography.bodySm,
    color: colors.text,
    fontWeight: '600',
  },
  projectMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  photoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoMore: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoMoreText: {
    ...typography.bodySmBold,
    color: colors.textMuted,
  },
  mapHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  bottomSpacer: {
    height: 32,
  },
});
