import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient, getAccessToken, BASE_URL } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { CoursesStackParamList } from '../navigation/courses-stack';

/**
 * Espelha a logica de web/src/app/(dashboard)/aprendizado/[id]/page.tsx:
 * auto-matricula no primeiro acesso, aula ativa = primeira nao concluida,
 * marca conclusao, mostra progresso e certificado. Video/pdf abrem por
 * fora (Linking) -- nao existe player in-app em lugar nenhum do app hoje,
 * nao e regressao manter esse padrao aqui tambem.
 */

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: 'video' | 'text' | 'quiz' | 'pdf';
  video_url: string | null;
  pdf_url: string | null;
  content_md: string | null;
  duration_sec: number | null;
  order_index: number;
}

interface Module {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
}

interface ProgressItem {
  lesson_id: string;
  completed_at: string | null;
}

interface Enrollment {
  id: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  progress_pct: number;
  certificate_code: string | null;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  modules: Module[];
  enrollment: Enrollment | null;
  progress: ProgressItem[];
}

const TYPE_ICONS: Record<Lesson['lesson_type'], keyof typeof Ionicons.glyphMap> = {
  video: 'play-circle-outline',
  text: 'document-text-outline',
  quiz: 'help-circle-outline',
  pdf: 'document-outline',
};

type DetailRoute = RouteProp<CoursesStackParamList, 'CourseDetail'>;

