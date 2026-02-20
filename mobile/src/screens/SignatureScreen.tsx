import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { uploadFile } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type SignatureRoute = RouteProp<OsStackParamList, 'Signature'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CANVAS_WIDTH = SCREEN_WIDTH - 32;
const CANVAS_HEIGHT = 300;

// ============================================================
// Component
// ============================================================

export function SignatureScreen() {
  const route = useRoute<SignatureRoute>();
  const navigation = useNavigation();
  const { serviceOrderId } = route.params;

  const viewShotRef = useRef<ViewShot>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(`M${locationX},${locationY}`);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(prev => `${prev} L${locationX},${locationY}`);
      },
      onPanResponderRelease: () => {
        if (currentPath) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath('');
        }
      },
    }),
  ).current;

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
  };

  const handleSave = async () => {
    if (paths.length === 0) {
      Alert.alert('Aviso', 'Desenhe a assinatura antes de salvar.');
      return;
    }

    try {
      setIsUploading(true);

      // Capture the signature canvas as PNG
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // Upload as photo with type 'signature'
      await uploadFile({
        path: '/photos/upload',
        file: {
          uri,
          type: 'image/png',
          name: `signature_${Date.now()}.png`,
        },
        fields: {
          service_order_id: serviceOrderId,
          type: 'signature',
          description: 'Assinatura do cliente',
        },
      });

      Alert.alert('Sucesso', 'Assinatura capturada com sucesso!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error uploading signature:', error);
      Alert.alert('Erro', 'Nao foi possivel salvar a assinatura.');
    } finally {
      setIsUploading(false);
    }
  };

  const hasSignature = paths.length > 0 || currentPath.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.container}>
        {/* Instructions */}
        <View style={styles.instructionBox}>
          <Ionicons name="finger-print-outline" size={20} color={colors.primary} />
          <Text style={styles.instructionText}>
            Peca ao cliente para assinar no espaco abaixo
          </Text>
        </View>

        {/* Signature Canvas */}
        <View style={styles.canvasWrapper}>
          <ViewShot ref={viewShotRef} style={styles.canvas}>
            <View
              style={styles.canvasInner}
              {...panResponder.panHandlers}
            >
              <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                {paths.map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    stroke={colors.text}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={colors.text}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </Svg>

              {/* Signature line */}
              <View style={styles.signatureLine} />

              {/* Placeholder text */}
              {!hasSignature && (
                <View style={styles.placeholderContainer}>
                  <Text style={styles.placeholderText}>
                    Assine aqui
                  </Text>
                </View>
              )}
            </View>
          </ViewShot>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={handleClear}
            disabled={!hasSignature || isUploading}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.buttonText, { color: colors.danger }]}>
              Limpar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={!hasSignature || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={colors.black} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.black} />
                <Text style={[styles.buttonText, { color: colors.black }]}>
                  Salvar Assinatura
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructionText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  canvasWrapper: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  canvas: {
    backgroundColor: colors.white,
    borderRadius: 10,
  },
  canvasInner: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    position: 'relative',
  },
  signatureLine: {
    position: 'absolute',
    bottom: 60,
    left: 30,
    right: 30,
    height: 1,
    backgroundColor: '#D4D4D8',
  },
  placeholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    ...typography.body,
    color: '#A1A1AA',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    flex: 1,
  },
  clearButton: {
    backgroundColor: colors.danger + '15',
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    ...typography.button,
  },
});
