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
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectNative } from "@/components/ui/select-native";
import { apiClient } from "@/lib/api/client";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: "video" | "text" | "quiz" | "pdf";
  video_url: string | null;
  pdf_url: string | null;
  content_md: string | null;
  duration_sec: number | null;
  order_index: number;
  is_required: boolean;
  is_published: boolean;
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
  modules: Module[];
}

const TYPE_ICONS: Record<Lesson["lesson_type"], React.ComponentType<{ className?: string }>> = {
  video: Video,
  text: FileText,
  quiz: HelpCircle,
  pdf: FileType,
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
  const [lessonContent, setLessonContent] = useState("");
  const [lessonDuration, setLessonDuration] = useState("");
  const [lessonSaving, setLessonSaving] = useState(false);

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
    setLessonContent("");
    setLessonDuration("");
    setShowLessonModal(true);
  }

  async function handleAddLesson() {
    if (!lessonTitle.trim()) {
      toast.error("Informe o título da aula");
      return;
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
        content_md: lessonType === "text" ? lessonContent : null,
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
