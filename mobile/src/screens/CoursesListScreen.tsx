import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { CoursesStackParamList } from '../navigation/courses-stack';

/**
 * Reconecta a aba "Cursos" ao sistema de cursos de verdade (courses/
 * course_modules/course_lessons). Antes chamava /learning/content, um
 * endpoint que so' existia num servico NestJS legado ja fora do ar —
 * essa tela sempre falhava em producao (Marco 4/5, 07/09).
 */

interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category: { id: string; name: string; icon: string | null } | null;
  required_completion_pct: number;
  price_cents: number | null;
  has_access?: boolean;
  modules?: Array<{ lessons?: Array<{ id: string }> }>;
  enrollment: {
    id: string;
    status: 'in_progress' | 'completed' | 'cancelled';
    progress_pct: number;
  } | null;
}

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

type NavigationProp = NativeStackNavigationProp<CoursesStackParamList>;

export function CoursesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const data = await apiClient.get<CourseSummary[]>('/courses');
      setCourses(data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchCourses().finally(() => setIsLoading(false));
  }, [fetchCourses]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchCourses();
    setIsRefreshing(false);
  };

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) {
      if (c.category) map.set(c.category.id, c.category.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [courses]);

  const visibleCourses =
    selectedCategory === 'ALL'
      ? courses
      : courses.filter((c) => c.category?.id === selectedCategory);

  const grouped = useMemo(() => {
    const acc: Record<string, CourseSummary[]> = {};
    for (const c of visibleCourses) {
      const key = c.category?.name ?? 'Sem categoria';
      if (!acc[key]) acc[key] = [];
      acc[key].push(c);
    }
    return acc;
  }, [visibleCourses]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {categories.length > 0 && (
        <View style={styles.chipBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipBarContent}
          >
            <TouchableOpacity
              style={[styles.chip, selectedCategory === 'ALL' && styles.chipActive]}
              onPress={() => setSelectedCategory('ALL')}
            >
              <Ionicons
                name="grid-outline"
                size={14}
                color={selectedCategory === 'ALL' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.chipText, selectedCategory === 'ALL' && styles.chipTextActive]}
              >
                Todos
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : visibleCourses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={48} color={colors.textDark} />
            <Text style={styles.emptyTitle}>Nenhum curso ainda</Text>
            <Text style={styles.emptyText}>
              A equipe Reallliza está preparando os cursos. Volte em breve.
            </Text>
          </View>
        ) : selectedCategory === 'ALL' ? (
          Object.keys(grouped).map((catName) => (
            <View key={catName} style={styles.categorySection}>
              <Text style={styles.categoryHeading}>{catName}</Text>
              {grouped[catName].map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  onPress={() => navigation.navigate('CourseDetail', { courseId: c.id })}
                />
              ))}
            </View>
          ))
        ) : (
          visibleCourses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onPress={() => navigation.navigate('CourseDetail', { courseId: c.id })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CourseCard({ course, onPress }: { course: CourseSummary; onPress: () => void }) {
  const lessonCount =
    course.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
  const isCompleted = course.enrollment?.status === 'completed';
  const progress = course.enrollment?.progress_pct ?? 0;
  const isLocked = course.has_access === false;

  return (
    <TouchableOpacity
      style={[styles.card, isLocked && styles.cardLocked]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.thumbWrap}>
        {course.thumbnail_url ? (
          <Image source={{ uri: course.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="school" size={40} color={colors.primary} />
          </View>
        )}
        {isLocked ? (
          <View style={styles.priceBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.text} />
            <Text style={styles.priceBadgeText}>{formatPrice(course.price_cents ?? 0)}</Text>
          </View>
        ) : (
          isCompleted && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.black} />
              <Text style={styles.completedBadgeText}>Concluído</Text>
            </View>
          )
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {course.title}
        </Text>
        {course.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {course.description}
          </Text>
        )}
        <Text style={styles.cardMeta}>
          {lessonCount} {lessonCount === 1 ? 'aula' : 'aulas'}
        </Text>
        {course.enrollment && !isCompleted && (
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chipBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  chipBarContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.captionBold,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary,
  },
  content: {
    padding: 12,
    gap: 12,
  },
  center: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  categorySection: {
    gap: 8,
  },
  categoryHeading: {
    ...typography.bodyBold,
    color: colors.textMuted,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardLocked: {
    opacity: 0.55,
  },
  thumbWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.cardAlt,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  completedBadgeText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '700',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 16,
  },
  cardMeta: {
    ...typography.tiny,
    color: colors.textDark,
    marginTop: 2,
  },
  progressBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
});