export function CourseDetailScreen() {
  const route = useRoute<DetailRoute>();
  const { courseId } = route.params;

  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completing, setCompleting] = useState(false);
  const [downloadingCert, setDownloadingCert] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<Course>(`/courses/${courseId}`);
      const sorted: Course = {
        ...data,
        modules: (data.modules ?? [])
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((m) => ({
            ...m,
            lessons: (m.lessons ?? []).slice().sort((a, b) => a.order_index - b.order_index),
          })),
      };

      let finalCourse = sorted;
      if (!data.enrollment) {
        try {
          await apiClient.post(`/courses/${courseId}/enroll`, {});
          const refreshed = await apiClient.get<Course>(`/courses/${courseId}`);
          finalCourse = { ...refreshed, modules: sorted.modules };
        } catch (err) {
          console.error('Auto-enroll failed:', err);
        }
      }
      setCourse(finalCourse);

      const allLessons = finalCourse.modules.flatMap((m) => m.lessons);
      const firstUncomplete = allLessons.find((l) => {
        const p = finalCourse.progress?.find((pp) => pp.lesson_id === l.id);
        return !p?.completed_at;
      });
      setActiveLesson((prev) => prev ?? firstUncomplete ?? allLessons[0] ?? null);
    } catch (error) {
      console.error('Error loading course:', error);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  function isCompleted(lessonId: string): boolean {
    return !!course?.progress?.find((p) => p.lesson_id === lessonId && p.completed_at);
  }

  async function openLessonContent() {
    if (!activeLesson) return;
    const url = activeLesson.video_url || activeLesson.pdf_url;
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Erro', 'Não foi possível abrir o conteúdo.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erro', 'Falha ao abrir o conteúdo.');
    }
  }

  async function handleComplete() {
    if (!activeLesson) return;
    setCompleting(true);
    try {
      const result = await apiClient.post<{ completed: boolean }>(
        `/course-lessons/${activeLesson.id}/complete`,
        { watched_seconds: activeLesson.duration_sec ?? 0 },
      );
      if (result.completed) {
        Alert.alert('Curso concluído!', 'Parabéns — seu certificado já está disponível.');
      }
      await load();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao concluir a aula';
      Alert.alert('Erro', msg);
    } finally {
      setCompleting(false);
    }
  }

  async function handleDownloadCertificate() {
    if (!course?.enrollment) return;
    setDownloadingCert(true);
    try {
      const token = await getAccessToken();
      const destination = new File(Paths.document, `certificado-${course.enrollment.id}.pdf`);
      const downloaded = await File.downloadFileAsync(
        `${BASE_URL}/course-enrollments/${course.enrollment.id}/certificate`,
        destination,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined, idempotent: true },
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert('Certificado baixado', `Salvo em: ${downloaded.uri}`);
      }
    } catch (error) {
      console.error('Certificate download failed:', error);
      Alert.alert('Erro', 'Não foi possível baixar o certificado.');
    } finally {
      setDownloadingCert(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!course) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Curso não encontrado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = course.enrollment?.progress_pct ?? 0;
  const isCourseCompleted = course.enrollment?.status === 'completed';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{course.title}</Text>
        {course.description && <Text style={styles.description}>{course.description}</Text>}

        {course.enrollment && (
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progresso</Text>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progress}%` },
                  isCourseCompleted && { backgroundColor: colors.success },
                ]}
              />
            </View>
            {isCourseCompleted && course.enrollment.certificate_code && (
              <TouchableOpacity
                style={styles.certButton}
                onPress={handleDownloadCertificate}
                disabled={downloadingCert}
              >
                {downloadingCert ? (
                  <ActivityIndicator size="small" color={colors.warning} />
                ) : (
                  <Ionicons name="ribbon-outline" size={18} color={colors.warning} />
                )}
                <Text style={styles.certButtonText}>Baixar certificado</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {activeLesson && (
          <View style={styles.lessonCard}>
            <Text style={styles.lessonTitle}>{activeLesson.title}</Text>
            {activeLesson.description && (
              <Text style={styles.lessonDescription}>{activeLesson.description}</Text>
            )}

            {(activeLesson.lesson_type === 'video' || activeLesson.lesson_type === 'pdf') && (
              <TouchableOpacity style={styles.openButton} onPress={openLessonContent}>
                <Ionicons
                  name={activeLesson.lesson_type === 'video' ? 'play-circle' : 'document'}
                  size={20}
                  color={colors.black}
                />
                <Text style={styles.openButtonText}>
                  {activeLesson.lesson_type === 'video' ? 'Assistir vídeo' : 'Abrir PDF'}
                </Text>
              </TouchableOpacity>
            )}
            {activeLesson.lesson_type === 'text' && activeLesson.content_md && (
              <View style={styles.textBox}>
                <Text style={styles.textContent}>{activeLesson.content_md}</Text>
              </View>
            )}
            {activeLesson.lesson_type === 'quiz' && (
              <View style={styles.textBox}>
                <Text style={styles.lessonDescription}>Quiz será exibido aqui.</Text>
              </View>
            )}

            <View style={styles.completeRow}>
              {isCompleted(activeLesson.id) ? (
                <View style={styles.completedPill}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.completedPillText}>Aula concluída</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.completeButton}
                  onPress={handleComplete}
                  disabled={completing}
                >
                  {completing ? (
                    <ActivityIndicator size="small" color={colors.black} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.black} />
                      <Text style={styles.completeButtonText}>Marcar como concluída</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <Text style={styles.sectionHeading}>Aulas do curso</Text>
        {course.modules.length === 0 ? (
          <Text style={styles.emptyText}>Sem aulas.</Text>
        ) : (
          course.modules.map((m) => (
            <View key={m.id} style={styles.moduleSection}>
              <Text style={styles.moduleTitle}>{m.title}</Text>
              {m.lessons.map((l) => {
                const done = isCompleted(l.id);
                const isActive = activeLesson?.id === l.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.lessonRow, isActive && styles.lessonRowActive]}
                    onPress={() => setActiveLesson(l)}
                  >
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={done ? colors.success : colors.textMuted}
                    />
                    <Ionicons
                      name={TYPE_ICONS[l.lesson_type]}
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={styles.lessonRowText} numberOfLines={1}>
                      {l.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  description: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  progressValue: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  certButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.warning + '15',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  certButtonText: {
    ...typography.bodySmBold,
    color: colors.warning,
  },
  lessonCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  lessonTitle: {
    ...typography.h4,
    color: colors.text,
  },
  lessonDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  openButtonText: {
    ...typography.button,
    color: colors.black,
  },
  textBox: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
  },
  textContent: {
    ...typography.bodySm,
    color: colors.text,
  },
  completeRow: {
    alignItems: 'flex-end',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  completeButtonText: {
    ...typography.bodySmBold,
    color: colors.black,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success + '15',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  completedPillText: {
    ...typography.bodySmBold,
    color: colors.success,
  },
  sectionHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 4,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  moduleSection: {
    gap: 4,
  },
  moduleTitle: {
    ...typography.captionBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  lessonRowActive: {
    backgroundColor: colors.primary + '15',
  },
  lessonRowText: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
});
