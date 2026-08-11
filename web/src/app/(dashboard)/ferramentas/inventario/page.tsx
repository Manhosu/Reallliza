"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Package, Plus, History, Pencil, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toolsApi } from "@/lib/api";
import type { ToolInventory, PaginatedResponse } from "@/lib/types";
import type { ToolUnit } from "@/lib/tools/types";
import { UNIT_STATUS_LABELS } from "@/lib/tools/types";
import { UnitStatusBadge } from "@/components/ferramentas/almox-badges";
import { KpiTile } from "@/components/ferramentas/kpi-tile";
import { ToolPhotosField, type PhotoRef } from "@/components/ferramentas/tool-photos-field";

const PAGE_SIZE = 20;

/**
 * Inventário (spec seção 9): todas as unidades físicas cadastradas.
 *
 * Tipos no modo quantidade não têm unidade individual — para eles listamos o
 * próprio tipo com o saldo, senão espaçador e lápis simplesmente sumiriam do
 * inventário.
 */
function InventarioContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  const [units, setUnits] = useState<ToolUnit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [types, setTypes] = useState<ToolInventory[]>([]);
  const [showNewUnit, setShowNewUnit] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await toolsApi.listUnits({
        status: status === "all" ? undefined : status,
        search: debounced || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setUnits(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o inventário");
    } finally {
      setLoading(false);
    }
  }, [status, debounced, page]);

  const loadTypes = useCallback(async () => {
    try {
      const res = (await toolsApi.list({ limit: 200 })) as PaginatedResponse<ToolInventory>;
      setTypes(res.data ?? []);
    } catch {
      // O inventário continua utilizável sem a lista de tipos.
    }
  }, []);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);
  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const quantityTypes = types.filter(
    (t) => (t as unknown as { tracking_mode?: string }).tracking_mode !== "controlled"
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts = units.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventário</h1>
          <p className="text-sm text-muted-foreground">
            Todas as unidades físicas cadastradas no almoxarifado.
          </p>
        </div>
        <Button onClick={() => setShowNewUnit(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova unidade
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Total de unidades" value={total} accent="zinc" icon={Package} isLoading={loading} />
        <KpiTile label="Disponíveis" value={counts.available ?? 0} accent="green" isLoading={loading} />
        <KpiTile label="Reservadas" value={counts.reserved ?? 0} accent="amber" isLoading={loading} />
        <KpiTile label="Em custódia" value={counts.in_custody ?? 0} accent="blue" isLoading={loading} />
        <KpiTile label="Em manutenção" value={counts.maintenance ?? 0} accent="purple" isLoading={loading} />
        <KpiTile label="Baixadas" value={counts.retired ?? 0} accent="zinc" isLoading={loading} />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Buscar"
              placeholder="Código, patrimônio, série ou localização"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-52">
            <SelectNative
              label="Situação"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todas</option>
              {Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectNative>
          </div>
          {(status !== "all" || search) && (
            <Button
              variant="outline"
              onClick={() => {
                setStatus("all");
                setSearch("");
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Unidades */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : units.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="Nenhuma unidade encontrada"
              description="Cadastre unidades físicas para os tipos controlados, ou ajuste os filtros."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ferramenta</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Patrimônio</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Localização</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {units.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.tool?.name ?? "—"}</p>
                      {(u.tool?.brand || u.tool?.model) && (
                        <p className="text-xs text-muted-foreground">
                          {[u.tool?.brand, u.tool?.model].filter(Boolean).join(" ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/ferramentas/unidades/${u.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {u.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.patrimony_code ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <UnitStatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.location ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/ferramentas/unidades/${u.id}`}>
                          <Button size="sm" variant="ghost" title="Ver histórico">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link href={`/ferramentas/unidades/${u.id}?edit=1`}>
                          <Button size="sm" variant="ghost" title="Editar cadastro">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Paginação — a tela antiga carregava 12 itens e não tinha controle nenhum */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="flex items-center px-2 text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Itens controlados por quantidade — sem unidade individual */}
      {quantityTypes.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h2 className="mb-1 text-sm font-semibold">Itens controlados por quantidade</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Consumíveis e itens de baixo valor não têm unidade individual — o controle é
              por saldo.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quantityTypes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.category ?? "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs font-medium tabular-nums">
                    {(t as unknown as { quantity_available?: number }).quantity_available ?? 0} un.
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showNewUnit && (
        <NovaUnidadeDialog
          types={types}
          onClose={() => setShowNewUnit(false)}
          onCreated={() => {
            setShowNewUnit(false);
            void loadUnits();
            void loadTypes();
          }}
        />
      )}
    </div>
  );
}

export default function InventarioPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InventarioContent />
    </Suspense>
  );
}

// ============================================================
// Cadastro de unidade (spec seção 10)
// ============================================================

function NovaUnidadeDialog({
  types,
  onClose,
  onCreated,
}: {
  types: ToolInventory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    tool_id: "",
    code: "",
    patrimony_code: "",
    serial_number: "",
    condition: "good",
    location: "",
    supplier: "",
    acquired_at: "",
    acquisition_value: "",
    notes: "",
  });
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.tool_id || !form.code.trim()) {
      toast.error("Escolha o tipo e informe o código da unidade");
      return;
    }
    setSaving(true);
    try {
      await toolsApi.createUnit({
        tool_id: form.tool_id,
        code: form.code.trim(),
        patrimony_code: form.patrimony_code.trim() || null,
        serial_number: form.serial_number.trim() || null,
        condition: form.condition as never,
        location: form.location.trim() || null,
        supplier: form.supplier.trim() || null,
        acquired_at: form.acquired_at || null,
        acquisition_value: form.acquisition_value
          ? parseFloat(form.acquisition_value)
          : null,
        photos,
        notes: form.notes.trim() || null,
      });
      toast.success("Unidade cadastrada");
      onCreated();
    } catch (err) {
      // O 409 do banco vira mensagem legível na rota (código/patrimônio/série duplicados)
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Nova unidade física</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <SelectNative
          label="Tipo de ferramenta *"
          value={form.tool_id}
          onChange={(e) => setForm({ ...form, tool_id: e.target.value })}
        >
          <option value="">Escolha...</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` — ${t.category}` : ""}
            </option>
          ))}
        </SelectNative>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Código da unidade *"
            placeholder="Ex.: FUR-00123"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            label="Patrimônio"
            placeholder="Ex.: PAT-000123"
            value={form.patrimony_code}
            onChange={(e) => setForm({ ...form, patrimony_code: e.target.value })}
          />
          <Input
            label="Número de série"
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
          />
          <SelectNative
            label="Condição inicial"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
          >
            <option value="new">Nova</option>
            <option value="good">Boa</option>
            <option value="fair">Regular</option>
            <option value="poor">Ruim</option>
            <option value="damaged">Danificada</option>
          </SelectNative>
          <Input
            label="Localização"
            placeholder="Ex.: Almoxarifado — Prateleira A-02"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <Input
            label="Fornecedor"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
          <Input
            label="Data de aquisição"
            type="date"
            value={form.acquired_at}
            onChange={(e) => setForm({ ...form, acquired_at: e.target.value })}
          />
          <Input
            label="Valor de aquisição"
            type="number"
            step="0.01"
            placeholder="R$"
            value={form.acquisition_value}
            onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Observações
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <ToolPhotosField
          toolId={form.tool_id}
          kind="unit"
          photos={photos}
          onChange={setPhotos}
          label="Fotos da unidade"
          disabled={!form.tool_id}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} isLoading={saving}>
            Cadastrar unidade
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
