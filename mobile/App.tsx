import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncManager } from './src/lib/sync-manager';
import {
  registerForPushNotifications,
  setupNotificationListeners,
} from './src/lib/push-notifications';
import { RootNavigation } from './src/navigation';
import { useAuthStore } from './src/stores/auth-store';

export default function App() {
  const navigationRef = useRef<{
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  } | null>(null);

  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    syncManager.init();
    const subscription = setupNotificationListeners(navigationRef.current);

    return () => {
      subscription.remove();
      syncManager.destroy();
    };
  }, []);

  // O registro do aparelho depende de sessao: a rota exige autenticacao.
  // Antes isso rodava junto com o sync, na montagem do app — ou seja, antes
  // do login — e o 401 era engolido. Resultado: nenhum aparelho registrado
  // em producao e nenhuma notificacao chegando ao celular.
  //
  // Reagir ao id do usuario tambem cobre a troca de conta no mesmo aparelho.
  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications();
  }, [userId]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#09090B" />
      <RootNavigation navigationRef={navigationRef} />
    </SafeAreaProvider>
  );
}
