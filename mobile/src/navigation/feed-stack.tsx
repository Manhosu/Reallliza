import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedScreen } from '../screens/FeedScreen';
import { CommentsScreen } from '../screens/CommentsScreen';
import { colors } from '../theme/colors';

export type FeedStackParamList = {
  FeedHome: undefined;
  Comments: { postId: string; postTitle: string };
};

const Stack = createNativeStackNavigator<FeedStackParamList>();

export function FeedStack() {
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
        name="FeedHome"
        component={FeedScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Comments"
        component={CommentsScreen}
        options={{
          title: 'Comentários',
        }}
      />
    </Stack.Navigator>
  );
}
