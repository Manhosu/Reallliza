import React, { useCallback, useEffect, useState, MutableRefObject } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api';
import { LoadingScreen } from '../components/LoadingScreen';
import { AuthStack } from './auth-stack';
import { MainTabs } from './main-tabs';
import { TermsScreen } from '../screens/TermsScreen';
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

interface ConsentStatus {
  has_accepted: boolean;
  consent: Record<string, unknown> | null;
}

interface RootNavigationProps {
  navigationRef?: MutableRefObject<{
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  } | null>;
}

export function RootNavigation({ navigationRef }: RootNavigationProps) {
  const { session, isLoading, isInitialized, initialize } = useAuthStore();
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [isCheckingTerms, setIsCheckingTerms] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Check terms acceptance when user is authenticated
  const checkTerms = useCallback(async () => {
    if (!session) {
      setTermsAccepted(null);
      return;
    }

    try {
      setIsCheckingTerms(true);
      const status = await apiClient.get<ConsentStatus>('/auth/consent-status');
      setTermsAccepted(status.has_accepted);
    } catch (error) {
      console.error('Error checking consent status:', error);
      // On error, allow through to avoid blocking the user
      setTermsAccepted(true);
    } finally {
      setIsCheckingTerms(false);
    }
  }, [session]);

  useEffect(() => {
    checkTerms();
  }, [checkTerms]);

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

  const handleTermsAccepted = () => {
    setTermsAccepted(true);
  };

  if (!isInitialized || isLoading) {
    return <LoadingScreen message="Carregando..." />;
  }

  // Not authenticated: show auth flow
  if (!session) {
    return (
      <NavigationContainer ref={navigationContainerRef} theme={DarkTheme}>
        <AuthStack />
      </NavigationContainer>
    );
  }

  // Authenticated but still checking terms
  if (isCheckingTerms || termsAccepted === null) {
    return <LoadingScreen message="Verificando termos..." />;
  }

  // Authenticated but terms not yet accepted
  if (!termsAccepted) {
    return <TermsScreen onAccepted={handleTermsAccepted} />;
  }

  // Authenticated and terms accepted: show main app
  return (
    <NavigationContainer ref={navigationContainerRef} theme={DarkTheme}>
      <MainTabs />
    </NavigationContainer>
  );
}
