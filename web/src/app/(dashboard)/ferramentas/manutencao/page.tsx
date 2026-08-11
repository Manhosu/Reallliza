"use client";

import { useApi } from "@/hooks/use-api";
import { toolsApi } from "@/lib/api";
import type { ToolInventory, PaginatedResponse } from "@/lib/types";
import { ManutencaoPanel } from "@/components/ferramentas/manutencao-panel";

/**
 * Área de Manutenção (spec seção 21).
 * Reaproveita o painel que já existia; a lista de ferramentas agora vem sem o
 * corte de 12 itens que a página monolítica impunha.
 */
export default function ManutencaoPage() {
  const { data, mutate } = useApi<PaginatedResponse<ToolInventory>>(
    () => toolsApi.list({ limit: 200 }),
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Manutenção</h1>
        <p className="text-sm text-muted-foreground">
          Ferramentas indisponíveis por motivo técnico.
        </p>
      </div>
      <ManutencaoPanel tools={data?.data ?? []} onChanged={() => mutate()} />
    </div>
  );
}
