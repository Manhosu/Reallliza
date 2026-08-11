"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, History, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { toolsApi } from "@/lib/api";
import { deadlineSituation, daysInCustody, DEADLINE_LABELS } from "@/lib/tools/types";
import { DeadlineBadge } from "@/components/ferramentas/almox-badges";
import { KpiTile } from "@/components/ferramentas/kpi-tile";
import { DevolucaoModal } from "@/components/ferramentas/devolucao-modal";

interface CustodyRow {
  id: string;
  tool_id: string;
  unit_id: string | null;
  user_id: string;
  checked_out_at: string;
  expected_return_at: string | null;
  return_requested_at: string | null;
  damage_reported_at: string | null;
  damage_description: string | null;
  condition_out: string | null;
  has_pending_extension?: boolean;
  tool?: { id: string; name: string; photo_url?: string | null } | null;
  unit?: { id: string; code: string; patrimony_code?: string | null } | null;
  user?: { id: string; full_name: string; phone?: string | null } | null;
  service_order?: { id: string; order_number: string; title?: string } | null;
}

/**
 * Custódias (spec seções 15-17): tudo que está sob responsabilidade dos
 * técnicos agora, com prazo, situação e as ações do operador.
 */
function CustodiasContent() {
  const searchParams = useSearchParams();
  const [situacao, setSituacao] = useState(searchParams.get("situacao") || "all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustodyRow[]>([]);
  const [extensions, setExtensions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<CustodyRow | null>(null);
  const [decidingExt, setDecidingExt] = useState<CustodyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // A rota já devolve has_pending_extension resolvido em uma consulta.
      const data = await apiClient.get<CustodyRow[]>("/tools/custody/active");
      setRows(data ?? []);
      setExtensions(
        Object.fromEntries(
          (data ?? [])
            .filter((c) => c.has_pending_extension)
            .map((c) => [c.id, true])
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar as custódias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withSituation = rows.map((c) => ({
    ...c,
    _situation: deadlineSituation({
      expected_return_at: c.expected_return_at,
      return_requested_at: c.return_requested_at,
      has_pending_extension: extensions[c.id],
    }),
  }));

  const filtered = withSituation.filter((c) => {
    if (situacao === "damage" && !c.damage_reported_at) return false;
    if (situacao === "extension" && !extensions[c.id]) return false;
    if (
      situacao !== "all" &&
      situacao !== "damage" &&
      situacao !== "extension" &&
      c._situation !== situacao
    )
      return false;
    if (search) {
      const hay = [
        c.tool?.name,
        c.unit?.code,
        c.unit?.patrimony_code,
        c.user?.full_name,
        c.service_order?.order_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const countBy = (s: string) => withSituation.filter((c) => c._situation === s).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Custódias</h1>
        <p className="text-sm text-muted-foreground">
          Ferramentas atualmente sob responsabilidade dos técnicos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Total em custódia" value={rows.length} accent="blue" isLoading={loading} />
        <KpiTile label="Dentro do prazo" value={countBy("on_time")} accent="green" isLoading={loading} />
        <KpiTile label="Vencem hoje" value={countBy("due_today")} accent="amber" isLoading={loading} />
        <KpiTile label="Atrasadas" value={countBy("overdue")} accent="red" isLoading={loading} />
        <KpiTile label="Devolução solicitada" value={countBy("return_requested")} accent="blue" isLoading={loading} />
        <KpiTile
          label="Com dano"
          value={rows.filter((c) => c.damage_reported_at).length}
          accent="red"
          isLoading={loading}
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Buscar"
              placeholder="Técnico, ferramenta, código ou OS"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-56">
            <SelectNative
              label="Situação"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
            >
              <option value="all">Todas</option>
              {Object.entries(DEADLINE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="damage">Com dano comunicado</option>
              <option value="extension">Com prorrogação pendente</option>
            </SelectNative>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<Boxes className="h-6 w-6" />}
              title="Nenhuma custódia"
              description="Não há ferramentas em custódia com esse filtro."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40">
                  {c.tool?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.tool.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Boxes className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="min-w-[180px] flex-1">
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
                    <p className="mt-1 text-xs text-red-500">
                      Dano comunicado: {c.damage_description}
                    </p>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>
                    Entrega: {new Date(c.checked_out_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p>
                    Prev. devolução:{" "}
                    {c.expected_return_at
                      ? new Date(c.expected_return_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                  <p>{daysInCustody(c.checked_out_at)} dia(s) em custódia</p>
                </div>

                <DeadlineBadge
                  custody={{
                    expected_return_at: c.expected_return_at,
                    return_requested_at: c.return_requested_at,
                    has_pending_extension: extensions[c.id],
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setReturning(c)}>
                    Registrar devolução
                  </Button>
                  {extensions[c.id] && (
                    <Button size="sm" variant="outline" onClick={() => setDecidingExt(c)}>
                      <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                      Analisar prorrogação
                    </Button>
                  )}
                  {c.unit?.id && (
                    <Link href={`/ferramentas/unidades/${c.unit.id}`}>
                      <Button size="sm" variant="ghost" title="Histórico da ferramenta">
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

      {returning && (
        <DevolucaoModal
          custodyId={returning.id}
          toolId={returning.tool_id}
          onClose={() => setReturning(null)}
          onDone={async () => {
            setReturning(null);
            await load();
          }}
        />
      )}

      {decidingExt && (
        <ProrrogacaoDialog
          custodyId={decidingExt.id}
          onClose={() => setDecidingExt(null)}
          onDone={async () => {
            setDecidingExt(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

export default function CustodiasPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <CustodiasContent />
    </Suspense>
  );
}

/** Decisão de prorrogação (spec seção 17). */
function ProrrogacaoDialog({
  custodyId,
  onClose,
  onDone,
}: {
  custodyId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [newDate, setNewDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const decide = async (action: "approve" | "reject") => {
    setSaving(true);
    try {
      await toolsApi.decideExtension(custodyId, {
        action,
        approved_return_at: action === "approve" && newDate ? newDate : undefined,
        decision_notes: notes || undefined,
      });
      toast.success(action === "approve" ? "Prorrogação aprovada" : "Prorrogação recusada");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao decidir");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Analisar prorrogação</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Input
          label="Nova data (opcional)"
          type="datetime-local"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Em branco, vale a data que o técnico pediu. Preenchida, você concede outra.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Observação
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => decide("reject")} isLoading={saving}>
            Recusar
          </Button>
          <Button onClick={() => decide("approve")} isLoading={saving}>
            Aprovar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
