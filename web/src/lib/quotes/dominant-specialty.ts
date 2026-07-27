import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deriva a especialidade DOMINANTE dos itens de uma quote — a que tem
 * maior peso (soma de estimated_time_hours * quantity das categorias
 * dos serviços).
 *
 * Usado no auto-assign da conversão quote → OS (Jessica 27/07 D2):
 * a OS é atribuída a uma equipe qualificada nessa especialidade.
 */
export async function pickDominantSpecialty(
  supabase: SupabaseClient,
  items: Array<{ service_id: string | null; quantity: number }>
): Promise<{ specialty_id: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const serviceIds = items
    .map((it) => it.service_id)
    .filter((id): id is string => !!id);
  if (serviceIds.length === 0) {
    return { specialty_id: null, warnings: ["Nenhum service_id nos itens"] };
  }

  const { data: services, error } = await supabase
    .from("services")
    .select(
      `id, estimated_time_hours, category_id,
       category:service_categories(id, name, specialty_id)`
    )
    .in("id", serviceIds);

  if (error) {
    warnings.push(`Falha carregar servicos: ${error.message}`);
    return { specialty_id: null, warnings };
  }

  type SvcRow = {
    id: string;
    estimated_time_hours: number | null;
    category_id: string | null;
    category:
      | { id: string; name: string; specialty_id: string | null }
      | { id: string; name: string; specialty_id: string | null }[]
      | null;
  };

  const specWeights = new Map<string, number>();
  for (const it of items) {
    if (!it.service_id) continue;
    const svc = (services as SvcRow[])?.find((s) => s.id === it.service_id);
    if (!svc) continue;
    const category = Array.isArray(svc.category)
      ? svc.category[0]
      : svc.category;
    const specId = category?.specialty_id ?? null;
    if (!specId) {
      warnings.push(
        `Categoria "${category?.name ?? "?"}" (svc ${svc.id.slice(0, 8)}) sem specialty_id vinculada`
      );
      continue;
    }
    const hours = Number(svc.estimated_time_hours ?? 0.1);
    const weight = hours * Number(it.quantity);
    specWeights.set(specId, (specWeights.get(specId) ?? 0) + weight);
  }

  if (specWeights.size === 0) {
    return { specialty_id: null, warnings };
  }

  let dominantId: string | null = null;
  let maxWeight = 0;
  for (const [id, w] of specWeights) {
    if (w > maxWeight) {
      maxWeight = w;
      dominantId = id;
    }
  }

  return { specialty_id: dominantId, warnings };
}
