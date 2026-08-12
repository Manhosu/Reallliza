import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Disponibilidade real de um TIPO de ferramenta.
 *
 * Jessica 12/08: "o Iago solicitou 3 parafusadeiras, porém no estoque havia
 * apenas 1 disponível. O sistema não deve permitir."
 *
 * O número que o app mostrava vinha de `tool_inventory.quantity_available`,
 * uma coluna que só o modo quantidade decrementa — para tipos controlados ela
 * fica congelada no valor do cadastro e não tem relação com o estoque real.
 *
 * Aqui a conta é feita na fonte certa:
 *   controlled → unidades com status 'available' e sem reserva para outro pedido
 *   quantity   → o saldo em quantity_available
 */

export interface ToolAvailability {
  tool_id: string;
  tracking_mode: string;
  available_quantity: number;
}

/**
 * Disponibilidade de vários tipos de uma vez. Duas consultas no total,
 * independentemente da quantidade de tipos.
 */
export async function getAvailabilityByTool(
  supabase: SupabaseClient,
  toolIds: string[]
): Promise<Map<string, ToolAvailability>> {
  const result = new Map<string, ToolAvailability>();
  if (toolIds.length === 0) return result;

  const { data: tools, error: toolsErr } = await supabase
    .from("tool_inventory")
    .select("id, tracking_mode, quantity_available, status")
    .in("id", toolIds);

  if (toolsErr) {
    console.error(`getAvailabilityByTool: ${toolsErr.message}`);
    return result;
  }

  const rows = (tools ?? []) as Array<{
    id: string;
    tracking_mode: string | null;
    quantity_available: number | null;
    status: string | null;
  }>;

  const controlledIds = rows
    .filter((t) => t.tracking_mode === "controlled")
    .map((t) => t.id);

  // Só as unidades realmente livres — o conjunto é pequeno por natureza.
  const freeUnitsByTool = new Map<string, number>();
  if (controlledIds.length > 0) {
    const { data: units, error: unitsErr } = await supabase
      .from("tool_units")
      .select("tool_id")
      .in("tool_id", controlledIds)
      .eq("status", "available")
      .is("reserved_for_request_id", null);

    if (unitsErr) {
      console.error(`getAvailabilityByTool (units): ${unitsErr.message}`);
    } else {
      for (const u of (units ?? []) as Array<{ tool_id: string }>) {
        freeUnitsByTool.set(u.tool_id, (freeUnitsByTool.get(u.tool_id) ?? 0) + 1);
      }
    }
  }

  for (const t of rows) {
    const mode = t.tracking_mode === "controlled" ? "controlled" : "quantity";
    let available: number;
    if (mode === "controlled") {
      available = freeUnitsByTool.get(t.id) ?? 0;
    } else {
      // No modo quantidade quem manda é o saldo. O status do tipo só bloqueia
      // quando a ferramenta inteira saiu de operação.
      //
      // `in_custody` NÃO entra nessa lista de propósito: o bug antigo marcava o
      // tipo inteiro como em custódia ao entregar uma unidade, e quatro tipos
      // ficaram presos nesse estado com saldo cheio (Lápis com 100, Trena com
      // 10...). Custódia de item por quantidade é registrada em tool_custody,
      // não no status do tipo.
      const FORA_DE_OPERACAO = ["maintenance", "retired", "damaged", "missing"];
      available = FORA_DE_OPERACAO.includes(String(t.status))
        ? 0
        : Number(t.quantity_available ?? 0);
    }
    result.set(t.id, {
      tool_id: t.id,
      tracking_mode: mode,
      available_quantity: Math.max(0, available),
    });
  }

  return result;
}

/** Atalho para um tipo só. */
export async function getToolAvailability(
  supabase: SupabaseClient,
  toolId: string
): Promise<ToolAvailability | null> {
  const map = await getAvailabilityByTool(supabase, [toolId]);
  return map.get(toolId) ?? null;
}
