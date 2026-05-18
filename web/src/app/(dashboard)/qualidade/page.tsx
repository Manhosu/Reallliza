"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ClipboardCheck,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  qualityEvaluationsApi,
  specialtiesApi,
  serviceOrdersApi,
  usersApi,
} from "@/lib/api";
import { OsStatus } from "@/lib/types";
import type { QualityEvaluation } from "@/lib/api/quality-evaluations";
import type { Specialty } from "@/lib/api/specialties";
import type { ServiceOrder, Profile } from "@/lib/types";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

// ============================================================
// Formulário da avaliação de qualidade
// ============================================================

interface QualityFormProps {
  open: boolean;
  specialties: Specialty[];
  orders: ServiceOrder[];
  usersById: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

function QualityForm({
  open,
  specialties,
  orders,
  usersById,
  onClose,
  onSaved,
}: QualityFormProps) {
  const [orderId, setOrderId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [needsRework, setNeedsRework] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOrderId("");
      setSpecialtyId("");
      setScores({});
      setNeedsRework(false);
      setNotes("");
      setError(null);
    }
  }, [open]);

  const order = orders.find((o) => o.id === orderId) || null;
  const specialty = specialties.find((s) => s.id === specialtyId) || null;
  const checklist = specialty?.checklist ?? [];
  const technicianName = order?.technician_id
    ? usersById.get(order.technician_id) ?? "Profissional"
    : null;

  function setScore(itemId: string, value: number) {
    setScores((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!order) {
      setError("Selecione a Ordem de Serviço.");
      return;
    }
    if (!order.technician_id) {
      setError("Esta OS não tem profissional atribuído.");
      return;
    }
    if (!specialty) {
      setError("Selecione a especialidade.");
      return;
    }
    if (checklist.length === 0) {
      setError("Esta especialidade não tem checklist cadastrado.");
      return;
    }
    const missing = checklist.some((it) => !scores[it.id]);
    if (missing) {
      setError("Pontue todos os critérios do checklist (1 a 5).");
      return;
    }

    setIsSaving(true);
    try {
      await qualityEvaluationsApi.create({
        service_order_id: order.id,
        technician_id: order.technician_id,
        specialty_id: specialty.id,
        needs_rework: needsRework,
        notes: notes.trim() || undefined,
        scores: checklist.map((it) => ({
          checklist_item_id: it.id,
          item_label: it.label,
          weight: it.weight,
          score: scores[it.id],
        })),
      });
      toast.success("Avaliação de qualidade registrada");
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, "Erro ao salvar avaliação"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Nova avaliação de qualidade</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectNative
              label="Ordem de Serviço (concluída)"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  OS #{o.order_number} — {o.client_name}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              label="Especialidade executada"
              value={specialtyId}
              onChange={(e) => setSpecialtyId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectNative>
          </div>

          {technicianName && (
            <p className="text-sm text-muted-foreground">
              Profissional avaliado:{" "}
              <span className="font-medium text-foreground">
                {technicianName}
              </span>
            </p>
          )}

          {specialty && checklist.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Esta especialidade ainda não tem checklist. Cadastre em
              Especialidades.
            </div>
          )}

          {checklist.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground/80">
                Checklist — pontue de 1 a 5
              </p>
              {checklist.map((it) => (
                <div
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2.5"
                >
                  <span className="text-sm">
                    {it.label}
                    {it.weight > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (peso {it.weight})
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScore(it.id, n)}
                        className={cn(
                          "h-8 w-8 rounded-lg border text-sm font-medium transition-colors",
                          scores[it.id] === n
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={needsRework}
              onChange={(e) => setNeedsRework(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span>Necessita retrabalho</span>
          </label>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            Salvar avaliação
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ============================================================
// Página
// ============================================================

export default function QualidadePage() {
  const [evaluations, setEvaluations] = useState<QualityEvaluation[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const usersById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.full_name));
    return m;
  }, [users]);

  const loadEvaluations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await qualityEvaluationsApi.list();
      setEvaluations(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar avaliações"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRefs = useCallback(async () => {
    try {
      const [specs, ordersRes, usersRes] = await Promise.all([
        specialtiesApi.list(),
        serviceOrdersApi.list({ status: OsStatus.COMPLETED, limit: 100 }),
        usersApi.list({ limit: 200 }),
      ]);
      setSpecialties(specs || []);
      setOrders(
        (ordersRes.data || []).filter((o) => !!o.technician_id)
      );
      setUsers(usersRes.data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar dados de apoio"));
    }
  }, []);

  useEffect(() => {
    loadEvaluations();
    loadRefs();
  }, [loadEvaluations, loadRefs]);

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
            Avaliação de Qualidade
          </h1>
          <p className="text-muted-foreground">
            Avaliação técnica das OS executadas, por checklist da
            especialidade — fonte Qualidade do score do profissional.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Avaliação
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-12 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : evaluations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="Nenhuma avaliação de qualidade"
            description="Avalie uma OS concluída pelo checklist da especialidade."
            action={
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Nova Avaliação
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {evaluations.map((ev, idx) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3) }}
              >
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted",
                        scoreColor(ev.score)
                      )}
                    >
                      <span className="text-sm font-bold">
                        {Math.round(ev.score)}
                      </span>
                      <span className="text-[9px] uppercase">pts</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {ev.technician?.full_name ?? "Profissional"}
                        </p>
                        {ev.needs_rework && (
                          <Badge variant="secondary" className="gap-1">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                            Retrabalho
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ev.specialty?.name ?? "Sem especialidade"}
                        {ev.service_order
                          ? ` · OS #${ev.service_order.order_number}`
                          : ""}
                        {" · "}
                        {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                      </p>
                      {ev.notes && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <QualityForm
        open={showForm}
        specialties={specialties}
        orders={orders}
        usersById={usersById}
        onClose={() => setShowForm(false)}
        onSaved={loadEvaluations}
      />
    </div>
  );
}
