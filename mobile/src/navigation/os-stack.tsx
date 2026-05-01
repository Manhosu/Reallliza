import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { OsDetailScreen } from '../screens/OsDetailScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { CameraScreen } from '../screens/CameraScreen';
import { SignatureScreen } from '../screens/SignatureScreen';
import { StepsScreen } from '../screens/StepsScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { HeaderBellButton } from '../components/HeaderBellButton';
import { colors } from '../theme/colors';

export type OsStackParamList = {
  Home: undefined;
  OsDetail: { id: string };
  Steps: { serviceOrderId: string };
  Chat: { serviceOrderId: string };
  Checklist: { serviceOrderId: string };
  Camera: { serviceOrderId: string };
  Signature: { serviceOrderId: string };
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
          title: 'Serviços',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
          headerRight: () => <HeaderBellButton />,
        }}
      />
      <Stack.Screen
        name="OsDetail"
        component={OsDetailScreen}
        options={({ route, navigation }) => ({
          title: 'Detalhes da OS',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('Chat', {
                    serviceOrderId: (route.params as { id: string }).id,
                  })
                }
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
              </TouchableOpacity>
              <HeaderBellButton />
            </View>
          ),
        })}
      />
      <Stack.Screen
        name="Steps"
        component={StepsScreen}
        options={{
          title: 'Etapas da Execução',
        }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: 'Chat da OS',
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
      <Stack.Screen
        name="Signature"
        component={SignatureScreen}
        options={{
          title: 'Assinatura do Cliente',
        }}
      />
    </Stack.Navigator>
  );
}
