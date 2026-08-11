"use client";

import { useApi } from "@/hooks/use-api";
import { toolsApi } from "@/lib/api";
import type { ToolInventory, PaginatedResponse } from "@/lib/types";
import { BaixaPanel } from "@/components/ferramentas/baixa-panel";

/**
 * Área de Baixas (spec seção 22).
 * "Após a baixa, a unidade não poderá voltar a ficar disponível, não poderá ser
 * utilizada em pedidos, permanecerá disponível para consulta e todo o histórico
 * será preservado."
 */
export default function BaixasPage() {
  const { data, mutate } = useApi<PaginatedResponse<ToolInventory>>(
    () => toolsApi.list({ limit: 200 }),
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Baixas</h1>
        <p className="text-sm text-muted-foreground">
          Ferramentas retiradas definitivamente da operação. O histórico é preservado.
        </p>
      </div>
      <BaixaPanel tools={data?.data ?? []} onChanged={() => mutate()} />
    </div>
  );
}
