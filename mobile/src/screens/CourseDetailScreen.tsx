import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
  Image,
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

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'true_false';
  options: QuizOption[];
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: 'video' | 'text' | 'quiz' | 'pdf' | 'image' | 'attachment';
  video_url: string | null;
  pdf_url: string | null;
  image_url: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  content_md: string | null;
  quiz_questions: QuizQuestion[] | null;
  duration_sec: number | null;
  order_index: number;
  is_required: boolean;
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
  price_cents: number | null;
  has_access?: boolean;
  modules: Module[];
  enrollment: Enrollment | null;
  progress: ProgressItem[];
}

const TYPE_ICONS: Record<Lesson['lesson_type'], keyof typeof Ionicons.glyphMap> = {
  video: 'play-circle-outline',
  text: 'document-text-outline',
  quiz: 'help-circle-outline',
  pdf: 'document-outline',
  image: 'image-outline',
  attachment: 'attach-outline',
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
  const [buying, setBuying] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    score: number;
    passed: boolean;
    attempts_remaining: number | null;
  } | null>(null);

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
      // Curso pago sem acesso: nao tenta auto-matricular, mostra a tela
      // de compra (a rota tambem recusaria com 403).
      if (!data.enrollment && data.has_access !== false) {
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

  // Volta do checkout externo (Asaas abre no navegador do aparelho) --
  // re-checa acesso ao voltar pro primeiro plano, mesma ideia do listener
  // de AppState ja usado em sync-manager.ts pra reconectividade offline.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        load();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [load]);

  async function handlePurchase() {
    setBuying(true);
    try {
      const result = await apiClient.post<{ checkout_url: string | null }>(
        `/courses/${courseId}/purchase`,
        {},
      );
      if (result.checkout_url) {
        await Linking.openURL(result.checkout_url);
      } else {
        Alert.alert('Compra registrada', 'Aguarde a liberação do acesso.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao iniciar compra';
      Alert.alert('Erro', msg);
    } finally {
      setBuying(false);
    }
  }

  function isCompleted(lessonId: string): boolean {
    return !!course?.progress?.find((p) => p.lesson_id === lessonId && p.completed_at);
  }

  // Mesma regra do backend (quiz-attempt/route.ts): a prova só libera
  // quando todo o RESTO do conteúdo obrigatório do curso já foi concluído.
  function isQuizUnlocked(lesson: Lesson): boolean {
    if (!course) return false;
    const otherRequired = course.modules
      .flatMap((m) => m.lessons)
      .filter((l) => l.id !== lesson.id && l.is_required);
    return otherRequired.every((l) => isCompleted(l.id));
  }

  function selectLesson(l: Lesson) {
    setActiveLesson(l);
    setQuizAnswers({});
    setQuizResult(null);
  }

  async function handleQuizSubmit() {
    if (!activeLesson) return;
    setQuizSubmitting(true);
    try {
      const result = await apiClient.post<{
        score: number;
        passed: boolean;
        attempts_remaining: number | null;
        completed: boolean;
      }>(`/course-lessons/${activeLesson.id}/quiz-attempt`, { answers: quizAnswers });
      setQuizResult(result);
      if (result.passed) {
        if (result.completed) {
          Alert.alert('Curso concluído!', `Aprovado com ${result.score}%. Certificado disponível.`);
        } else {
          Alert.alert('Aprovado!', `Nota: ${result.score}%.`);
        }
        await load();
      } else {
        Alert.alert('Reprovado', `Nota: ${result.score}%.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao enviar respostas';
      Alert.alert('Erro', msg);
    } finally {
      setQuizSubmitting(false);
    }
  }

  async function openLessonContent() {
    if (!activeLesson) return;
    const url = activeLesson.video_url || activeLesson.pdf_url || activeLesson.attachment_url;
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

        {course.has_access === false ? (
          <View style={styles.purchaseCard}>
            <View style={styles.purchaseIconWrap}>
              <Ionicons name="lock-closed" size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.purchaseTitle}>Este curso é pago</Text>
            <Text style={styles.purchaseText}>
              Compre o acesso para liberar módulos, aulas e certificado.
            </Text>
            <Text style={styles.purchasePrice}>
              R$ {((course.price_cents ?? 0) / 100).toFixed(2).replace('.', ',')}
            </Text>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={handlePurchase}
              disabled={buying}
            >
              {buying ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <Text style={styles.completeButtonText}>Comprar acesso</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
            {activeLesson.lesson_type === 'image' && activeLesson.image_url && (
              <Image
                source={{ uri: activeLesson.image_url }}
                style={styles.lessonImage}
                resizeMode="contain"
              />
            )}
            {activeLesson.lesson_type === 'attachment' && activeLesson.attachment_url && (
              <TouchableOpacity style={styles.openButton} onPress={openLessonContent}>
                <Ionicons name="download-outline" size={20} color={colors.black} />
                <Text style={styles.openButtonText}>
                  {activeLesson.attachment_name || 'Baixar arquivo'}
                </Text>
              </TouchableOpacity>
            )}
            {activeLesson.lesson_type === 'quiz' &&
              (!isQuizUnlocked(activeLesson) ? (
                <View style={styles.quizLockBox}>
                  <Ionicons name="lock-closed" size={22} color={colors.textMuted} />
                  <Text style={styles.lessonDescription}>
                    Conclua todo o restante do conteúdo do curso antes de fazer esta avaliação.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {(activeLesson.quiz_questions ?? []).map((q, qIdx) => (
                    <View key={q.id} style={styles.quizQuestionBox}>
                      <Text style={styles.quizQuestionText}>
                        {qIdx + 1}. {q.text}
                      </Text>
                      {q.options.map((o) => (
                        <TouchableOpacity
                          key={o.id}
                          style={styles.quizOptionRow}
                          disabled={!!quizResult}
                          onPress={() => setQuizAnswers((a) => ({ ...a, [q.id]: o.id }))}
                        >
                          <Ionicons
                            name={quizAnswers[q.id] === o.id ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={quizAnswers[q.id] === o.id ? colors.primary : colors.textMuted}
                          />
                          <Text style={styles.quizOptionText}>{o.text}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}

                  {quizResult && (
                    <View
                      style={[
                        styles.quizResultBox,
                        { backgroundColor: (quizResult.passed ? colors.success : colors.danger) + '15' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.quizResultText,
                          { color: quizResult.passed ? colors.success : colors.danger },
                        ]}
                      >
                        {quizResult.passed
                          ? `Aprovado com ${quizResult.score}%!`
                          : `Reprovado com ${quizResult.score}%.` +
                            (quizResult.attempts_remaining === 0
                              ? ' Sem mais tentativas.'
                              : quizResult.attempts_remaining != null
                                ? ` Tentativas restantes: ${quizResult.attempts_remaining}.`
                                : '')}
                      </Text>
                    </View>
                  )}

                  {!quizResult?.passed && (
                    <TouchableOpacity
                      style={styles.completeButton}
                      onPress={handleQuizSubmit}
                      disabled={
                        quizSubmitting ||
                        (activeLesson.quiz_questions?.length ?? 0) === 0 ||
                        (activeLesson.quiz_questions ?? []).some((q) => !quizAnswers[q.id]) ||
                        quizResult?.attempts_remaining === 0
                      }
                    >
                      {quizSubmitting ? (
                        <ActivityIndicator size="small" color={colors.black} />
                      ) : (
                        <Text style={styles.completeButtonText}>Enviar respostas</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}

            {activeLesson.lesson_type !== 'quiz' && (
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
            )}
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
                const locked = l.lesson_type === 'quiz' && !done && !isQuizUnlocked(l);
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[
                      styles.lessonRow,
                      isActive && styles.lessonRowActive,
                      locked && styles.lessonRowLocked,
                    ]}
                    onPress={() => selectLesson(l)}
                  >
                    <Ionicons
                      name={locked ? 'lock-closed' : done ? 'checkmark-circle' : 'ellipse-outline'}
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
          </>
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
  purchaseCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  purchaseIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  purchaseTitle: {
    ...typography.h4,
    color: colors.text,
  },
  purchaseText: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  purchasePrice: {
    ...typography.h3,
    color: colors.text,
    marginVertical: 4,
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
  lessonRowLocked: {
    opacity: 0.55,
  },
  lessonRowText: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  lessonImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  quizLockBox: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 20,
  },
  quizQuestionBox: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  quizQuestionText: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  quizOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  quizOptionText: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  quizResultBox: {
    borderRadius: 10,
    padding: 12,
  },
  quizResultText: {
    ...typography.bodySmBold,
  },
});
