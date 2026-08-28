import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GarantiasListScreen } from '../screens/GarantiasListScreen';
import { GarantiaDetailScreen } from '../screens/GarantiaDetailScreen';
import { colors } from '../theme/colors';

export type GarantiasStackParamList = {
  // warrantyId: veio de notificacao (warranty_opened) — a lista abre
  // direto no detalhe daquele item ao montar.
  GarantiasList: { warrantyId?: string } | undefined;
  GarantiaDetail: { warrantyId: string };
};

const Stack = createNativeStackNavigator<GarantiasStackParamList>();

export function GarantiasStack() {
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
        name="GarantiasList"
        component={GarantiasListScreen}
        options={{
          title: 'Garantias',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
        }}
      />
      <Stack.Screen
        name="GarantiaDetail"
        component={GarantiaDetailScreen}
        options={{
          title: 'Garantia',
        }}
      />
    </Stack.Navigator>
  );
}
