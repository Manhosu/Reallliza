"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Check, X, ChevronRight, User } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        data?: ToolRequest[];
        requests?: ToolRequest[];
      }>("/tools/requests");
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
    if (action === "deliver" && !req.tool_id) {
      // Precisa escolher ferramenta antes de entregar
      const availableTools = tools.filter(
        (t) => t.status === "available" && t.name.toLowerCase().includes(req.tool_name.toLowerCase().split(" ")[0] ?? "")
      );
      if (availableTools.length === 0) {
        toast.error("Nenhuma ferramenta disponível compatível");
        return;
      }
      const toolId = window.prompt(
        `Ferramentas disponíveis:\n${availableTools
          .map((t) => `${t.id.slice(0, 8)} — ${t.name} (${t.serial_number ?? "sem serial"})`)
          .join("\n")}\n\nCole o ID (8 chars):`
      );
      if (!toolId) return;
      const matched = availableTools.find((t) => t.id.startsWith(toolId));
      if (!matched) {
        toast.error("Ferramenta não encontrada");
        return;
      }
      setProcessingId(req.id);
      try {
        await toolsApi.patchRequest(req.id, { action, tool_id: matched.id });
        toast.success("Entregue");
        await load();
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha");
      } finally {
        setProcessingId(null);
      }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Pedidos ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="Nenhum pedido"
            description="Pedidos dos técnicos via app aparecem aqui"
          />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
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
    </Card>
  );
}
