"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Undo2, ShieldAlert, History } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";
import { daysInCustody } from "@/lib/tools/types";
import { DeadlineBadge } from "@/components/ferramentas/almox-badges";
import { KpiTile } from "@/components/ferramentas/kpi-tile";
import { DevolucaoModal } from "@/components/ferramentas/devolucao-modal";

interface CustodyRow {
  id: string;
  tool_id: string;
  unit_id: string | null;
  checked_out_at: string;
  expected_return_at: string | null;
  return_requested_at: string | null;
  damage_reported_at: string | null;
  damage_description: string | null;
  has_pending_extension?: boolean;
  tool?: { id: string; name: string; photo_url?: string | null } | null;
  unit?: { id: string; code: string; patrimony_code?: string | null } | null;
  user?: { id: string; full_name: string } | null;
  service_order?: { id: string; order_number: string } | null;
}

/**
 * Devoluções (spec seções 18-20).
 *
 * "A ferramenta não deverá sair da Custódia apenas porque o técnico solicitou
 * a devolução. A custódia só termina quando o almoxarifado confirmar o
 * recebimento físico." Esta tela é a fila desse aceite.
 */
export default function DevolucoesPage() {
  const [rows, setRows] = useState<CustodyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [conferindo, setConferindo] = useState<CustodyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<CustodyRow[]>("/tools/custody/active");
      // Só o que exige ação: devolução pedida pelo técnico ou dano comunicado.
      setRows(
        (data ?? []).filter((c) => c.return_requested_at || c.damage_reported_at)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar as devoluções");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const solicitadas = rows.filter((c) => c.return_requested_at).length;
  const comDano = rows.filter((c) => c.damage_reported_at).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Devoluções</h1>
        <p className="text-sm text-muted-foreground">
          Aguardando conferência e recebimento físico. A custódia só encerra aqui.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Aguardando conferência" value={rows.length} accent="blue" isLoading={loading} />
        <KpiTile label="Devolução solicitada" value={solicitadas} accent="cyan" isLoading={loading} />
        <KpiTile label="Com dano comunicado" value={comDano} accent="red" isLoading={loading} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<Undo2 className="h-6 w-6" />}
              title="Nenhuma devolução pendente"
              description="Quando um técnico solicitar devolução ou comunicar dano, aparece aqui."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">
                    {c.tool?.name ?? "Ferramenta"}
                    {c.unit?.code && (
                      <Link
                        href={`/ferramentas/unidades/${c.unit.id}`}
                        className="ml-2 text-sm text-primary hover:underline"
                      >
                        {c.unit.code}
                      </Link>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.user?.full_name ?? "—"}
                    {c.service_order?.order_number && ` · OS #${c.service_order.order_number}`}
                  </p>
                  {c.damage_reported_at && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-red-500">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {c.damage_description || "Dano comunicado"}
                    </p>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>Entrega: {new Date(c.checked_out_at).toLocaleDateString("pt-BR")}</p>
                  <p>
                    Prev.:{" "}
                    {c.expected_return_at
                      ? new Date(c.expected_return_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                  {c.return_requested_at && (
                    <p>
                      Solicitada em{" "}
                      {new Date(c.return_requested_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  <p>{daysInCustody(c.checked_out_at)} dia(s) em custódia</p>
                </div>

                <DeadlineBadge custody={c} />

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setConferindo(c)}>
                    Conferir e receber
                  </Button>
                  {c.unit?.id && (
                    <Link href={`/ferramentas/unidades/${c.unit.id}`}>
                      <Button size="sm" variant="ghost" title="Histórico">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {conferindo && (
        <DevolucaoModal
          custodyId={conferindo.id}
          toolId={conferindo.tool_id}
          onClose={() => setConferindo(null)}
          onDone={async () => {
            setConferindo(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
