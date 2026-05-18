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
import { StepDetailScreen } from '../screens/StepDetailScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { VistoriaScreen } from '../screens/VistoriaScreen';
import { EcossistemaScreen } from '../screens/EcossistemaScreen';
import { EcossistemaOsDetailScreen } from '../screens/EcossistemaOsDetailScreen';
import { HeaderBellButton } from '../components/HeaderBellButton';
import { colors } from '../theme/colors';

export type OsStackParamList = {
  Home: undefined;
  OsDetail: { id: string };
  Steps: { serviceOrderId: string };
  StepDetail: { serviceOrderId: string; stepId: string };
  Chat: { serviceOrderId: string };
  Checklist: { serviceOrderId: string };
  Camera: { serviceOrderId: string };
  Signature: { serviceOrderId: string };
  Vistoria: { ticketId?: string; ticketProtocol?: string; osId?: string };
  Ecossistema: undefined;
  EcossistemaOsDetail: { osId: string };
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
        options={({ navigation }) => ({
          title: 'Serviços',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Ecossistema')}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="git-network-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <HeaderBellButton />
            </View>
          ),
        })}
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
        name="StepDetail"
        component={StepDetailScreen}
        options={{
          title: 'Etapa',
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
      <Stack.Screen
        name="Vistoria"
        component={VistoriaScreen}
        options={{
          title: 'Vistoria Tecnica',
        }}
      />
      <Stack.Screen
        name="Ecossistema"
        component={EcossistemaScreen}
        options={{ title: 'Ordens de Serviço' }}
      />
      <Stack.Screen
        name="EcossistemaOsDetail"
        component={EcossistemaOsDetailScreen}
        options={{ title: 'Detalhe da OS' }}
      />
    </Stack.Navigator>
  );
}
