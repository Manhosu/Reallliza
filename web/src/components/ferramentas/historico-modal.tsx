"use client";

import { useState, useEffect, useCallback } from "react";
import { History, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";

type PhotoRef = { url: string; name: string; storage_path?: string };

interface CustodyRow {
  id: string;
  checked_out_at: string | null;
  checked_in_at: string | null;
  expected_return_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  notes_out: string | null;
  notes_in: string | null;
  photos_out: PhotoRef[] | null;
  photos_in: PhotoRef[] | null;
  user?: { id: string; full_name: string } | null;
  service_order?: { id: string; order_number: string; title: string } | null;
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Nova",
  good: "Boa",
  fair: "Regular",
  poor: "Ruim",
  damaged: "Danificada",
};

function condition(value: string | null): string {
  if (!value) return "—";
  return CONDITION_LABEL[value] ?? value;
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function PhotoStrip({ photos }: { photos: PhotoRef[] | null }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {photos.map((p) => (
        <a
          key={p.storage_path ?? p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="block h-12 w-12 overflow-hidden rounded border border-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

/**
 * Histórico completo de uma ferramenta (Jessica 22/06, item 6).
 *
 * O endpoint /tools/[id]/history e o cliente `getCustodyHistory` já existiam
 * desde a expansão do almoxarifado, mas nenhuma tela os consumia — o
 * histórico era inalcançável pela interface.
 */
export function HistoricoModal({
  toolId,
  toolName,
  onClose,
}: {
  toolId: string;
  toolName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CustodyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await toolsApi.getCustodyHistory(toolId);
      setRows(data as unknown as CustodyRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }, [toolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Histórico da ferramenta</h2>
            <p className="text-sm text-muted-foreground">{toolName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="Sem movimentações"
            description="Esta ferramenta ainda não foi entregue a nenhum técnico"
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-sm">
                    {r.user?.full_name ?? "Técnico removido"}
                  </div>
                  <span
                    className={
                      r.checked_in_at
                        ? "rounded-lg bg-green-500/10 px-2 py-0.5 text-xs text-green-500"
                        : "rounded-lg bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500"
                    }
                  >
                    {r.checked_in_at ? "Devolvida" : "Em custódia"}
                  </span>
                </div>

                {r.service_order && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    OS #{r.service_order.order_number} · {r.service_order.title}
                  </p>
                )}

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-foreground/70">Retirada</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(r.checked_out_at)} · {condition(r.condition_out)}
                    </p>
                    {r.notes_out && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        {r.notes_out}
                      </p>
                    )}
                    <PhotoStrip photos={r.photos_out} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">Devolução</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(r.checked_in_at)} · {condition(r.condition_in)}
                    </p>
                    {r.notes_in && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        {r.notes_in}
                      </p>
                    )}
                    <PhotoStrip photos={r.photos_in} />
                  </div>
                </div>

                {!r.checked_in_at && r.expected_return_at && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Devolução prevista: {dateTime(r.expected_return_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
