import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { OsStack } from './os-stack';
import { AgendaScreen } from '../screens/AgendaScreen';
import { ToolsScreen } from '../screens/ToolsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors } from '../theme/colors';

export type MainTabsParamList = {
  OSTab: undefined;
  AgendaTab: undefined;
  ToolsTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: styles.tabBar,
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
      }}
    >
      <Tab.Screen
        name="OSTab"
        component={OsStack}
        options={{
          headerShown: false,
          title: 'OS',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />
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
      <Tab.Screen
        name="ToolsTab"
        component={ToolsScreen}
        options={{
          title: 'Ferramentas',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="hammer-outline" size={size} color={color} />
          ),
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
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 88 : 64,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
