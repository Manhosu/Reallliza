"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  ClipboardList,
  Clock,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select-native";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { usersApi, stepTemplatesApi } from "@/lib/api";
import { UserRole } from "@/lib/types";
import type { Profile } from "@/lib/types";
import type { StepTemplateGroup } from "@/lib/api/step-templates";
import { cn } from "@/lib/utils";

/**
 * Fila de "Aguardando Designação" (Jessica 24/06).
 * Lista OSs criadas automaticamente do webhook Asaas modalidade Reallliza
 * que ainda nao tem tecnico + template. Admin escolhe os dois e libera.
 */

interface AwaitingOs {
  id: string;
  title: string;
  status: string;
  priority: string;
  client_name: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string;
  partner: { id: string; company_name?: string | null } | null;
}

const PRIORITY_META: Record<
  string,
  { label: string; color: string; ring: string; rank: number }
> = {
  urgent: { label: "Urgente", color: "text-red-500", ring: "ring-red-500/40", rank: 0 },
  high: { label: "Alta", color: "text-orange-500", ring: "ring-orange-500/40", rank: 1 },
  medium: { label: "Média", color: "text-yellow-600", ring: "ring-yellow-500/40", rank: 2 },
  low: { label: "Baixa", color: "text-zinc-500", ring: "ring-zinc-500/40", rank: 3 },
};

export default function DesignacaoPage() {
  const [orders, setOrders] = useState<AwaitingOs[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState<AwaitingOs | null>(null);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<StepTemplateGroup[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({
    technician_id: "",
    step_template_group_id: "",
    scheduled_date: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ data: AwaitingOs[] }>(
        "/service-orders?status=awaiting_assignment&limit=200"
      );
      const rows = Array.isArray(data) ? (data as unknown as AwaitingOs[]) : data.data ?? [];
      // ordena por prioridade DESC, depois created_at ASC (mais antigo primeiro)
      rows.sort((a, b) => {
        const ra = PRIORITY_META[a.priority]?.rank ?? 9;
        const rb = PRIORITY_META[b.priority]?.rank ?? 9;
        if (ra !== rb) return ra - rb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setOrders(rows);
    } catch (err) {
      console.error("load awaiting_assignment failed", err);
      toast.error("Falha ao carregar fila de designação");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Carrega dropdowns 1x
    (async () => {
      try {
        const [t, tpl] = await Promise.all([
          usersApi.list({ role: UserRole.TECHNICIAN, limit: 200 }),
          stepTemplatesApi.list().catch(() => [] as StepTemplateGroup[]),
        ]);
        setTechnicians(t.data);
        setTemplates(tpl || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  function openAssign(os: AwaitingOs) {
    setAssignTarget(os);
    setForm({
      technician_id: "",
      step_template_group_id: "",
      scheduled_date: "",
      scheduled_start_time: "",
      scheduled_end_time: "",
    });
  }

  async function submitAssign() {
    if (!assignTarget) return;
    if (!form.technician_id) {
      toast.error("Escolha um técnico");
      return;
    }
    if (!form.step_template_group_id) {
      toast.error("Escolha um template de etapas");
      return;
    }
    setAssigning(true);
    try {
      await apiClient.post(`/service-orders/${assignTarget.id}/assign`, {
        technician_id: form.technician_id,
        step_template_group_id: form.step_template_group_id,
        scheduled_date: form.scheduled_date || undefined,
        scheduled_start_time: form.scheduled_start_time || undefined,
        scheduled_end_time: form.scheduled_end_time || undefined,
      });
      toast.success("OS designada com sucesso");
      setAssignTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao designar");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link
          href="/os"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Ordens de Serviço
        </Link>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Aguardando Designação
        </h1>
        <p className="text-sm text-muted-foreground">
          OSs modalidade Reallliza recém-pagas pela loja parceira. Escolha técnico
          e template de etapas para liberar a execução. Ordenadas por prioridade —
          urgentes no topo.
        </p>
      </motion.div>

      {loading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhuma OS aguardando designação no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {orders.map((os) => {
              const p = PRIORITY_META[os.priority] ?? PRIORITY_META.medium;
              const isUrgent = os.priority === "urgent";
              return (
                <motion.div
                  key={os.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <Card
                    className={cn(
                      "transition",
                      isUrgent && "ring-2 ring-red-500/30"
                    )}
                  >
                    <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">{os.title}</p>
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              p.color,
                              p.ring
                            )}
                          >
                            {p.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {os.client_name || "Cliente não informado"} ·{" "}
                          {os.address_city && os.address_state
                            ? `${os.address_city}/${os.address_state}`
                            : "Endereço não informado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {new Date(os.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href={`/os/${os.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-secondary"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" /> Ver
                        </Link>
                        <button
                          onClick={() => openAssign(os)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Designar
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal Designar */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold">Designar OS</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {assignTarget.title}
            </p>

            <div className="mt-4 space-y-3">
              <SelectNative
                label="Técnico"
                value={form.technician_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, technician_id: e.target.value }))
                }
                required
              >
                <option value="">Selecione…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </SelectNative>

              <SelectNative
                label="Template de Execução"
                value={form.step_template_group_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    step_template_group_id: e.target.value,
                  }))
                }
                required
              >
                <option value="">Selecione…</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </SelectNative>

              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Ajustar agendamento (opcional)
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  As jornadas de 8h já foram criadas automaticamente e
                  receberão o técnico designado. Preencha aqui só se quiser
                  substituir a data/hora.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Input
                    type="date"
                    value={form.scheduled_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scheduled_date: e.target.value }))
                    }
                    placeholder="Data"
                  />
                  <Input
                    type="time"
                    value={form.scheduled_start_time}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduled_start_time: e.target.value,
                      }))
                    }
                    placeholder="Início"
                  />
                  <Input
                    type="time"
                    value={form.scheduled_end_time}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduled_end_time: e.target.value,
                      }))
                    }
                    placeholder="Fim"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Ao designar, a OS sai de "Aguardando Designação" e vira
                  visível pro técnico no app.
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setAssignTarget(null)}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                Cancelar
              </button>
              <Button onClick={submitAssign} isLoading={assigning}>
                <UserPlus className="h-4 w-4" />
                Confirmar designação
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
