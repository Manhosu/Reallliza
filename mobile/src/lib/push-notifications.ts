import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
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

    // Android: configure notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Padrao',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EAB308',
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
    console.log('[PushNotifications] Token:', token);

    // Send token to backend
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
    }

    return token;
  } catch (error) {
    console.error('[PushNotifications] Registration error:', error);
    return null;
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
    | 'tool_custody';
  os_id?: string;
  service_order_id?: string;
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
      }
    });

  // Handle notification received while app is in foreground (optional logging)
  const receivedSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      console.log(
        '[PushNotifications] Notification received in foreground:',
        notification.request.content.title,
      );
    });

  return {
    remove: () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    },
  };
}
