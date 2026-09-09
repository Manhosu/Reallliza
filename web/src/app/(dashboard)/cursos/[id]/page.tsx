"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Video,
  FileText,
  HelpCircle,
  FileType,
  GripVertical,
  Lock,
  Search,
  X,
  Image as ImageIcon,
  Paperclip,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectNative } from "@/components/ui/select-native";
import { apiClient, getAccessToken, BASE_URL } from "@/lib/api/client";
import { usersApi, teamsApi } from "@/lib/api";
import type { Profile } from "@/lib/types";
import type { Team } from "@/lib/api/teams";

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: "multiple_choice" | "true_false";
  options: QuizOption[];
  correct_option_id: string;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: "video" | "text" | "quiz" | "pdf" | "image" | "attachment";
  video_url: string | null;
  pdf_url: string | null;
  image_url: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  content_md: string | null;
  quiz_questions: QuizQuestion[] | null;
  min_passing_score: number | null;
  max_attempts: number | null;
  duration_sec: number | null;
  order_index: number;
  is_required: boolean;
  is_published: boolean;
}

function newQuestion(): QuizQuestion {
  const qid = Math.random().toString(36).slice(2, 10);
  return {
    id: qid,
    text: "",
    type: "multiple_choice",
    options: [
      { id: `${qid}-a`, text: "" },
      { id: `${qid}-b`, text: "" },
    ],
    correct_option_id: "",
  };
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  price_cents: number | null;
  modules: Module[];
}

interface AccessGrant {
  user_id: string;
  granted_at: string;
  profile: { id: string; full_name: string; email: string } | null;
}

interface TeamAccess {
  team_id: string;
  team: { id: string; name: string; color: string } | null;
}

/**
 * Painel de acessos manuais — só faz sentido pra curso pago (Marco EAD,
 * Ricardo/Jéssica). Libera por usuário (busca por nome/email, mesmo
 * `usersApi.list` já usado em usuarios/page.tsx) ou por equipe inteira
 * (reaproveita `teams`, já existente pro agendamento).
 */
