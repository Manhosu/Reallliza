"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit,
  Copy,
  Ban,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  ListChecks,
  Camera,
  Hammer,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { stepTemplatesApi } from "@/lib/api";
import type {
  StepTemplateGroup,
  StepTemplateItemPayload,
} from "@/lib/api/step-templates";

interface DraftItem extends StepTemplateItemPayload {
  draftId: string;
}

function makeDraftId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyItem(orderIndex: number): DraftItem {
  return {
    draftId: makeDraftId(),
    name: "",
    description: "",
    order_index: orderIndex,
    photos_required_min: 1,
    final_photos_required_min: 1,
    occurrence_enabled: true,
    is_required: true,
    wait_time_minutes: 0,
  };
}

interface TemplateFormProps {
  open: boolean;
  template: StepTemplateGroup | null;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateForm({ open, template, onClose, onSaved }: TemplateFormProps) {
  const isEditing = !!template;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setDescription(template?.description ?? "");
      setItems(
        template?.items?.length
          ? template.items.map((it) => ({
              draftId: it.id,
              id: it.id,
              step_key: it.step_key,
              name: it.name,
              description: it.description ?? "",
              order_index: it.order_index,
              photos_required_min: it.photos_required_min,
              final_photos_required_min: it.final_photos_required_min,
              occurrence_enabled: it.occurrence_enabled,
              is_required: it.is_required,
              wait_time_minutes: it.wait_time_minutes ?? 0,
            }))
          : [emptyItem(1)]
      );
      setError(null);
    }
  }, [open, template]);

  function addItem() {
    setItems((prev) => [...prev, emptyItem(prev.length + 1)]);
  }

  function removeItem(draftId: string) {
    setItems((prev) =>
      prev
        .filter((it) => it.draftId !== draftId)
        .map((it, idx) => ({ ...it, order_index: idx + 1 }))
    );
  }

  function moveItem(draftId: string, dir: "up" | "down") {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.draftId === draftId);
      if (idx === -1) return prev;
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((it, i) => ({ ...it, order_index: i + 1 }));
    });
  }

  function patchItem(draftId: string, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it) => (it.draftId === draftId ? { ...it, ...patch } : it))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do template.");
      return;
    }
    const valid = items.filter((it) => it.name.trim().length > 0);
    if (valid.length === 0) {
      setError("Adicione ao menos uma etapa com nome.");
      return;
    }

    const payloadItems: StepTemplateItemPayload[] = valid.map((it, idx) => ({
      step_key: it.step_key,
      name: it.name.trim(),
      description: it.description?.trim() || null,
      order_index: idx + 1,
      photos_required_min: Math.max(0, Number(it.photos_required_min) || 0),
      final_photos_required_min: Math.max(
        0,
        Number(it.final_photos_required_min) || 0
      ),
      occurrence_enabled: it.occurrence_enabled ?? true,
      is_required: it.is_required ?? true,
      wait_time_minutes: Math.max(
        0,
        Math.min(1440, Math.round(Number(it.wait_time_minutes ?? 0)))
      ),
    }));

    setIsSaving(true);
    try {
      if (isEditing && template) {
        await stepTemplatesApi.update(template.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          items: payloadItems,
        });
        toast.success("Template atualizado");
      } else {
        await stepTemplatesApi.create({
          name: name.trim(),
          description: description.trim() || undefined,
          items: payloadItems,
        });
        toast.success("Template criado");
      }
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>
          {isEditing ? "Editar template" : "Novo template de execução"}
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-5 pt-4">
          <Input
            label="Nome do template *"
            placeholder="Ex: Instalação de Piso Vinílico Colado"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none text-foreground/80">
              Descrição
            </label>
            <textarea
              className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Para que serve este template..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground/80">
                Etapas ({items.length})
              </label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4" /> Adicionar etapa
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma etapa. Clique em &quot;Adicionar etapa&quot;.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <motion.div
                    key={it.draftId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border bg-background p-3 space-y-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder="Nome da etapa..."
                        value={it.name}
                        onChange={(e) =>
                          patchItem(it.draftId, { name: e.target.value })
                        }
                        className="flex h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => moveItem(it.draftId, "up")}
                        disabled={idx === 0}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(it.draftId, "down")}
                        disabled={idx === items.length - 1}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(it.draftId)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <textarea
                      placeholder="Descrição / orientação para o técnico..."
                      value={it.description ?? ""}
                      onChange={(e) =>
                        patchItem(it.draftId, { description: e.target.value })
                      }
                      rows={2}
                      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                      <div className="space-y-1">
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Camera className="h-3 w-3" /> Fotos iniciais mín.
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={it.photos_required_min ?? 1}
                          onChange={(e) =>
                            patchItem(it.draftId, {
                              photos_required_min: parseInt(e.target.value || "0", 10),
                            })
                          }
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Camera className="h-3 w-3" /> Fotos finais mín.
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={it.final_photos_required_min ?? 1}
                          onChange={(e) =>
                            patchItem(it.draftId, {
                              final_photos_required_min: parseInt(
                                e.target.value || "0",
                                10
                              ),
                            })
                          }
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      {/* Tempo de cura/secagem (Jessica 18/06): destrava a
                          proxima etapa apenas depois desse tempo. */}
                      <div
                        className="space-y-1"
                        title="Minutos de cura/secagem após esta etapa antes da próxima destravar (0 = libera imediato)"
                      >
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          ⏱ Tempo espera (min)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          value={it.wait_time_minutes ?? 0}
                          onChange={(e) =>
                            patchItem(it.draftId, {
                              wait_time_minutes: Math.max(
                                0,
                                Math.min(
                                  1440,
                                  parseInt(e.target.value || "0", 10) || 0
                                )
                              ),
                            })
                          }
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!it.occurrence_enabled}
                          onChange={(e) =>
                            patchItem(it.draftId, {
                              occurrence_enabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <span>Ocorrência</span>
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!it.is_required}
                          onChange={(e) =>
                            patchItem(it.draftId, {
                              is_required: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        <span>Obrigatória</span>
                      </label>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </DialogContent>
        <DialogFooter className="border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Criar template"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export default function TemplatesExecucaoPage() {
  const [groups, setGroups] = useState<StepTemplateGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StepTemplateGroup | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await stepTemplatesApi.list({
        include_inactive: includeInactive,
      });
      setGroups(data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar templates";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  function handleNew() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(group: StepTemplateGroup) {
    setEditing(group);
    setShowForm(true);
  }

  async function handleDuplicate(group: StepTemplateGroup) {
    try {
      await stepTemplatesApi.create({
        name: `${group.name} (cópia)`,
        description: group.description ?? undefined,
        items: group.items.map((it, idx) => ({
          name: it.name,
          description: it.description,
          order_index: idx + 1,
          photos_required_min: it.photos_required_min,
          final_photos_required_min: it.final_photos_required_min,
          occurrence_enabled: it.occurrence_enabled,
          is_required: it.is_required,
          wait_time_minutes: it.wait_time_minutes ?? 0,
        })),
      });
      toast.success("Template duplicado");
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao duplicar";
      toast.error(message);
    }
  }

  async function handleDeactivate(group: StepTemplateGroup) {
    if (!confirm(`Desativar o template "${group.name}"?`)) return;
    try {
      await stepTemplatesApi.remove(group.id);
      toast.success("Template desativado");
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao desativar";
      toast.error(message);
    }
  }

  async function handleReactivate(group: StepTemplateGroup) {
    try {
      await stepTemplatesApi.update(group.id, { is_active: true });
      toast.success("Template reativado");
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao reativar";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Templates de Execução
          </h1>
          <p className="text-muted-foreground">
            Modelos de etapas que o técnico segue durante a execução de uma OS.
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4" /> Novo Template
        </Button>
      </motion.div>

      <Card>
        <CardContent className="flex items-center justify-end gap-2 p-3">
          <button
            onClick={() => setIncludeInactive(false)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              !includeInactive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Ativos
          </button>
          <button
            onClick={() => setIncludeInactive(true)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              includeInactive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Todos
          </button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-6">
                <div className="h-5 w-3/5 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Hammer className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-medium">Nenhum template cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Crie um template para organizar as etapas de execução.
              </p>
            </div>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" /> Criar template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {groups.map((g, idx) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <Card hover className={cn("h-full", !g.is_active && "opacity-60")}>
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <ListChecks className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold leading-snug">{g.name}</h3>
                      </div>
                      <Badge variant={g.is_active ? "success" : "gray"}>
                        {g.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    {g.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {g.description}
                      </p>
                    )}

                    <div className="flex-1" />

                    <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                      <span>
                        {g.items?.length ?? 0}{" "}
                        {(g.items?.length ?? 0) === 1 ? "etapa" : "etapas"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(g)}
                        className="flex-1"
                      >
                        <Edit className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicate(g)}
                      >
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </Button>
                      {g.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(g)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Ban className="h-3.5 w-3.5" /> Desativar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReactivate(g)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Reativar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <TemplateForm
        open={showForm}
        template={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
