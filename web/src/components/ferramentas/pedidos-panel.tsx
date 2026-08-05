"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Check, X, ChevronRight, User, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
import { uploadToolPhoto } from "@/lib/tools/upload-photo";
import type { ToolInventory } from "@/lib/types";

interface ToolRequest {
  id: string;
  requester_id: string;
  requester_name?: string;
  tool_id: string | null;
  tool_name: string;
  quantity: number;
  justification: string | null;
  status: string;
  priority: string | null;
  created_at: string;
}

const STATUS_MAP: Record<
  string,
  { label: string; color: string; nextActions: string[] }
> = {
  pending: {
    label: "Pendente",
    color: "bg-amber-500/15 text-amber-600",
    nextActions: ["separate", "reject"],
  },
  approved: {
    label: "Aprovado",
    color: "bg-blue-500/15 text-blue-600",
    nextActions: ["separate", "reject"],
  },
  separating: {
    label: "Em separação",
    color: "bg-purple-500/15 text-purple-600",
    nextActions: ["ready", "cancel"],
  },
  awaiting_pickup: {
    label: "Aguardando retirada",
    color: "bg-yellow-500/20 text-yellow-700",
    nextActions: ["deliver", "cancel"],
  },
  delivered: {
    label: "Entregue",
    color: "bg-emerald-500/15 text-emerald-600",
    nextActions: [],
  },
  released: {
    label: "Liberado (legado)",
    color: "bg-emerald-500/15 text-emerald-600",
    nextActions: [],
  },
  rejected: {
    label: "Recusada",
    color: "bg-red-500/15 text-red-600",
    nextActions: [],
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-muted text-muted-foreground",
    nextActions: [],
  },
};

const ACTION_LABEL: Record<string, string> = {
  separate: "Separar",
  ready: "Marcar como pronto",
  deliver: "Entregar",
  reject: "Recusar",
  cancel: "Cancelar",
};

