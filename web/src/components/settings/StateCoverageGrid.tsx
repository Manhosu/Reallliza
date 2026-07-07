"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Grid pra editar cobertura por UF (26 estados + DF).
 * Reutilizado em duas abas:
 *   - Cobertura Plataforma (onde plataforma opera)
 *   - Cobertura Reallliza (onde a Reallliza atende diretamente)
 */

type RowFromApi = {
  state: string;
  is_active: boolean;
  notes?: string | null;
  /** So vem no endpoint reallliza_service_states */
  platform_active?: boolean;
};

export interface StateCoverageGridProps {
  endpoint: string;
  helperText: string;
  emptyPill?: string;
  /**
   * Se true, exibe indicador visual de que a UF nao esta habilitada na
   * plataforma — pra tela de Cobertura Reallliza.
   */
  showPlatformFlag?: boolean;
}

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas",
  BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const ALL_UFS = Object.keys(UF_NAMES).sort();

export function StateCoverageGrid({
  endpoint,
  helperText,
  emptyPill,
  showPlatformFlag,
}: StateCoverageGridProps) {
  const [rows, setRows] = useState<Map<string, RowFromApi>>(new Map());
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<RowFromApi[]>(endpoint);
      const map = new Map<string, RowFromApi>();
      for (const r of data ?? []) map.set(r.state, r);
      setRows(map);
      setEdits({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(uf: string) {
    const current = getCurrent(uf);
    setEdits((prev) => ({ ...prev, [uf]: !current }));
  }

  function getCurrent(uf: string): boolean {
    if (uf in edits) return edits[uf];
    return rows.get(uf)?.is_active ?? false;
  }

  async function handleSave() {
    const changed = Object.entries(edits)
      .filter(([uf, v]) => (rows.get(uf)?.is_active ?? false) !== v)
      .map(([state, is_active]) => ({ state, is_active }));
    if (changed.length === 0) {
      toast.info("Nada para salvar");
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(endpoint, { states: changed });
      toast.success(`${changed.length} UF(s) atualizada(s)`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = ALL_UFS.filter((uf) => getCurrent(uf)).length;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{helperText}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <strong>{activeCount}</strong> de 27 UFs ativas
              {emptyPill && activeCount === 0 && (
                <span className="ml-2 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {emptyPill}
                </span>
              )}
            </p>
          </div>
          <Button onClick={handleSave} isLoading={saving} size="sm">
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ALL_UFS.map((uf) => {
              const active = getCurrent(uf);
              const platformDisabled =
                showPlatformFlag && rows.get(uf)?.platform_active === false;
              const changed = uf in edits && (rows.get(uf)?.is_active ?? false) !== active;
              return (
                <button
                  key={uf}
                  type="button"
                  onClick={() => toggle(uf)}
                  disabled={platformDisabled}
                  title={
                    platformDisabled
                      ? "Ative na Cobertura Plataforma primeiro"
                      : UF_NAMES[uf]
                  }
                  className={cn(
                    "group relative flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition",
                    active
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-border bg-background hover:border-primary/40",
                    platformDisabled && "cursor-not-allowed opacity-50",
                    changed && "ring-2 ring-primary/40"
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-bold">{uf}</span>
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                        active
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {active ? "on" : "off"}
                    </span>
                  </div>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {UF_NAMES[uf]}
                  </span>
                  {platformDisabled && (
                    <span className="mt-1 text-[10px] font-medium text-red-500">
                      plataforma inativa
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