function AccessPanel({ courseId }: { courseId: string }) {
  const [users, setUsers] = useState<AccessGrant[]>([]);
  const [teamAccess, setTeamAccess] = useState<TeamAccess[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [access, teamsList] = await Promise.all([
        apiClient.get<{ users: AccessGrant[]; teams: TeamAccess[] }>(
          `/courses/${courseId}/access`
        ),
        teamsApi.list(),
      ]);
      setUsers(access.users);
      setTeamAccess(access.teams);
      setTeams(teamsList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.list({ search: query.trim(), limit: 5 });
        setResults(res.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  async function grantUser(userId: string) {
    try {
      await apiClient.post(`/courses/${courseId}/access`, { user_id: userId });
      toast.success("Acesso liberado");
      setQuery("");
      setResults([]);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao liberar acesso");
    }
  }

  async function revokeUser(userId: string) {
    try {
      await apiClient.delete(`/courses/${courseId}/access?user_id=${userId}`);
      toast.success("Acesso revogado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar");
    }
  }

  async function grantTeam() {
    if (!selectedTeamId) return;
    try {
      await apiClient.post(`/courses/${courseId}/access`, { team_id: selectedTeamId });
      toast.success("Equipe liberada");
      setSelectedTeamId("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao liberar equipe");
    }
  }

  async function revokeTeam(teamId: string) {
    try {
      await apiClient.delete(`/courses/${courseId}/access?team_id=${teamId}`);
      toast.success("Acesso da equipe revogado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar");
    }
  }

  const availableTeams = teams.filter(
    (t) => !teamAccess.some((ta) => ta.team_id === t.id)
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Acessos liberados manualmente</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Curso pago: além de quem comprou, você pode liberar por usuário ou
          por equipe inteira.
        </p>

        <div className="space-y-2">
          <label className="text-sm font-medium">Liberar por usuário</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}
          {results.length > 0 && (
            <div className="space-y-1 rounded-lg border bg-card p-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => grantUser(r.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {r.full_name} <span className="text-muted-foreground">— {r.email}</span>
                  </span>
                  <Plus className="h-3.5 w-3.5 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && users.length > 0 && (
          <div className="space-y-1">
            {users.map((g) => (
              <div
                key={g.user_id}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <span>
                  {g.profile?.full_name ?? "Usuário"}{" "}
                  <span className="text-muted-foreground">— {g.profile?.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => revokeUser(g.user_id)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <label className="text-sm font-medium">Liberar por equipe</label>
          <div className="flex gap-2">
            <SelectNative
              className="flex-1"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              <option value="">Selecione uma equipe...</option>
              {availableTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectNative>
            <Button onClick={grantTeam} disabled={!selectedTeamId} className="shrink-0">
              <Plus className="h-4 w-4" /> Liberar
            </Button>
          </div>
        </div>

        {!loading && teamAccess.length > 0 && (
          <div className="space-y-1">
            {teamAccess.map((ta) => (
              <div
                key={ta.team_id}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <span>{ta.team?.name ?? "Equipe"}</span>
                <button
                  type="button"
                  onClick={() => revokeTeam(ta.team_id)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TYPE_ICONS: Record<Lesson["lesson_type"], React.ComponentType<{ className?: string }>> = {
  video: Video,
  text: FileText,
  quiz: HelpCircle,
  pdf: FileType,
  image: ImageIcon,
  attachment: Paperclip,
};

export default function CursoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Module modal
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleSaving, setModuleSaving] = useState(false);

  // Lesson modal
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<string>("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonType, setLessonType] = useState<Lesson["lesson_type"]>("video");
  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonPdfUrl, setLessonPdfUrl] = useState("");
  const [lessonImageUrl, setLessonImageUrl] = useState("");
  const [uploadingLessonImage, setUploadingLessonImage] = useState(false);
  const [lessonAttachmentUrl, setLessonAttachmentUrl] = useState("");
  const [lessonAttachmentName, setLessonAttachmentName] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [lessonDuration, setLessonDuration] = useState("");
  const [lessonSaving, setLessonSaving] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [minPassingScore, setMinPassingScore] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");

  async function handleLessonImageUpload(file: File) {
    setUploadingLessonImage(true);
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.append("file", file);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}/feed/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Erro ao enviar imagem");
      setLessonImageUrl(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar imagem");
    } finally {
      setUploadingLessonImage(false);
    }
  }

  function addQuestion() {
    setQuizQuestions((qs) => [...qs, newQuestion()]);
  }

  function removeQuestion(qid: string) {
    setQuizQuestions((qs) => qs.filter((q) => q.id !== qid));
  }

  function updateQuestion(qid: string, patch: Partial<QuizQuestion>) {
    setQuizQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  }

  function setQuestionType(qid: string, type: QuizQuestion["type"]) {
    setQuizQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q;
        if (type === "true_false") {
          const options = [
            { id: `${qid}-v`, text: "Verdadeiro" },
            { id: `${qid}-f`, text: "Falso" },
          ];
          return { ...q, type, options, correct_option_id: "" };
        }
        return { ...q, type, options: q.options.length >= 2 ? q.options : newQuestion().options };
      })
    );
  }

  function addOption(qid: string) {
    setQuizQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: [...q.options, { id: Math.random().toString(36).slice(2, 10), text: "" }] }
          : q
      )
    );
  }

  function removeOption(qid: string, optId: string) {
    setQuizQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? {
              ...q,
              options: q.options.filter((o) => o.id !== optId),
              correct_option_id: q.correct_option_id === optId ? "" : q.correct_option_id,
            }
          : q
      )
    );
  }

  function updateOptionText(qid: string, optId: string, text: string) {
    setQuizQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, text } : o)) }
          : q
      )
    );
  }

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Course>(`/courses/${id}`);
      setCourse({
        ...data,
        modules: (data.modules ?? []).sort(
          (a, b) => a.order_index - b.order_index
        ).map((m) => ({
          ...m,
          lessons: (m.lessons ?? []).sort(
            (a, b) => a.order_index - b.order_index
          ),
        })),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddModule() {
    if (!moduleTitle.trim()) {
      toast.error("Informe o título");
      return;
    }
    setModuleSaving(true);
    try {
      const nextIdx = (course?.modules.length ?? 0) + 1;
      await apiClient.post(`/courses/${id}/modules`, {
        title: moduleTitle,
        order_index: nextIdx,
      });
      toast.success("Módulo criado");
      setShowModuleModal(false);
      setModuleTitle("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setModuleSaving(false);
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm("Remover módulo e todas as aulas dele?")) return;
    try {
      await apiClient.delete(`/course-modules/${moduleId}`);
      toast.success("Removido");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function openAddLesson(moduleId: string) {
    setActiveModuleId(moduleId);
    setLessonTitle("");
    setLessonType("video");
    setLessonVideoUrl("");
    setLessonPdfUrl("");
    setLessonImageUrl("");
    setLessonAttachmentUrl("");
    setLessonAttachmentName("");
    setLessonContent("");
    setLessonDuration("");
    setQuizQuestions([]);
    setMinPassingScore("");
    setMaxAttempts("");
    setShowLessonModal(true);
  }

  async function handleAddLesson() {
    if (!lessonTitle.trim()) {
      toast.error("Informe o título da aula");
      return;
    }
    if (lessonType === "quiz") {
      if (quizQuestions.length === 0) {
        toast.error("Adicione ao menos uma pergunta");
        return;
      }
      for (const q of quizQuestions) {
        if (!q.text.trim()) {
          toast.error("Toda pergunta precisa de um enunciado");
          return;
        }
        if (q.options.some((o) => !o.text.trim())) {
          toast.error("Toda alternativa precisa de um texto");
          return;
        }
        if (!q.correct_option_id) {
          toast.error(`Marque a alternativa correta de "${q.text}"`);
          return;
        }
      }
    }
    setLessonSaving(true);
    try {
      const mod = course?.modules.find((m) => m.id === activeModuleId);
      const nextIdx = (mod?.lessons.length ?? 0) + 1;
      await apiClient.post(`/course-modules/${activeModuleId}/lessons`, {
        title: lessonTitle,
        lesson_type: lessonType,
        video_url: lessonType === "video" ? lessonVideoUrl : null,
        pdf_url: lessonType === "pdf" ? lessonPdfUrl : null,
        image_url: lessonType === "image" ? lessonImageUrl : null,
        attachment_url: lessonType === "attachment" ? lessonAttachmentUrl : null,
        attachment_name: lessonType === "attachment" ? lessonAttachmentName : null,
        content_md: lessonType === "text" ? lessonContent : null,
        quiz_questions: lessonType === "quiz" ? quizQuestions : null,
        min_passing_score:
          lessonType === "quiz" && minPassingScore ? Number(minPassingScore) : null,
        max_attempts: lessonType === "quiz" && maxAttempts ? Number(maxAttempts) : null,
        duration_sec: lessonDuration ? Number(lessonDuration) : null,
        order_index: nextIdx,
      });
      toast.success("Aula criada");
      setShowLessonModal(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLessonSaving(false);
    }
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm("Remover aula?")) return;
    try {
      await apiClient.delete(`/course-lessons/${lessonId}`);
      toast.success("Removida");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (!course) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          Curso não encontrado.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/cursos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cursos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">
          {course.title}
        </h1>
        {course.description && (
          <p className="text-muted-foreground">{course.description}</p>
        )}
      </motion.div>

      {!!course.price_cents && <AccessPanel courseId={course.id} />}

      <div className="flex justify-end">
        <Button onClick={() => setShowModuleModal(true)}>
          <Plus className="h-4 w-4" />
          Novo módulo
        </Button>
      </div>

      {course.modules.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Nenhum módulo ainda. Crie o primeiro pra começar a adicionar aulas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {course.modules.map((m, idx) => (
            <Card key={m.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">
                      Módulo {idx + 1}: {m.title}
                    </h2>
                    {m.description && (
                      <p className="text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAddLesson(m.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Aula
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDeleteModule(m.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {m.lessons.length === 0 ? (
                  <p className="rounded-lg bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                    Nenhuma aula. Clique em <strong>Aula</strong> pra adicionar.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {m.lessons.map((l, lIdx) => {
                      const Icon = TYPE_ICONS[l.lesson_type];
                      return (
                        <div
                          key={l.id}
                          className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm"
                        >
                          <span className="w-6 text-center text-xs text-muted-foreground">
                            {lIdx + 1}
                          </span>
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                          {l.lesson_type === "quiz" && (
                            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                              {l.quiz_questions?.length ?? 0} pergunta
                              {(l.quiz_questions?.length ?? 0) === 1 ? "" : "s"}
                            </span>
                          )}
                          {l.duration_sec && (
                            <span className="text-xs text-muted-foreground">
                              {Math.floor(l.duration_sec / 60)}min
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteLesson(l.id)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal módulo */}
      <Dialog open={showModuleModal} onClose={() => setShowModuleModal(false)}>
        <DialogHeader>
          <DialogTitle>Novo módulo</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Título *</label>
            <Input
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
              placeholder="Ex: Preparação do piso"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModuleModal(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAddModule} isLoading={moduleSaving}>
            Criar módulo
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Modal aula */}
      <Dialog open={showLessonModal} onClose={() => setShowLessonModal(false)}>
        <DialogHeader>
          <DialogTitle>Nova aula</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Título *</label>
            <Input
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipo</label>
              <SelectNative
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as Lesson["lesson_type"])}
              >
                <option value="video">Vídeo</option>
                <option value="text">Texto</option>
                <option value="pdf">PDF</option>
                <option value="image">Imagem</option>
                <option value="attachment">Anexo/arquivo</option>
                <option value="quiz">Quiz</option>
              </SelectNative>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Duração (segundos)</label>
              <Input
                type="number"
                min="0"
                value={lessonDuration}
                onChange={(e) => setLessonDuration(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          {lessonType === "video" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">URL do vídeo</label>
              <Input
                value={lessonVideoUrl}
                onChange={(e) => setLessonVideoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
          {lessonType === "pdf" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">URL do PDF</label>
              <Input
                value={lessonPdfUrl}
                onChange={(e) => setLessonPdfUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
          {lessonType === "image" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Imagem</label>
              {lessonImageUrl ? (
                <div className="relative">
                  <img
                    src={lessonImageUrl}
                    alt="Imagem da aula"
                    className="h-32 w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setLessonImageUrl("")}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-input text-sm text-muted-foreground hover:bg-muted/50">
                  {uploadingLessonImage ? "Enviando..." : "Clique para enviar uma imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLessonImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLessonImageUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          )}
          {lessonType === "attachment" && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">URL do arquivo</label>
                <Input
                  value={lessonAttachmentUrl}
                  onChange={(e) => setLessonAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Nome de exibição</label>
                <Input
                  value={lessonAttachmentName}
                  onChange={(e) => setLessonAttachmentName(e.target.value)}
                  placeholder="Ex: Manual de instalação.pdf"
                />
              </div>
            </>
          )}
          {lessonType === "text" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Conteúdo (Markdown)</label>
              <textarea
                value={lessonContent}
                onChange={(e) => setLessonContent(e.target.value)}
                rows={6}
                className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          {lessonType === "quiz" && (
            <div className="space-y-3 rounded-xl border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nota mínima (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={minPassingScore}
                    onChange={(e) => setMinPassingScore(e.target.value)}
                    placeholder="Sem mínimo"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Tentativas</label>
                  <Input
                    type="number"
                    min="1"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    placeholder="Ilimitadas"
                  />
                </div>
              </div>

              {quizQuestions.map((q, qIdx) => (
                <div key={q.id} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs text-muted-foreground">{qIdx + 1}.</span>
                    <Input
                      className="flex-1"
                      value={q.text}
                      onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                      placeholder="Enunciado da pergunta"
                    />
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="mt-1.5 rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <SelectNative
                    className="h-8 w-48 text-xs"
                    value={q.type}
                    onChange={(e) => setQuestionType(q.id, e.target.value as QuizQuestion["type"])}
                  >
                    <option value="multiple_choice">Múltipla escolha</option>
                    <option value="true_false">Verdadeiro ou falso</option>
                  </SelectNative>
                  <div className="space-y-1.5 pl-5">
                    {q.options.map((o) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuestion(q.id, { correct_option_id: o.id })}
                          title="Marcar como correta"
                        >
                          {q.correct_option_id === o.id ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <Input
                          className="h-8 flex-1"
                          value={o.text}
                          disabled={q.type === "true_false"}
                          onChange={(e) => updateOptionText(q.id, o.id, e.target.value)}
                          placeholder="Alternativa"
                        />
                        {q.type === "multiple_choice" && q.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(q.id, o.id)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {q.type === "multiple_choice" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addOption(q.id)}
                      >
                        <Plus className="h-3 w-3" /> Alternativa
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addQuestion}>
                <Plus className="h-4 w-4" /> Adicionar pergunta
              </Button>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowLessonModal(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAddLesson} isLoading={lessonSaving}>
            Criar aula
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
