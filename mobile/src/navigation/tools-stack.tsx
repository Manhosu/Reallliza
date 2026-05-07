import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ToolsScreen } from '../screens/ToolsScreen';
import { ToolRequestScreen } from '../screens/ToolRequestScreen';
import { HeaderBellButton } from '../components/HeaderBellButton';
import { colors } from '../theme/colors';

export type ToolsStackParamList = {
  ToolsHome: undefined;
  ToolRequest: undefined;
};

const Stack = createNativeStackNavigator<ToolsStackParamList>();

export function ToolsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="ToolsHome"
        component={ToolsScreen}
        options={{
          title: 'Ferramentas',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
          headerRight: () => <HeaderBellButton />,
        }}
      />
      <Stack.Screen
        name="ToolRequest"
        component={ToolRequestScreen}
        options={{
          title: 'Catalogo de Ferramentas',
        }}
      />
    </Stack.Navigator>
  );
}
