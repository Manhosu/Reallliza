import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { OsDetailScreen } from '../screens/OsDetailScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { CameraScreen } from '../screens/CameraScreen';
import { colors } from '../theme/colors';

export type OsStackParamList = {
  Home: undefined;
  OsDetail: { id: string };
  Checklist: { serviceOrderId: string };
  Camera: { serviceOrderId: string };
};

const Stack = createNativeStackNavigator<OsStackParamList>();

export function OsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Minhas OS',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
        }}
      />
      <Stack.Screen
        name="OsDetail"
        component={OsDetailScreen}
        options={{
          title: 'Detalhes da OS',
        }}
      />
      <Stack.Screen
        name="Checklist"
        component={ChecklistScreen}
        options={{
          title: 'Checklist',
        }}
      />
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{
          title: 'Fotos',
        }}
      />
    </Stack.Navigator>
  );
}
