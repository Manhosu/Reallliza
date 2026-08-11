"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import { toolsApi } from "@/lib/api";
import type { ToolUnit } from "@/lib/tools/types";
import { RequestStatusBadge, REQUEST_LABELS } from "@/components/ferramentas/almox-badges";
import { KpiTile } from "@/components/ferramentas/kpi-tile";
import { ToolPhotosField, type PhotoRef } from "@/components/ferramentas/tool-photos-field";

/**
 * Pedidos (spec seções 11-14).
 *
 * Esta tela substitui as DUAS que existiam — a aba "Pedidos" e
 * /ferramentas/solicitacoes. Elas liam a mesma tabela com vocabulários
 * incompatíveis: uma conhecia 8 status e ignorava prioridade, a outra conhecia
 * 4 status e era toda baseada em prioridade. Um pedido "separating" aparecia
 * como texto cru na segunda.
 */

interface ToolRequest {
  id: string;
  tool_id: string | null;
  unit_id: string | null;
  tool_name: string;
  quantity: number;
  justification: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  rejection_reason: string | null;
  created_at: string;
  service_order_id: string | null;
  expected_return_at: string | null;
  requester?: { id: string; full_name: string } | null;
}

const PRIORITY_META: Record<
  string,
  { label: string; rank: number; ring: string; text: string }
> = {
  urgent: { label: "Urgente", rank: 4, ring: "ring-red-500/40", text: "text-red-500" },
  high: { label: "Alta", rank: 3, ring: "ring-orange-500/40", text: "text-orange-500" },
  medium: { label: "Média", rank: 2, ring: "ring-transparent", text: "text-muted-foreground" },
  low: { label: "Baixa", rank: 1, ring: "ring-transparent", text: "text-muted-foreground" },
};

/** Máquina de estados do operador — espelha a da API. */
const NEXT_ACTIONS: Record<string, Array<{ action: string; label: string; variant?: "outline" }>> = {
  pending: [
    { action: "approve", label: "Aprovar" },
    { action: "reject", label: "Recusar", variant: "outline" },
  ],
  approved: [
    { action: "separate", label: "Separar" },
    { action: "reject", label: "Recusar", variant: "outline" },
  ],
  separating: [{ action: "ready", label: "Pronta para retirada" }],
  awaiting_pickup: [{ action: "deliver", label: "Confirmar entrega" }],
  delivered: [],
  released: [],
  rejected: [],
  cancelled: [],
};

function PedidosContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "active");
  const [rows, setRows] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<ToolRequest | null>(null);
  const [delivering, setDelivering] = useState<ToolRequest | null>(null);
  const [rejecting, setRejecting] = useState<ToolRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ requests: ToolRequest[] } | ToolRequest[]>(
        "/tools/requests?status=all"
      );
      const list = Array.isArray(res) ? res : (res?.requests ?? []);
      // Urgente primeiro; dentro do mesmo nível, o mais antigo — era a única
      // coisa que a tela /solicitacoes fazia bem e que a aba Pedidos ignorava.
      list.sort((a, b) => {
        const pa = PRIORITY_META[a.priority]?.rank ?? 0;
        const pb = PRIORITY_META[b.priority]?.rank ?? 0;
        if (pa !== pb) return pb - pa;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setRows(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar os pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (req: ToolRequest, action: string, extra?: Record<string, unknown>) => {
    try {
      await toolsApi.patchRequest(req.id, { action, ...extra } as never);
      toast.success("Pedido atualizado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  };

  const ACTIVE = ["pending", "approved", "separating", "awaiting_pickup"];
  const filtered = rows.filter((r) => {
    if (status === "all") return true;
    if (status === "active") return ACTIVE.includes(r.status);
    if (status === "finished") return !ACTIVE.includes(r.status);
    return r.status === status;
  });

  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Solicitações feitas pelos técnicos no aplicativo.
        </p>
      </div>

      {/* Resumo da seção 11 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Em análise" value={count("pending")} accent="blue" isLoading={loading} />
        <KpiTile label="Aprovados" value={count("approved")} accent="green" isLoading={loading} />
        <KpiTile label="Separados" value={count("separating")} accent="amber" isLoading={loading} />
        <KpiTile label="Prontos p/ retirada" value={count("awaiting_pickup")} accent="cyan" isLoading={loading} />
        <KpiTile label="Recusados" value={count("rejected")} accent="red" isLoading={loading} />
        <KpiTile label="Cancelados" value={count("cancelled")} accent="zinc" isLoading={loading} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="w-56">
            <SelectNative
              label="Situação"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Em andamento</option>
              <option value="all">Todos</option>
              <option value="finished">Finalizados</option>
              {Object.entries(REQUEST_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectNative>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="Nenhum pedido"
              description="Não há solicitações com esse filtro."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const prio = PRIORITY_META[r.priority] ?? PRIORITY_META.medium;
            const actions = NEXT_ACTIONS[r.status] ?? [];
            return (
              <Card
                key={r.id}
                className={cn(
                  "transition-shadow",
                  r.priority === "urgent" && "ring-1",
                  prio.ring
                )}
              >
                <CardContent className="flex flex-wrap items-center gap-4 py-4">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {r.quantity}× {r.tool_name}
                      </p>
                      <RequestStatusBadge status={r.status} />
                      {r.priority !== "medium" && r.priority !== "low" && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium",
                            prio.text
                          )}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {prio.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.requester?.full_name ?? "—"} ·{" "}
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </p>
                    {r.justification && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {r.justification}
                      </p>
                    )}
                    {r.rejection_reason && (
                      <p className="mt-1 text-xs text-red-500">
                        Motivo da recusa: {r.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button
                        key={a.action}
                        size="sm"
                        variant={a.variant}
                        onClick={() => {
                          if (a.action === "approve") setApproving(r);
                          else if (a.action === "deliver") setDelivering(r);
                          else if (a.action === "reject") setRejecting(r);
                          else void act(r, a.action);
                        }}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {approving && (
        <SelecionarUnidadeDialog
          request={approving}
          mode="approve"
          onClose={() => setApproving(null)}
          onDone={async (extra) => {
            await act(approving, "approve", extra);
            setApproving(null);
          }}
        />
      )}

      {delivering && (
        <SelecionarUnidadeDialog
          request={delivering}
          mode="deliver"
          onClose={() => setDelivering(null)}
          onDone={async (extra) => {
            await act(delivering, "deliver", extra);
            setDelivering(null);
          }}
        />
      )}

      {rejecting && (
        <RecusarDialog
          onClose={() => setRejecting(null)}
          onDone={async (reason) => {
            await act(rejecting, "reject", { rejection_reason: reason });
            setRejecting(null);
          }}
        />
      )}
    </div>
  );
}

export default function PedidosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PedidosContent />
    </Suspense>
  );
}

// ============================================================
// Aprovação com seleção de unidade (seção 12) e entrega (seção 14)
// ============================================================

function SelecionarUnidadeDialog({
  request,
  mode,
  onClose,
  onDone,
}: {
  request: ToolRequest;
  mode: "approve" | "deliver";
  onClose: () => void;
  onDone: (extra: Record<string, unknown>) => Promise<void>;
}) {
  const [units, setUnits] = useState<ToolUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitId, setUnitId] = useState(request.unit_id ?? "");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!request.tool_id) {
        setLoadingUnits(false);
        return;
      }
      try {
        // available_for aplica a regra da seção 12: só unidade do tipo pedido,
        // disponível e sem reserva para outro pedido.
        const res = await toolsApi.listUnits({
          tool_id: request.tool_id,
          available_for: request.id,
          limit: 100,
        });
        if (!cancelled) setUnits(res.data ?? []);
      } catch {
        if (!cancelled) setUnits([]);
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request.tool_id, request.id]);

  // Tipo por quantidade não tem unidade para escolher.
  const isQuantityMode = !loadingUnits && units.length === 0 && !request.unit_id;

  const submit = async () => {
    if (mode === "approve" && !isQuantityMode && !unitId) {
      toast.error("Selecione a unidade física que será destinada ao técnico");
      return;
    }
    setSaving(true);
    try {
      await onDone(
        mode === "approve"
          ? { unit_id: unitId || undefined }
          : {
              unit_id: unitId || undefined,
              expected_return_at: expectedReturn || undefined,
              condition_out: condition,
              notes_out: notes || undefined,
              photos_out: photos,
            }
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>
          {mode === "approve" ? "Aprovar pedido" : "Confirmar entrega"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {request.quantity}× {request.tool_name} — {request.requester?.full_name ?? "—"}
        </p>

        {loadingUnits ? (
          <Skeleton className="h-10 w-full" />
        ) : isQuantityMode ? (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Este item é controlado por quantidade — não há unidade física para escolher.
            A entrega abate o saldo do estoque.
          </p>
        ) : (
          <SelectNative
            label={mode === "approve" ? "Unidade destinada *" : "Unidade entregue"}
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Escolha...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
                {u.patrimony_code ? ` · ${u.patrimony_code}` : ""}
                {u.location ? ` — ${u.location}` : ""}
              </option>
            ))}
          </SelectNative>
        )}

        {mode === "deliver" && (
          <>
            <Input
              label="Devolução prevista"
              type="datetime-local"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Sem prazo, a custódia não entra nos alertas de vencimento e atraso.
            </p>
            <SelectNative
              label="Condição na entrega"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="new">Nova</option>
              <option value="good">Boa</option>
              <option value="fair">Regular</option>
            </SelectNative>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none text-foreground/80">
                Observação do almoxarifado
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <ToolPhotosField
              toolId={request.tool_id ?? ""}
              kind="delivery"
              photos={photos}
              onChange={setPhotos}
              label="Fotos da entrega"
              disabled={!request.tool_id}
            />
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} isLoading={saving}>
            {mode === "approve" ? "Aprovar e reservar" : "Confirmar entrega"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RecusarDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Recusar pedido</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        {/* Antes isso era um window.prompt() */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Motivo da recusa
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="O técnico vê esse texto no aplicativo."
            className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            isLoading={saving}
            onClick={async () => {
              if (!reason.trim()) {
                toast.error("Informe o motivo");
                return;
              }
              setSaving(true);
              try {
                await onDone(reason.trim());
              } finally {
                setSaving(false);
              }
            }}
          >
            Recusar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
