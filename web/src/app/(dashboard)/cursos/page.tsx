"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Plus,
  Eye,
  EyeOff,
  Users,
  Wrench,
  Building2,
  Globe,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectNative } from "@/components/ui/select-native";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  audience: "all" | "technician" | "partner" | "admin";
  is_published: boolean;
  emit_certificate: boolean;
  required_completion_pct: number;
  order_index: number;
  modules?: Array<{
    id: string;
    title: string;
    lessons?: Array<{ id: string; title: string }>;
  }>;
}

const AUDIENCE_LABELS: Record<Course["audience"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  all: { label: "Todos", icon: Globe },
  technician: { label: "Técnicos", icon: Wrench },
  partner: { label: "Lojas", icon: Building2 },
  admin: { label: "Admin", icon: Users },
};

export default function CursosAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<Course["audience"]>("technician");
  const [emitCert, setEmitCert] = useState(true);
  const [requiredPct, setRequiredPct] = useState("100");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Course[]>("/courses?include_unpublished=true");
      setCourses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setAudience("technician");
    setEmitCert(true);
    setRequiredPct("100");
    setError(null);
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError("Informe o título");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post("/courses", {
        title,
        description: description || null,
        audience,
        emit_certificate: emitCert,
        required_completion_pct: Number(requiredPct) || 100,
      });
      toast.success("Curso criado");
      setShowModal(false);
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePublish(c: Course) {
    try {
      await apiClient.patch(`/courses/${c.id}`, { is_published: !c.is_published });
      toast.success(c.is_published ? "Despublicado" : "Publicado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleDelete(c: Course) {
    if (!confirm(`Despublicar curso "${c.title}"?`)) return;
    try {
      await apiClient.delete(`/courses/${c.id}`);
      toast.success("Curso despublicado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Cursos
          </h1>
          <p className="text-muted-foreground">
            Trilhas de aprendizagem para técnicos e lojas — vídeos, textos,
            PDFs e quizzes.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Novo curso
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="Nenhum curso cadastrado"
          description="Crie sua primeira trilha clicando em Novo curso."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const aud = AUDIENCE_LABELS[c.audience];
            const AudIcon = aud.icon;
            const moduleCount = c.modules?.length ?? 0;
            const lessonCount =
              c.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <GraduationCap className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                          title={c.is_published ? "Despublicar" : "Publicar"}
                        >
                          {c.is_published ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold leading-tight">
                        <Link
                          href={`/cursos/${c.id}`}
                          className="hover:text-primary"
                        >
                          {c.title}
                        </Link>
                      </h3>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                          c.is_published
                            ? "bg-green-500/10 text-green-700 dark:text-green-300"
                            : "bg-zinc-500/10 text-zinc-500"
                        )}
                      >
                        {c.is_published ? "Publicado" : "Rascunho"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-300">
                        <AudIcon className="h-3 w-3" />
                        {aud.label}
                      </span>
                      {c.emit_certificate && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                          🎓 Certificado
                        </span>
                      )}
                    </div>
                    <div className="border-t pt-2 text-xs text-muted-foreground">
                      <strong>{moduleCount}</strong> módulo
                      {moduleCount === 1 ? "" : "s"} ·{" "}
                      <strong>{lessonCount}</strong> aula
                      {lessonCount === 1 ? "" : "s"} · concluir com{" "}
                      <strong>{c.required_completion_pct}%</strong>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={showModal} onClose={() => setShowModal(false)}>
        <DialogHeader>
          <DialogTitle>Novo curso</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Título *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Instalação de piso vinílico"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Público-alvo</label>
              <SelectNative
                value={audience}
                onChange={(e) => setAudience(e.target.value as Course["audience"])}
              >
                <option value="all">Todos</option>
                <option value="technician">Técnicos</option>
                <option value="partner">Lojas</option>
                <option value="admin">Admin</option>
              </SelectNative>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">% pra concluir</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={requiredPct}
                onChange={(e) => setRequiredPct(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
            <input
              type="checkbox"
              checked={emitCert}
              onChange={(e) => setEmitCert(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Emitir certificado em PDF ao concluir</span>
          </label>
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} isLoading={submitting}>
            Criar curso
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
