import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OsStack } from './os-stack';
import { ToolsStack } from './tools-stack';
import { FeedStack } from './feed-stack';
import { LearningScreen } from '../screens/LearningScreen';
import { AgendaScreen } from '../screens/AgendaScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProposalsScreen } from '../screens/ProposalsScreen';
import { PericiasScreen } from '../screens/PericiasScreen';
import { useAuthStore } from '../stores/auth-store';
import { HeaderBellButton } from '../components/HeaderBellButton';
import { colors } from '../theme/colors';

export type MainTabsParamList = {
  FeedTab: undefined;
  OSTab: undefined;
  PericiasTab: undefined;
  LearningTab: undefined;
  AgendaTab: undefined;
  NotificationsTab: undefined;
  ProposalsTab: undefined;
  ToolsTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  const profile = useAuthStore(state => state.profile);
  const isPartner = profile?.role === 'partner';
  const insets = useSafeAreaInsets();

  // Bottom safe-area: garante espaço para botões de navegação do Android (3-button nav)
  // e home indicator do iOS. Mínimo de 12px para casos onde o inset é 0.
  const bottomPadding = Math.max(insets.bottom, 12);
  const tabBarStyle = {
    ...styles.tabBar,
    paddingBottom: bottomPadding,
    height: 56 + bottomPadding,
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDark,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        headerRight: () => <HeaderBellButton />,
      }}
    >
      <Tab.Screen
        name="FeedTab"
        component={FeedStack}
        options={{
          headerShown: false,
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OSTab"
        component={OsStack}
        options={{
          headerShown: false,
          title: 'Serviços',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />
      {!isPartner && (
        <Tab.Screen
          name="PericiasTab"
          component={PericiasScreen}
          options={{
            headerShown: false,
            title: 'Perícias',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      {!isPartner && (
        <Tab.Screen
          name="LearningTab"
          component={LearningScreen}
          options={{
            title: 'Aprendizado',
            tabBarLabel: 'Cursos',
            headerTitleStyle: {
              fontWeight: '700',
              fontSize: 20,
              color: colors.primary,
            },
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="school-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      {isPartner ? (
        <Tab.Screen
          name="ProposalsTab"
          component={ProposalsScreen}
          options={{
            headerShown: false,
            title: 'Propostas',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text-outline" size={size} color={color} />
            ),
          }}
        />
      ) : (
        <Tab.Screen
          name="AgendaTab"
          component={AgendaScreen}
          options={{
            title: 'Agenda',
            headerTitleStyle: {
              fontWeight: '700',
              fontSize: 20,
              color: colors.primary,
            },
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      {!isPartner && (
        <Tab.Screen
          name="ToolsTab"
          component={ToolsStack}
          options={{
            headerShown: false,
            title: 'Ferramentas',
            tabBarLabel: 'Custódia',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="hammer-outline" size={size} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          headerShown: false,
          title: 'Notificações',
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
