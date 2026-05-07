import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  PanResponder,
  Dimensions,
  ScrollView,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { apiClient, uploadFile } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type SignatureRoute = RouteProp<OsStackParamList, 'Signature'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CANVAS_WIDTH = SCREEN_WIDTH - 32;
const CANVAS_HEIGHT = 240;

const DEFAULT_TERMS = `TERMO DE CONCLUSÃO DE SERVIÇO E ENTREGA

Declaro que recebi os serviços contratados na presente Ordem de Serviço, conferindo:

• Material instalado/aplicado conforme especificado
• Quantidade e dimensões executadas
• Limpeza do local após o serviço
• Funcionamento e acabamento do produto entregue

Estou ciente que a Reallliza Revestimentos cumpriu as condições contratadas e que eventuais ajustes ou revisões devem ser solicitados pelos canais oficiais.

Ao assinar abaixo, autorizo o registro digital desta assinatura como aceite do serviço executado.`;

interface OsDetailLite {
  id: string;
  completion_terms?: string | null;
  client_name?: string | null;
}

// ============================================================
// Component
// ============================================================

export function SignatureScreen() {
  const route = useRoute<SignatureRoute>();
  const navigation = useNavigation();
  const { serviceOrderId } = route.params;
  const profile = useAuthStore((s) => s.profile);

  const viewShotRef = useRef<ViewShot>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsText, setTermsText] = useState<string>(DEFAULT_TERMS);
  const [clientName, setClientName] = useState<string>('');

  const currentPathRef = useRef<string>('');

  // Carrega termo personalizado da OS (se admin tiver definido) e nome do cliente.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<OsDetailLite>(`/service-orders/${serviceOrderId}`)
      .then((os) => {
        if (cancelled) return;
        if (os?.completion_terms && os.completion_terms.trim()) {
          setTermsText(os.completion_terms);
        }
        if (os?.client_name) {
          setClientName(os.client_name);
        }
      })
      .catch(() => {
        // mantém o default
      });
    return () => {
      cancelled = true;
    };
  }, [serviceOrderId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        currentPathRef.current = newPath;
        setCurrentPath(newPath);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        const segment = ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        currentPathRef.current += segment;
        setCurrentPath(currentPathRef.current);
      },
      onPanResponderRelease: () => {
        const pathToSave = currentPathRef.current;
        if (pathToSave) {
          setPaths((prev) => [...prev, pathToSave]);
        }
        currentPathRef.current = '';
        setCurrentPath('');
      },
    }),
  ).current;

  const handleClear = useCallback(() => {
    setPaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
  }, []);

  const handleSave = async () => {
    if (!accepted) {
      Alert.alert(
        'Aceite necessário',
        'O cliente precisa marcar "Li e aceito o termo" antes de assinar.',
      );
      return;
    }
    if (paths.length === 0) {
      Alert.alert('Aviso', 'Desenhe a assinatura antes de salvar.');
      return;
    }

    try {
      setIsUploading(true);

      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // Sobe assinatura como photo type=signature
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

      // Persiste snapshot do termo aceito + timestamp na OS
      try {
        await apiClient.put(`/service-orders/${serviceOrderId}`, {
          terms_accepted_text: termsText,
          terms_accepted_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Não foi possível gravar terms_accepted', err);
      }

      Alert.alert('Sucesso', 'Assinatura e termo registrados!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error uploading signature:', error);
      Alert.alert('Erro', 'Não foi possível salvar a assinatura.');
    } finally {
      setIsUploading(false);
    }
  };

  const hasSignature = paths.length > 0 || currentPath.length > 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top']}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header instrução */}
        <View style={styles.headerBox}>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={colors.primary}
          />
          <Text style={styles.headerText}>
            Leia o termo abaixo, marque o aceite e peça ao cliente para assinar.
          </Text>
        </View>

        {/* Termo de conclusão */}
        <View style={styles.termsBox}>
          <Text style={styles.termsText}>{termsText}</Text>
        </View>

        {clientName ? (
          <View style={styles.clientBox}>
            <Text style={styles.clientLabel}>Cliente:</Text>
            <Text style={styles.clientName}>{clientName}</Text>
          </View>
        ) : null}

        {/* Aceite */}
        <TouchableOpacity
          style={styles.acceptRow}
          onPress={() => setAccepted((v) => !v)}
          activeOpacity={0.7}
        >
          <View
            style={[styles.checkbox, accepted && styles.checkboxChecked]}
          >
            {accepted && (
              <Ionicons name="checkmark" size={16} color={colors.black} />
            )}
          </View>
          <Text style={styles.acceptText}>
            Li e aceito o termo de conclusão de serviço acima.
          </Text>
        </TouchableOpacity>

        {/* Canvas */}
        <View style={styles.canvasWrapper}>
          <ViewShot ref={viewShotRef} style={styles.canvas}>
            <View
              style={styles.canvasInner}
              {...panResponder.panHandlers}
            >
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                  {paths.map((d, i) => (
                    <Path
                      key={i}
                      d={d}
                      stroke="#111"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPath ? (
                    <Path
                      d={currentPath}
                      stroke="#111"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>
              </View>

              <View style={styles.signatureLine} pointerEvents="none" />

              {!hasSignature && (
                <View
                  style={styles.placeholderContainer}
                  pointerEvents="none"
                >
                  <Text style={styles.placeholderText}>Assine aqui</Text>
                </View>
              )}
            </View>
          </ViewShot>
        </View>

        {/* Ações */}
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
            style={[
              styles.button,
              styles.saveButton,
              (!accepted || !hasSignature) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={!accepted || !hasSignature || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={colors.black} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={colors.black}
                />
                <Text style={[styles.buttonText, { color: colors.black }]}>
                  Salvar Assinatura
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  termsBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  termsText: {
    ...typography.bodySm,
    color: colors.text,
    lineHeight: 20,
  },
  clientBox: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  clientLabel: {
    ...typography.captionBold,
    color: colors.textMuted,
  },
  clientName: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  acceptText: {
    ...typography.bodySm,
    color: colors.text,
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
    bottom: 50,
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
    marginTop: 16,
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
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...typography.button,
  },
});
