"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit,
  Ban,
  RotateCcw,
  CheckCircle2,
  Star,
  ListChecks,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Loader2,
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
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { specialtiesApi } from "@/lib/api";
import type { Specialty, ChecklistItemPayload } from "@/lib/api/specialties";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ============================================================
// Formulário da especialidade (criar/editar)
// ============================================================

interface SpecialtyFormProps {
  open: boolean;
  specialty: Specialty | null;
  onClose: () => void;
  onSaved: () => void;
}

function SpecialtyForm({
  open,
  specialty,
  onClose,
  onSaved,
}: SpecialtyFormProps) {
  const isEditing = !!specialty;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(specialty?.name ?? "");
      setDescription(specialty?.description ?? "");
      setError(null);
    }
  }, [open, specialty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da especialidade.");
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing && specialty) {
        await specialtiesApi.update(specialty.id, {
          name: name.trim(),
          description: description.trim() || null,
        });
        toast.success("Especialidade atualizada");
      } else {
        await specialtiesApi.create({
          name: name.trim(),
          description: description.trim() || null,
        });
        toast.success("Especialidade criada");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, "Erro ao salvar"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar especialidade" : "Nova especialidade"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Nome
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Instalação de piso SPC"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
            />
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
            {isEditing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ============================================================
// Editor de checklist da especialidade
// ============================================================

interface DraftItem extends ChecklistItemPayload {
  draftId: string;
}

function makeDraftId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyItem(orderIndex: number): DraftItem {
  return {
    draftId: makeDraftId(),
    label: "",
    weight: 1,
    order_index: orderIndex,
  };
}

interface ChecklistEditorProps {
  open: boolean;
  specialty: Specialty | null;
  onClose: () => void;
  onSaved: () => void;
}

function ChecklistEditor({
  open,
  specialty,
  onClose,
  onSaved,
}: ChecklistEditorProps) {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !specialty) return;
    setError(null);
    setLoading(true);
    specialtiesApi
      .getChecklist(specialty.id)
      .then((data) => {
        setItems(
          data.length
            ? data.map((it) => ({
                draftId: it.id,
                id: it.id,
                label: it.label,
                weight: it.weight,
                order_index: it.order_index,
              }))
            : [emptyItem(1)]
        );
      })
      .catch((err: unknown) => setError(errMsg(err, "Erro ao carregar")))
      .finally(() => setLoading(false));
  }, [open, specialty]);

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

  async function handleSave() {
    if (!specialty) return;
    setError(null);
    const valid = items.filter((it) => it.label.trim().length > 0);
    if (valid.length === 0) {
      setError("Adicione ao menos um critério.");
      return;
    }
    setIsSaving(true);
    try {
      await specialtiesApi.saveChecklist(
        specialty.id,
        valid.map((it, idx) => ({
          id: it.id,
          label: it.label.trim(),
          weight: Math.max(1, Number(it.weight) || 1),
          order_index: idx + 1,
        }))
      );
      toast.success("Checklist salvo");
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, "Erro ao salvar checklist"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Checklist — {specialty?.name}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Critérios que o avaliador da Reallliza pontua (1 a 5) numa OS desta
          especialidade. O peso dá mais ou menos importância ao critério.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div
                key={it.draftId}
                className="flex items-center gap-2 rounded-lg border bg-background p-2"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveItem(it.draftId, "up")}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(it.draftId, "down")}
                    disabled={idx === items.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  value={it.label}
                  onChange={(e) =>
                    patchItem(it.draftId, { label: e.target.value })
                  }
                  placeholder="Critério (ex: Acabamento das bordas)"
                  className="h-9 flex-1"
                />
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">Peso</label>
                  <Input
                    type="number"
                    min={1}
                    value={it.weight ?? 1}
                    onChange={(e) =>
                      patchItem(it.draftId, {
                        weight: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="h-9 w-16"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeItem(it.draftId)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="w-full"
            >
              <Plus className="h-4 w-4" /> Adicionar critério
            </Button>
          </div>
        )}

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
        <Button type="button" onClick={handleSave} isLoading={isSaving}>
          Salvar checklist
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ============================================================
// Página
// ============================================================

export default function EspecialidadesPage() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Specialty | null>(null);
  const [checklistOf, setChecklistOf] = useState<Specialty | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await specialtiesApi.list({
        include_inactive: includeInactive,
      });
      setSpecialties(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar especialidades"));
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeactivate(s: Specialty) {
    if (!confirm(`Desativar a especialidade "${s.name}"?`)) return;
    try {
      await specialtiesApi.remove(s.id);
      toast.success("Especialidade desativada");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao desativar"));
    }
  }

  async function handleReactivate(s: Specialty) {
    try {
      await specialtiesApi.update(s.id, { is_active: true });
      toast.success("Especialidade reativada");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao reativar"));
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
            Especialidades Técnicas
          </h1>
          <p className="text-muted-foreground">
            Competências avaliadas no profissional. Cada uma tem seu checklist
            de critérios de qualidade.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nova Especialidade
        </Button>
      </motion.div>

      <Card>
        <CardContent className="flex items-center justify-end gap-2 p-3">
          <button
            onClick={() => setIncludeInactive(false)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              !includeInactive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Ativas
          </button>
          <button
            onClick={() => setIncludeInactive(true)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              includeInactive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Todas
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : specialties.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star className="h-6 w-6" />}
            title="Nenhuma especialidade cadastrada"
            description="Crie uma especialidade e monte o checklist de qualidade dela."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {specialties.map((s, idx) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <Card
                  hover
                  className={cn("h-full", !s.is_active && "opacity-60")}
                >
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Star className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold leading-snug">
                          {s.name}
                        </h3>
                      </div>
                      {!s.is_active && (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </div>

                    {s.description && (
                      <p className="text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}

                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Badge variant="secondary" className="gap-1">
                        <ListChecks className="h-3 w-3" />
                        {s.checklist.length} critério(s)
                      </Badge>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setChecklistOf(s)}
                      >
                        <ListChecks className="h-4 w-4" /> Checklist
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(s);
                          setShowForm(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {s.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeactivate(s)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReactivate(s)}
                        >
                          <RotateCcw className="h-4 w-4 text-green-600" />
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

      <SpecialtyForm
        open={showForm}
        specialty={editing}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
      <ChecklistEditor
        open={!!checklistOf}
        specialty={checklistOf}
        onClose={() => setChecklistOf(null)}
        onSaved={load}
      />
    </div>
  );
}
