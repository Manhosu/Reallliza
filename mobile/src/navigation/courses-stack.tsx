import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CoursesListScreen } from '../screens/CoursesListScreen';
import { CourseDetailScreen } from '../screens/CourseDetailScreen';
import { colors } from '../theme/colors';

export type CoursesStackParamList = {
  CoursesList: undefined;
  CourseDetail: { courseId: string };
};

const Stack = createNativeStackNavigator<CoursesStackParamList>();

export function CoursesStack() {
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
        name="CoursesList"
        component={CoursesListScreen}
        options={{
          title: 'Cursos',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: colors.primary,
          },
        }}
      />
      <Stack.Screen
        name="CourseDetail"
        component={CourseDetailScreen}
        options={{
          title: 'Curso',
        }}
      />
    </Stack.Navigator>
  );
}
