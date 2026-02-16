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
import {
  ServiceOrder,
  OsStatus,
  Checklist,
  Photo,
  OS_STATUS_LABELS,
} from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type DetailRoute = RouteProp<OsStackParamList, 'OsDetail'>;
type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

const STATUS_STEPS: OsStatus[] = [
  OsStatus.ASSIGNED,
  OsStatus.IN_PROGRESS,
  OsStatus.COMPLETED,
];

export function OsDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<NavigationProp>();
  const { id } = route.params;

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [orderData, checklistData, photoData] = await Promise.all([
        apiClient.get<ServiceOrder>(`/service-orders/${id}`),
        apiClient.get<Checklist[]>(`/service-orders/${id}/checklists`),
        apiClient.get<Photo[]>(`/service-orders/${id}/photos`),
      ]);
      setOrder(orderData);
      setChecklists(checklistData);
      setPhotos(photoData);
      setIsFromCache(false);

      // Cache the full detail for offline use
      await offlineStorage.saveOsDetail(id, {
        order: orderData,
        checklists: checklistData,
        photos: photoData,
      });
    } catch (error) {
      console.error('Error fetching OS detail:', error);

      // If offline, try loading from cache
      if (!isDeviceOnline()) {
        try {
          const cached = await offlineStorage.getOsDetail(id) as {
            order: ServiceOrder;
            checklists: Checklist[];
            photos: Photo[];
          } | null;
          if (cached) {
            setOrder(cached.order);
            setChecklists(cached.checklists ?? []);
            setPhotos(cached.photos ?? []);
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
      await apiClient.patch(`/service-orders/${id}/status`, {
        status: newStatus,
        notes,
      });
      await fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Erro', 'Nao foi possivel atualizar o status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStatusAction = (newStatus: OsStatus, label: string) => {
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

      {/* Status Timeline */}
      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Status</Text>
        <StatusBadge status={order.status} size="md" />

        <View style={styles.timeline}>
          {STATUS_STEPS.map((step, index) => {
            const stepIndex = STATUS_STEPS.indexOf(order.status);
            const currentIndex = STATUS_STEPS.indexOf(step);
            const isActive = currentIndex <= stepIndex;
            const isCurrent = step === order.status;

            return (
              <View key={step} style={styles.timelineStep}>
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
                {index < STATUS_STEPS.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      isActive && styles.timelineLineActive,
                    ]}
                  />
                )}
                <Text
                  style={[
                    styles.timelineLabel,
                    isActive && styles.timelineLabelActive,
                  ]}
                >
                  {OS_STATUS_LABELS[step]}
                </Text>
              </View>
            );
          })}
        </View>
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
                onPress={() =>
                  handleStatusAction(OsStatus.IN_PROGRESS, 'Iniciar Deslocamento')
                }
              >
                <Ionicons name="car-outline" size={20} color={colors.black} />
                <Text style={styles.actionButtonPrimaryText}>
                  Iniciar Deslocamento
                </Text>
              </TouchableOpacity>
            )}

            {order.status === OsStatus.IN_PROGRESS && (
              <>
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
              </>
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

            {(order.status === OsStatus.PENDING ||
              order.status === OsStatus.COMPLETED ||
              order.status === OsStatus.CANCELLED) && (
              <Text style={styles.noActionsText}>
                Nenhuma acao disponivel para este status.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Checklist Section */}
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

      {/* Photos Section */}
      <TouchableOpacity
        style={styles.sectionCard}
        onPress={() =>
          navigation.navigate('Camera', {
            serviceOrderId: id,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons
              name="camera-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Fotos</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textDark}
          />
        </View>

        {photos.length > 0 ? (
          <View style={styles.photoGrid}>
            {photos.slice(0, 4).map(photo => (
              <View key={photo.id} style={styles.photoThumbnail}>
                <Image
                  source={{ uri: photo.thumbnail_url || photo.url }}
                  style={styles.photoImage}
                  resizeMode="cover"
                />
              </View>
            ))}
            {photos.length > 4 && (
              <View style={styles.photoMore}>
                <Text style={styles.photoMoreText}>
                  +{photos.length - 4}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.noDataText}>Nenhuma foto</Text>
        )}
      </TouchableOpacity>

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