export function PedidosPanel({
  tools,
  onChanged,
}: {
  tools: ToolInventory[];
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deliveringReq, setDeliveringReq] = useState<ToolRequest | null>(null);
  const [filter, setFilter] = useState<"active" | "all" | "finished">("active");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Jessica 04/08: mostra TODOS os status (padrao antes era so pending,
      // fazendo o pedido sumir apos o operador clicar Separar)
      const res = await apiClient.get<{
        data?: ToolRequest[];
        requests?: ToolRequest[];
      }>("/tools/requests?status=all");
      const list = res.data || res.requests || (res as unknown as ToolRequest[]);
      setRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (
    req: ToolRequest,
    action: "separate" | "ready" | "deliver" | "reject" | "cancel"
  ) => {
    if (action === "deliver") {
      // Abre modal de entrega (foto + condicao + escolha da unidade)
      setDeliveringReq(req);
      return;
    }
    if (action === "reject") {
      const reason = window.prompt("Motivo da recusa:");
      if (!reason) return;
      setProcessingId(req.id);
      try {
        await toolsApi.patchRequest(req.id, {
          action,
          rejection_reason: reason,
        });
        toast.success("Recusada");
        await load();
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha");
      } finally {
        setProcessingId(null);
      }
      return;
    }
    setProcessingId(req.id);
    try {
      await toolsApi.patchRequest(req.id, { action });
      toast.success("Status atualizado");
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const ACTIVE_SET = new Set([
    "pending",
    "approved",
    "separating",
    "awaiting_pickup",
  ]);
  const FINISHED_SET = new Set([
    "delivered",
    "released",
    "rejected",
    "cancelled",
  ]);
  const visibleRequests = requests.filter((r) => {
    if (filter === "all") return true;
    if (filter === "active") return ACTIVE_SET.has(r.status);
    return FINISHED_SET.has(r.status);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">
            Pedidos ({visibleRequests.length})
          </CardTitle>
          <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-0.5">
            {(["active", "finished", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-md transition ${
                  filter === f
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "active"
                  ? "Em andamento"
                  : f === "finished"
                    ? "Finalizados"
                    : "Todos"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleRequests.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title={
              filter === "active"
                ? "Nenhum pedido em andamento"
                : filter === "finished"
                  ? "Nenhum pedido finalizado"
                  : "Nenhum pedido"
            }
            description="Pedidos dos técnicos via app aparecem aqui"
          />
        ) : (
          <div className="space-y-3">
            {visibleRequests.map((req) => {
              const info = STATUS_MAP[req.status] ?? {
                label: req.status,
                color: "bg-muted text-muted-foreground",
                nextActions: [],
              };
              return (
                <div
                  key={req.id}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {req.quantity}x {req.tool_name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <User className="h-3 w-3" />
                        {req.requester_name ?? req.requester_id.slice(0, 8)}
                        <span>·</span>
                        {new Date(req.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <Badge className={info.color}>{info.label}</Badge>
                  </div>
                  {req.justification && (
                    <p className="text-sm text-muted-foreground">
                      &ldquo;{req.justification}&rdquo;
                    </p>
                  )}
                  {info.nextActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {info.nextActions.map((a) => (
                        <Button
                          key={a}
                          size="sm"
                          variant={
                            a === "reject" || a === "cancel"
                              ? "outline"
                              : "default"
                          }
                          disabled={processingId === req.id}
                          onClick={() =>
                            handleAction(
                              req,
                              a as
                                | "separate"
                                | "ready"
                                | "deliver"
                                | "reject"
                                | "cancel"
                            )
                          }
                        >
                          {a === "deliver" && <Check className="h-3 w-3 mr-1" />}
                          {a === "reject" && <X className="h-3 w-3 mr-1" />}
                          {a === "separate" && <ChevronRight className="h-3 w-3 mr-1" />}
                          {ACTION_LABEL[a]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {deliveringReq && (
        <EntregaModal
          request={deliveringReq}
          tools={tools}
          onClose={() => setDeliveringReq(null)}
          onDone={async () => {
            setDeliveringReq(null);
            await load();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function EntregaModal({
  request,
  tools,
  onClose,
  onDone,
}: {
  request: ToolRequest;
  tools: ToolInventory[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const firstWord = request.tool_name.toLowerCase().split(" ")[0] ?? "";
  const available = tools.filter(
    (t) => t.status === "available" && t.name.toLowerCase().includes(firstWord)
  );
  const fallback = tools.filter((t) => t.status === "available");
  const options = available.length > 0 ? available : fallback;

  const [toolId, setToolId] = useState(request.tool_id ?? options[0]?.id ?? "");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<
    Array<{ url: string; name: string; storage_path?: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (f: File) => {
    if (!toolId) {
      toast.error("Escolha a ferramenta primeiro");
      return;
    }
    setUploading(true);
    try {
      const p = await uploadToolPhoto(f, "delivery", toolId);
      setPhotos((prev) => [...prev, p]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha upload");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!toolId) {
      toast.error("Escolha a ferramenta");
      return;
    }
    setSaving(true);
    try {
      await toolsApi.patchRequest(request.id, {
        action: "deliver",
        tool_id: toolId,
        condition_out: condition,
        notes_out: notes || undefined,
        photos_out: photos,
      });
      toast.success("Entregue");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-card border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Entregar ferramenta</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Pedido de {request.requester_name ?? "técnico"}:{" "}
          <strong>{request.quantity}x {request.tool_name}</strong>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Ferramenta física</label>
            <SelectNative
              value={toolId}
              onChange={(e) => setToolId(e.target.value)}
              className="mt-1"
            >
              <option value="">Escolha...</option>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.serial_number && ` — ${t.serial_number}`}
                </option>
              ))}
            </SelectNative>
          </div>
          <div>
            <label className="text-sm font-medium">Condição na entrega</label>
            <SelectNative
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1"
            >
              <option value="good">Boa</option>
              <option value="fair">Desgaste normal</option>
              <option value="new">Nova</option>
            </SelectNative>
          </div>
          <div>
            <label className="text-sm font-medium">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              Fotos ({photos.length})
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name}
                    className="h-16 w-16 rounded-md object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed hover:bg-secondary/50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                  disabled={uploading || !toolId}
                />
                <Upload className="h-4 w-4 text-muted-foreground" />
              </label>
            </div>
            {uploading && (
              <p className="text-xs text-muted-foreground mt-1">Enviando...</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} isLoading={saving} disabled={uploading || !toolId}>
              Confirmar entrega
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
