"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  AlertCircle,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  ListChecks,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
} from "@/lib/types";
import { checklistTemplatesApi } from "@/lib/api";
import { usePaginatedApi } from "@/hooks/use-api";
import { toast } from "sonner";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ============================================================
// Card Skeleton
// ============================================================

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// Constants
// ============================================================

const ITEMS_PER_PAGE = 9;

// ============================================================
// Template Form Component
// ============================================================

interface TemplateFormProps {
  template?: ChecklistTemplate | null;
  onSave: () => void;
  onCancel: () => void;
}

function TemplateForm({ template, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(
    template?.description ?? ""
  );
  const [items, setItems] = useState<
    { id: string; label: string; required: boolean; order: number }[]
  >(
    template?.items?.map((item) => ({
      id: item.id,
      label: item.label,
      required: item.required,
      order: item.order,
    })) ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const isEditing = !!template;

  function generateId() {
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function addItem() {
    const nextOrder =
      items.length > 0 ? Math.max(...items.map((i) => i.order)) + 1 : 1;
    setItems([
      ...items,
      { id: generateId(), label: "", required: false, order: nextOrder },
    ]);
  }

  function removeItem(id: string) {
    const filtered = items.filter((item) => item.id !== id);
    // Reorder items
    setItems(
      filtered.map((item, index) => ({ ...item, order: index + 1 }))
    );
  }

  function updateItemLabel(id: string, label: string) {
    setItems(items.map((item) => (item.id === id ? { ...item, label } : item)));
  }

  function updateItemRequired(id: string, required: boolean) {
    setItems(
      items.map((item) => (item.id === id ? { ...item, required } : item))
    );
  }

  function moveItem(id: string, direction: "up" | "down") {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === items.length - 1) return;

    const newItems = [...items];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[swapIndex]] = [
      newItems[swapIndex],
      newItems[index],
    ];
    // Update order numbers
    setItems(newItems.map((item, i) => ({ ...item, order: i + 1 })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNameError(null);

    if (!name.trim()) {
      setNameError("O nome do template e obrigatorio.");
      return;
    }

    // Filter out items with empty labels
    const validItems = items.filter((item) => item.label.trim() !== "");

    if (validItems.length === 0) {
      setError("Adicione pelo menos um item ao checklist.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        items: validItems.map((item) => ({
          label: item.label.trim(),
          required: item.required,
          order: item.order,
        })),
      };

      if (isEditing && template) {
        await checklistTemplatesApi.update(template.id, payload);
      } else {
        await checklistTemplatesApi.create(payload);
      }

      onSave();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar template.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isEditing ? "Editar Template" : "Novo Template"}
            </h2>
            <button
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Template Name */}
            <Input
              label="Nome do Template *"
              placeholder="Ex: Checklist de Instalacao de Piso"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              error={nameError ?? undefined}
            />

            {/* Description */}
            <div className="w-full space-y-2">
              <label className="text-sm font-medium leading-none text-foreground/80">
                Descricao
              </label>
              <textarea
                placeholder="Descreva o objetivo deste template de checklist..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={cn(
                  "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                  "ring-offset-background",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                  "focus-visible:border-primary",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "transition-all duration-200 resize-none"
                )}
              />
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Itens do Checklist
                </label>
                <span className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "item" : "itens"}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <ListChecks className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum item adicionado.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clique em &quot;Adicionar Item&quot; para comecar.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2 rounded-xl border bg-background p-3"
                    >
                      {/* Order number */}
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                        {item.order}
                      </span>

                      {/* Label input */}
                      <input
                        type="text"
                        placeholder="Descricao do item..."
                        value={item.label}
                        onChange={(e) =>
                          updateItemLabel(item.id, e.target.value)
                        }
                        className={cn(
                          "flex h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm",
                          "placeholder:text-muted-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                          "transition-all duration-200"
                        )}
                      />

                      {/* Required toggle */}
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(e) =>
                            updateItemRequired(item.id, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                          Obrigatorio
                        </span>
                      </label>

                      {/* Move up/down */}
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, "up")}
                        disabled={index === 0}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, "down")}
                        disabled={index === items.length - 1}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="w-full"
              >
                <Plus className="h-4 w-4" />
                Adicionar Item
              </Button>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={isSaving}>
                {isEditing ? "Salvar Alteracoes" : "Criar Template"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Checklists Templates Page
// ============================================================

export default function ChecklistsPage() {
  const [view, setView] = useState<"list" | "form">("list");
  const [editingTemplate, setEditingTemplate] =
    useState<ChecklistTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch templates
  const {
    data: templates,
    meta,
    error,
    isLoading,
    page: currentPage,
    setPage: setCurrentPage,
    mutate,
  } = usePaginatedApi<ChecklistTemplate>(
    useCallback(
      (page: number, limit: number) => {
        return checklistTemplatesApi.list({
          page,
          limit,
          search: debouncedSearch || undefined,
          is_active:
            activeFilter === "all"
              ? undefined
              : activeFilter === "active"
                ? true
                : false,
        });
      },
      [debouncedSearch, activeFilter]
    ),
    1,
    ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeFilter, setCurrentPage]);

  const totalItems = meta?.total ?? 0;
  const totalPages = meta?.total_pages ?? 1;

  function handleNewTemplate() {
    setEditingTemplate(null);
    setView("form");
  }

  function handleEditTemplate(template: ChecklistTemplate) {
    setEditingTemplate(template);
    setView("form");
  }

  async function handleDeactivate(template: ChecklistTemplate) {
    try {
      await checklistTemplatesApi.deactivate(template.id);
      mutate();
      toast.success("Template desativado com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao desativar template";
      toast.error(message);
    }
  }

  async function handleActivate(template: ChecklistTemplate) {
    try {
      await checklistTemplatesApi.update(template.id, {
        name: template.name,
      });
      mutate();
      toast.success("Template ativado com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao ativar template";
      toast.error(message);
    }
  }

  function handleFormSave() {
    setView("list");
    setEditingTemplate(null);
    mutate();
  }

  function handleFormCancel() {
    setView("list");
    setEditingTemplate(null);
  }

  // ============================================================
  // Form View
  // ============================================================

  if (view === "form") {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {editingTemplate ? "Editar Template" : "Novo Template"}
          </h1>
          <p className="text-muted-foreground">
            {editingTemplate
              ? "Altere as informacoes do template de checklist."
              : "Preencha os dados para criar um novo template de checklist."}
          </p>
        </motion.div>

        <TemplateForm
          template={editingTemplate}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // ============================================================
  // Error State
  // ============================================================

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              Templates de Checklist
            </h1>
          </div>
          <Button onClick={handleNewTemplate}>
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-medium text-foreground">
                Erro ao carregar templates
              </p>
              <p className="text-sm text-muted-foreground">
                {error.message ||
                  "Ocorreu um erro inesperado. Tente novamente."}
              </p>
            </div>
            <Button variant="outline" onClick={() => mutate()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // List View
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Templates de Checklist
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalItems} template${totalItems !== 1 ? "s" : ""} encontrado${totalItems !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={handleNewTemplate}>
          <Plus className="h-4 w-4" />
          Novo Template
        </Button>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm",
                      "placeholder:text-muted-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                      "focus-visible:border-primary",
                      "transition-all duration-200"
                    )}
                  />
                </div>
              </div>

              {/* Active/Inactive Filter Toggle */}
              <div className="flex items-center gap-1 rounded-xl border border-input p-1">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                    activeFilter === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Todos
                </button>
                <button
                  onClick={() => setActiveFilter("active")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                    activeFilter === "active"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ativos
                </button>
                <button
                  onClick={() => setActiveFilter("inactive")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                    activeFilter === "inactive"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Inativos
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <CardSkeleton />
      ) : !templates || templates.length === 0 ? (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1 text-center">
                <p className="font-medium text-foreground">
                  Nenhum template encontrado
                </p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || activeFilter !== "all"
                    ? "Tente alterar os filtros ou a busca."
                    : "Crie seu primeiro template de checklist para comecar."}
                </p>
              </div>
              {!debouncedSearch && activeFilter === "all" && (
                <Button onClick={handleNewTemplate}>
                  <Plus className="h-4 w-4" />
                  Criar Template
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        /* Template Cards Grid */
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <Card
                  hover
                  className={cn(
                    "h-full",
                    !template.is_active && "opacity-60"
                  )}
                >
                  <CardContent className="flex h-full flex-col p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <ClipboardCheck className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold leading-snug">
                          {template.name}
                        </h3>
                      </div>
                      <Badge
                        variant={
                          template.is_active ? "success" : "gray"
                        }
                      >
                        {template.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    {/* Description */}
                    {template.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    )}

                    {/* Spacer to push footer to bottom */}
                    <div className="flex-1" />

                    {/* Info Row */}
                    <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5" />
                        <span>
                          {template.items?.length ?? 0}{" "}
                          {(template.items?.length ?? 0) === 1
                            ? "item"
                            : "itens"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(template.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        className="flex-1"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      {template.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(template)}
                          className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Desativar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(template)}
                          className="flex-1 text-green-600 hover:bg-green-500/10 hover:text-green-600"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ativar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Mostrando{" "}
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1} a{" "}
                      {Math.min(
                        currentPage * ITEMS_PER_PAGE,
                        totalItems
                      )}{" "}
                      de {totalItems}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={currentPage === 1}
                        onClick={() =>
                          setCurrentPage(currentPage - 1)
                        }
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from({ length: totalPages }).map(
                        (_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i + 1)}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                              currentPage === i + 1
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {i + 1}
                          </button>
                        )
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={currentPage === totalPages}
                        onClick={() =>
                          setCurrentPage(currentPage + 1)
                        }
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
