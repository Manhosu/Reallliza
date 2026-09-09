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
  Ban,
  Tag,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectNative } from "@/components/ui/select-native";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient, getAccessToken, BASE_URL } from "@/lib/api/client";
import { HardDeleteDialog, type Dependency } from "@/components/admin/hard-delete-dialog";
import { useExclusao } from "@/hooks/use-exclusao";
import { cn } from "@/lib/utils";

interface CourseCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order_index: number;
  is_active: boolean;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  category?: { id: string; name: string; icon: string | null } | null;
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

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

interface CategoriesPanelProps {
  categories: CourseCategory[];
  onChanged: () => void;
}

/**
 * Painel de categorias — mesmo padrão de `CategoriesPanel` em
 * servicos/page.tsx (service_categories), sem o vínculo de template de
 * etapas (não se aplica a curso).
 */
function CategoriesPanel({ categories, onChanged }: CategoriesPanelProps) {
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const [dependencias, setDependencias] = useState<Dependency[]>([]);
  const [carregandoDeps, setCarregandoDeps] = useState(false);

  async function criar() {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      await apiClient.post("/course-categories", {
        name: novoNome.trim(),
        order_index: categories.length,
      });
      setNovoNome("");
      toast.success("Categoria criada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao criar categoria"));
    } finally {
      setSaving(false);
    }
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    try {
      await apiClient.patch(`/course-categories/${id}`, { name: editNome.trim() });
      setEditId(null);
      toast.success("Categoria atualizada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao atualizar"));
    }
  }

  async function toggleAtivo(cat: CourseCategory) {
    try {
      await apiClient.patch(`/course-categories/${cat.id}`, { is_active: !cat.is_active });
      onChanged();
    } catch {
      toast.error("Erro ao atualizar categoria");
    }
  }

  const abrirExclusao = useCallback(async (id: string, nome: string) => {
    setExcluindo({ id, nome });
    setCarregandoDeps(true);
    try {
      const d = await apiClient.get<{ dependencies: Dependency[] }>(
        `/admin/dependencias?tabela=course_categories&id=${id}`
      );
      setDependencias(d.dependencies);
    } catch {
      setDependencias([]);
    } finally {
      setCarregandoDeps(false);
    }
  }, []);

  async function remover(cat: CourseCategory) {
    if (!confirm(`Desativar a categoria "${cat.name}"?`)) return;
    try {
      await apiClient.delete(`/course-categories/${cat.id}`);
      toast.success("Categoria desativada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao remover"));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Categorias</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Agrupam os cursos da biblioteca técnica. Crie, renomeie e ative/desative.
        </p>

        <div className="flex gap-2">
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            placeholder="Nova categoria (ex: Instalação, Perícia...)"
          />
          <Button onClick={criar} isLoading={saving} className="shrink-0">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="space-y-1">
          {categories.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background px-3 py-2",
                !c.is_active && "opacity-50"
              )}
            >
              {editId === c.id ? (
                <>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={() => salvarEdicao(c.id)}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    className="flex-1 text-left text-sm font-medium"
                    onClick={() => {
                      setEditId(c.id);
                      setEditNome(c.name);
                    }}
                  >
                    {c.name}
                  </button>
                  <button
                    onClick={() => toggleAtivo(c)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium",
                      c.is_active
                        ? "bg-green-500/15 text-green-600"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {c.is_active ? "Ativa" : "Inativa"}
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => remover(c)} title="Desativar">
                    <Ban className="h-4 w-4 text-amber-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void abrirExclusao(c.id, c.name)}
                    title="Excluir permanentemente"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              Nenhuma categoria cadastrada
            </p>
          )}
        </div>
      </CardContent>

      <HardDeleteDialog
        open={!!excluindo}
        entityLabel="categoria"
        entityName={excluindo?.nome ?? ""}
        dependencies={dependencias}
        loadingDeps={carregandoDeps}
        onClose={() => {
          setExcluindo(null);
          setDependencias([]);
        }}
        onConfirm={async () => {
          if (!excluindo) return;
          await apiClient.delete(`/course-categories/${excluindo.id}/purge`);
          onChanged();
        }}
      />
    </Card>
  );
}

export default function CursosAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
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

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiClient.get<CourseCategory[]>(
        "/course-categories?include_inactive=true"
      );
      setCategories(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    load();
    loadCategories();
  }, [load, loadCategories]);

  const visibleCourses = categoryFilter
    ? courses.filter((c) => c.category_id === categoryFilter)
    : courses;

  function resetForm() {
    setTitle("");
    setDescription("");
    setCategoryId("");
    setAudience("technician");
    setEmitCert(true);
    setRequiredPct("100");
    setThumbnailUrl(null);
    setError(null);
  }

  // Capa do curso — Jessica 09/09: `thumbnail_url` sempre existiu na
  // tabela e a listagem ja' mostrava a imagem quando presente, so' nunca
  // existiu um jeito de definir ela no form de criar curso. Reaproveita o
  // upload generico do Feed (admin-only, mesmo bucket "photos") em vez de
  // criar uma rota nova so' pra isso.
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  async function handleThumbnailUpload(file: File) {
    setUploadingThumb(true);
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
      setThumbnailUrl(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar imagem");
    } finally {
      setUploadingThumb(false);
    }
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
        category_id: categoryId || null,
        thumbnail_url: thumbnailUrl,
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

  /**
   * Despublicar e excluir são coisas diferentes.
   *
   * Havia um único ícone de lixeira, com o título "Remover", que apenas
   * despublicava: quem clicava via "sucesso" e o curso continuava no banco.
   * Era a última tela do sistema com esse engano.
   */
  const exclusao = useExclusao<Course>("courses", (c) => c.title);

  async function despublicar(c: Course) {
    if (!confirm(`Despublicar o curso "${c.title}"? Ele sai do catálogo e pode voltar.`)) return;
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

      <CategoriesPanel categories={categories} onChanged={loadCategories} />

      {categories.length > 0 && courses.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <SelectNative
            className="h-9 w-56 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectNative>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : visibleCourses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="Nenhum curso cadastrado"
          description="Crie sua primeira trilha clicando em Novo curso."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleCourses.map((c) => {
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
                          onClick={() => despublicar(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600"
                          title="Despublicar"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void exclusao.abrir(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Excluir permanentemente"
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
                      {c.category?.name && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">
                          <Tag className="h-3 w-3" />
                          {c.category.name}
                        </span>
                      )}
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
          <div className="space-y-1">
            <label className="text-sm font-medium">Capa do curso</label>
            {thumbnailUrl ? (
              <div className="relative">
                <img
                  src={thumbnailUrl}
                  alt="Capa do curso"
                  className="h-32 w-full rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() => setThumbnailUrl(null)}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-input text-sm text-muted-foreground hover:bg-muted/50">
                {uploadingThumb ? "Enviando..." : "Clique para enviar uma imagem"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumb}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleThumbnailUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Categoria</label>
            <SelectNative
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </SelectNative>
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

      <HardDeleteDialog
        {...exclusao.props("curso")}
        onConfirm={async () => {
          if (!exclusao.alvo) return;
          await apiClient.delete(`/courses/${exclusao.alvo.id}/purge`);
          load();
        }}
      />
    </div>
  );
}
