import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  FlatList,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { apiClient, isDeviceOnline, queueOfflineAction } from '../lib/api';
import { useSyncStore } from '../lib/sync-manager';
import {
  Photo,
  PhotoType,
  PHOTO_TYPE_LABELS,
} from '../lib/types';
import { OfflineBanner } from '../components/OfflineBanner';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type CameraRoute = RouteProp<OsStackParamList, 'Camera'>;

const PHOTO_TYPES: { key: PhotoType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: PhotoType.BEFORE, label: 'Antes', icon: 'image-outline' },
  { key: PhotoType.DURING, label: 'Durante', icon: 'construct-outline' },
  { key: PhotoType.AFTER, label: 'Depois', icon: 'checkmark-circle-outline' },
  { key: PhotoType.ISSUE, label: 'Problema', icon: 'warning-outline' },
];

export function CameraScreen() {
  const route = useRoute<CameraRoute>();
  const navigation = useNavigation();
  const { serviceOrderId } = route.params;

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<PhotoType>(PhotoType.BEFORE);
  const [showModal, setShowModal] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    fetchPhotos();
    requestLocationPermission();
  }, []);

  const fetchPhotos = async () => {
    try {
      const data = await apiClient.get<Photo[]>(
        `/service-orders/${serviceOrderId}/photos`,
      );
      setPhotos(data);
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissao necessaria',
          'O app precisa de acesso a camera para tirar fotos.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedUri(result.assets[0].uri);
        setShowModal(true);

        // Update location on capture
        try {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        } catch {
          // Location might not be available
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Erro', 'Nao foi possivel tirar a foto.');
    }
  };

  const pickFromGallery = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissao necessaria',
          'O app precisa de acesso a galeria para selecionar fotos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedUri(result.assets[0].uri);
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert('Erro', 'Nao foi possivel selecionar a foto.');
    }
  };

  const uploadPhoto = async () => {
    if (!capturedUri) return;

    try {
      setIsUploading(true);

      const filename = capturedUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const fields: Record<string, string> = {
        type: selectedType,
      };

      if (description.trim()) {
        fields.description = description.trim();
      }

      if (location) {
        fields.geo_lat = String(location.latitude);
        fields.geo_lng = String(location.longitude);
      }

      if (!isDeviceOnline()) {
        // Queue photo for upload when online
        await queueOfflineAction({
          type: 'photo_upload',
          endpoint: `/service-orders/${serviceOrderId}/photos`,
          method: 'POST',
          fileUri: capturedUri,
          fileFields: fields,
          fileName: filename,
          fileType: type,
        });

        setShowModal(false);
        setCapturedUri(null);
        setDescription('');

        Alert.alert(
          'Foto salva para envio posterior',
          'A foto sera enviada automaticamente quando a conexao for restaurada.',
        );
        return;
      }

      await apiClient.upload(
        `/service-orders/${serviceOrderId}/photos`,
        { uri: capturedUri, type, name: filename },
        fields,
      );

      setShowModal(false);
      setCapturedUri(null);
      setDescription('');
      await fetchPhotos();

      Alert.alert('Sucesso', 'Foto enviada com sucesso.');
    } catch (error) {
      console.error('Error uploading photo:', error);
      // Fallback: queue for later upload on network error
      try {
        const filename = capturedUri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        const fields: Record<string, string> = { type: selectedType };
        if (description.trim()) fields.description = description.trim();
        if (location) {
          fields.geo_lat = String(location.latitude);
          fields.geo_lng = String(location.longitude);
        }

        await queueOfflineAction({
          type: 'photo_upload',
          endpoint: `/service-orders/${serviceOrderId}/photos`,
          method: 'POST',
          fileUri: capturedUri,
          fileFields: fields,
          fileName: filename,
          fileType: type,
        });

        setShowModal(false);
        setCapturedUri(null);
        setDescription('');

        Alert.alert(
          'Foto salva para envio posterior',
          'A foto sera enviada automaticamente quando a conexao for restaurada.',
        );
      } catch {
        Alert.alert('Erro', 'Nao foi possivel enviar a foto.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const getPhotoTypeColor = (type: PhotoType): string => {
    switch (type) {
      case PhotoType.BEFORE:
        return colors.info;
      case PhotoType.DURING:
        return colors.warning;
      case PhotoType.AFTER:
        return colors.success;
      case PhotoType.ISSUE:
        return colors.danger;
      default:
        return colors.textMuted;
    }
  };

  const renderPhoto = ({ item }: { item: Photo }) => (
    <View style={styles.photoCard}>
      <Image
        source={{ uri: item.thumbnail_url || item.url }}
        style={styles.photoImage}
        resizeMode="cover"
      />
      <View style={styles.photoInfo}>
        <View
          style={[
            styles.photoTypeBadge,
            { backgroundColor: getPhotoTypeColor(item.type) + '20' },
          ]}
        >
          <Text
            style={[
              styles.photoTypeText,
              { color: getPhotoTypeColor(item.type) },
            ]}
          >
            {PHOTO_TYPE_LABELS[item.type]}
          </Text>
        </View>
        {item.description && (
          <Text style={styles.photoDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
    </View>
  );

  const pendingCount = useSyncStore(s => s.pendingCount);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <View style={styles.container}>
      {/* Offline indicator */}
      <OfflineBanner />

      {/* Pending upload indicator */}
      {pendingCount > 0 && isDeviceOnline() && (
        <View style={styles.pendingBar}>
          <Ionicons name="cloud-upload-outline" size={14} color={colors.warning} />
          <Text style={styles.pendingBarText}>
            {pendingCount} {pendingCount === 1 ? 'envio pendente' : 'envios pendentes'}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePhoto}
          activeOpacity={0.8}
        >
          <Ionicons name="camera" size={24} color={colors.black} />
          <Text style={styles.captureButtonText}>Tirar Foto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.galleryButton}
          onPress={pickFromGallery}
          activeOpacity={0.8}
        >
          <Ionicons name="images-outline" size={24} color={colors.primary} />
          <Text style={styles.galleryButtonText}>Galeria</Text>
        </TouchableOpacity>
      </View>

      {/* Photos List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item.id}
          renderItem={renderPhoto}
          numColumns={2}
          columnWrapperStyle={styles.photoRow}
          contentContainerStyle={
            photos.length === 0
              ? styles.emptyContainer
              : styles.photoList
          }
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Ionicons
                name="camera-outline"
                size={48}
                color={colors.textDark}
              />
              <Text style={styles.emptyTitle}>Nenhuma foto</Text>
              <Text style={styles.emptyMessage}>
                Tire fotos do servico para documentar.
              </Text>
            </View>
          }
        />
      )}

      {/* Upload Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowModal(false);
          setCapturedUri(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enviar Foto</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setCapturedUri(null);
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {capturedUri && (
              <Image
                source={{ uri: capturedUri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}

            {/* Photo Type Selector */}
            <Text style={styles.fieldLabel}>Tipo da Foto</Text>
            <View style={styles.typeSelector}>
              {PHOTO_TYPES.map(pt => (
                <TouchableOpacity
                  key={pt.key}
                  style={[
                    styles.typeOption,
                    selectedType === pt.key && styles.typeOptionActive,
                  ]}
                  onPress={() => setSelectedType(pt.key)}
                >
                  <Ionicons
                    name={pt.icon}
                    size={18}
                    color={
                      selectedType === pt.key
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.typeOptionText,
                      selectedType === pt.key &&
                        styles.typeOptionTextActive,
                    ]}
                  >
                    {pt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.fieldLabel}>Descricao (opcional)</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Descreva a foto..."
              placeholderTextColor={colors.textDark}
              multiline
            />

            {/* Location indicator */}
            {location && (
              <View style={styles.locationRow}>
                <Ionicons
                  name="location"
                  size={14}
                  color={colors.success}
                />
                <Text style={styles.locationText}>
                  Localizacao capturada
                </Text>
              </View>
            )}

            {/* Upload Button */}
            <TouchableOpacity
              style={[
                styles.uploadButton,
                isUploading && styles.uploadButtonDisabled,
              ]}
              onPress={uploadPhoto}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={20}
                    color={colors.black}
                  />
                  <Text style={styles.uploadButtonText}>Enviar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: colors.warning + '15',
  },
  pendingBarText: {
    ...typography.tiny,
    color: colors.warning,
  },
  actionsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  captureButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  captureButtonText: {
    ...typography.button,
    color: colors.black,
  },
  galleryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  galleryButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
    marginTop: 16,
  },
  emptyMessage: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 8,
  },
  photoList: {
    padding: 16,
    paddingTop: 0,
  },
  photoRow: {
    gap: 12,
    marginBottom: 12,
  },
  photoCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoImage: {
    width: '100%',
    aspectRatio: 1,
  },
  photoInfo: {
    padding: 8,
  },
  photoTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  photoTypeText: {
    ...typography.tiny,
    fontWeight: '600',
  },
  photoDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  fieldLabel: {
    ...typography.bodySmBold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  typeOptionText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
  },
  typeOptionTextActive: {
    color: colors.primary,
  },
  descriptionInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    ...typography.bodySm,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  locationText: {
    ...typography.caption,
    color: colors.success,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  uploadButtonDisabled: {
    opacity: 0.7,
  },
  uploadButtonText: {
    ...typography.button,
    color: colors.black,
  },
});
