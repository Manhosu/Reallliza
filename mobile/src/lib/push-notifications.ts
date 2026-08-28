import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Vibration } from 'react-native';
import { apiClient } from './api';

// ============================================================
// Configure notification handler (foreground behavior)
// ============================================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ============================================================
// Register for push notifications
// ============================================================

/** Guardado para conseguir desvincular o aparelho no logout. */
let ultimoToken: string | null = null;

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log(
      '[PushNotifications] Must use physical device for push notifications',
    );
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[PushNotifications] Permission not granted');
      return null;
    }

    // Android: configure notification channels
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Padrao',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EAB308',
      });
      // Canal de eventos operacionais críticos: nova proposta, OS atribuída,
      // alterações urgentes, mensagem. Som customizado "Realliza".
      //
      // Jessica 27/08: "o som não funciona" — canal do Android é IMUTÁVEL
      // por id depois de criado no aparelho. Este canal nasceu em 20/05 com
      // um WAV placeholder de ~700ms de silêncio (o áudio de verdade só
      // chegou em 30/07, no mesmo id) — em todo aparelho que já tinha o app
      // instalado antes disso, setNotificationChannelAsync vira um no-op
      // pro som: nenhuma atualização de app resolve, só desinstalar e
      // reinstalar. Renomeado o id pra forçar um canal novo, criado do zero
      // já com o som certo, em qualquer aparelho (novo ou antigo).
      await Notifications.setNotificationChannelAsync('realliza-urgent-v2', {
        name: 'Reallliza — Eventos Urgentes',
        description:
          'Alertas com som identitario para propostas, OS atribuidas, mensagens e mudancas criticas.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        lightColor: '#EAB308',
        sound: 'realliza',
        bypassDnd: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    // Get Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId as string,
    });

    const token = tokenData.data;
    ultimoToken = token;
    console.log('[PushNotifications] Token:', token);

    // A rota exige sessao. Quem chama e' responsavel por so' registrar depois
    // do login — ver App.tsx. Antes isso rodava na abertura do app e o 401
    // era engolido aqui, o que deixava device_tokens vazio em producao e
    // nenhuma notificacao chegava ao aparelho.
    try {
      await apiClient.post('/notifications/register-device', {
        token,
        platform: Platform.OS,
      });
      console.log('[PushNotifications] Token registered with backend');
    } catch (error) {
      console.error(
        '[PushNotifications] Failed to register token with backend:',
        error,
      );
      return null;
    }

    return token;
  } catch (error) {
    console.error('[PushNotifications] Registration error:', error);
    return null;
  }
}

/**
 * Desvincula o aparelho do usuario que esta saindo.
 *
 * Sem isso o token continua apontando para o usuario anterior, e a proxima
 * pessoa a usar o mesmo aparelho recebe as notificacoes dele.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!ultimoToken) return;
  try {
    await apiClient.delete('/notifications/remove-device', {
      token: ultimoToken,
    });
    console.log('[PushNotifications] Token removido do backend');
  } catch (error) {
    console.error('[PushNotifications] Falha ao remover token:', error);
  } finally {
    ultimoToken = null;
  }
}

// ============================================================
// Notification Data Types
// ============================================================

interface NotificationData {
  type?:
    | 'os_assigned'
    | 'os_status_changed'
    | 'schedule_reminder'
    | 'tool_custody'
    | 'message'
    | 'proposal_available'
    | 'proposal_accepted'
    | 'warranty_opened';
  os_id?: string;
  service_order_id?: string;
  proposal_id?: string;
  warranty_id?: string;
  [key: string]: unknown;
}

// ============================================================
// Setup notification tap listeners
// ============================================================

export function setupNotificationListeners(
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void } | null,
): { remove: () => void } {
  // Handle notification tapped while app is in background/closed
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content
        .data as NotificationData;

      if (!navigation || !data?.type) return;

      switch (data.type) {
        case 'os_assigned':
        case 'os_status_changed': {
          const osId = data.os_id || data.service_order_id;
          if (osId) {
            navigation.navigate('OSTab', undefined);
            // Small delay to let the tab activate, then navigate to detail
            setTimeout(() => {
              navigation.navigate('OsDetail', { id: osId });
            }, 100);
          }
          break;
        }

        case 'schedule_reminder':
          navigation.navigate('AgendaTab', undefined);
          break;

        case 'tool_custody':
          navigation.navigate('ToolsTab', undefined);
          break;

        case 'message': {
          const osId = data.os_id || data.service_order_id;
          if (osId) {
            navigation.navigate('OSTab', undefined);
            setTimeout(() => {
              navigation.navigate('OsDetail', { id: osId, openChat: true });
            }, 100);
          }
          break;
        }

        case 'proposal_available':
        case 'proposal_accepted':
          navigation.navigate('ProposalsTab', undefined);
          break;

        case 'warranty_opened': {
          const warrantyId = data.warranty_id;
          if (warrantyId) {
            navigation.navigate('GarantiasTab', undefined);
            setTimeout(() => {
              navigation.navigate('GarantiasList', { warrantyId });
            }, 100);
          }
          break;
        }
      }
    });

  // Handle notification received while app is in foreground.
  // iOS não dispara o som customizado automaticamente nem vibra quando
  // o app está em foreground — disparamos Haptics aqui pra suprir.
  const receivedSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as NotificationData & {
        priority?: 'low' | 'normal' | 'high' | 'urgent';
      };
      const isLoud = data?.priority === 'high' || data?.priority === 'urgent';
      console.log(
        '[PushNotifications] Notification received in foreground:',
        notification.request.content.title,
        'priority=',
        data?.priority,
      );
      if (isLoud) {
        // iOS não vibra automaticamente em foreground. Garante feedback
        // tátil mesmo no app aberto.
        try {
          Vibration.vibrate(
            data?.priority === 'urgent' ? [0, 500, 200, 500] : [0, 300, 150, 300],
          );
        } catch {
          /* ignore */
        }
      }
    });

  return {
    remove: () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    },
  };
}
