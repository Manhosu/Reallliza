import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncManager } from './src/lib/sync-manager';
import {
  registerForPushNotifications,
  setupNotificationListeners,
} from './src/lib/push-notifications';
import { RootNavigation } from './src/navigation';

export default function App() {
  const navigationRef = useRef<{
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  } | null>(null);

  useEffect(() => {
    // Initialize offline sync manager
    syncManager.init();

    // Register for push notifications
    registerForPushNotifications();

    // Setup notification tap listeners
    const subscription = setupNotificationListeners(navigationRef.current);

    return () => {
      subscription.remove();
      syncManager.destroy();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#09090B" />
      <RootNavigation navigationRef={navigationRef} />
    </SafeAreaProvider>
  );
}
