import React, { useEffect, useRef, MutableRefObject } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { useAuthStore } from '../stores/auth-store';
import { LoadingScreen } from '../components/LoadingScreen';
import { AuthStack } from './auth-stack';
import { MainTabs } from './main-tabs';
import { colors } from '../theme/colors';

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const navigationContainerRef = createNavigationContainerRef<any>();

interface RootNavigationProps {
  navigationRef?: MutableRefObject<{
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  } | null>;
}

export function RootNavigation({ navigationRef }: RootNavigationProps) {
  const { session, isLoading, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Wire up the external navigation ref when the container is ready
  useEffect(() => {
    if (navigationRef) {
      navigationRef.current = {
        navigate: (screen: string, params?: Record<string, unknown>) => {
          if (navigationContainerRef.isReady()) {
            navigationContainerRef.navigate(screen, params as never);
          }
        },
      };
    }
  });

  if (!isInitialized || isLoading) {
    return <LoadingScreen message="Carregando..." />;
  }

  return (
    <NavigationContainer ref={navigationContainerRef} theme={DarkTheme}>
      {session ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
