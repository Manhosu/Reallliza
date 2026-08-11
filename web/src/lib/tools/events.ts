import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoRef } from "./types";

/**
 * Registro no histórico permanente da ferramenta.
 *
 * Spec seções 23-25: cada movimentação vira um evento imutável, e nenhum
 * evento pode ser apagado ou sobrescrito. Correção de informação também é
 * evento novo (`correcao`), com o valor anterior no metadata.
 *
 * Nunca lança: falhar ao escrever o histórico não pode derrubar a operação
 * que o gerou. Erros vão para o log.
 */
export interface RecordEventInput {
  tool_id: string;
  unit_id?: string | null;
  event_type: string;
  description?: string | null;
  status_from?: string | null;
  status_to?: string | null;
  technician_id?: string | null;
  almoxarife_id?: string | null;
  actor_id?: string | null;
  service_order_id?: string | null;
  custody_id?: string | null;
  request_id?: string | null;
  condition?: string | null;
  notes?: string | null;
  photos?: PhotoRef[] | null;
  metadata?: Record<string, unknown>;
}

export async function recordToolEvent(
  supabase: SupabaseClient,
  input: RecordEventInput
): Promise<void> {
  try {
    const { error } = await supabase.from("tool_events").insert({
      tool_id: input.tool_id,
      unit_id: input.unit_id ?? null,
      event_type: input.event_type,
      description: input.description ?? null,
      status_from: input.status_from ?? null,
      status_to: input.status_to ?? null,
      technician_id: input.technician_id ?? null,
      almoxarife_id: input.almoxarife_id ?? null,
      actor_id: input.actor_id ?? null,
      service_order_id: input.service_order_id ?? null,
      custody_id: input.custody_id ?? null,
      request_id: input.request_id ?? null,
      condition: input.condition ?? null,
      notes: input.notes ?? null,
      photos: input.photos ?? [],
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error(
        `recordToolEvent(${input.event_type}) falhou: ${error.message}`
      );
    }
  } catch (err) {
    console.error(
      `recordToolEvent(${input.event_type}) exceção: ${err instanceof Error ? err.message : err}`
    );
  }
}

/**
 * Evento de correção — seção 25: "Se uma informação for corrigida, o sistema
 * deverá criar um novo evento, registrando informação anterior, nova
 * informação, motivo, usuário, data e hora."
 */
export async function recordToolCorrection(
  supabase: SupabaseClient,
  params: {
    tool_id: string;
    unit_id?: string | null;
    actor_id: string;
    field: string;
    old_value: unknown;
    new_value: unknown;
    reason?: string;
  }
): Promise<void> {
  await recordToolEvent(supabase, {
    tool_id: params.tool_id,
    unit_id: params.unit_id,
    event_type: "correcao",
    description: `Campo "${params.field}" alterado`,
    actor_id: params.actor_id,
    notes: params.reason ?? null,
    metadata: {
      field: params.field,
      old_value: params.old_value ?? null,
      new_value: params.new_value ?? null,
    },
  });
}

/**
 * Marca uma unidade com novo status e registra o evento correspondente.
 * Devolve o status anterior para quem precisar auditar.
 */
export async function setUnitStatus(
  supabase: SupabaseClient,
  unitId: string,
  newStatus: string,
  event: Omit<RecordEventInput, "tool_id" | "unit_id" | "status_from" | "status_to"> & {
    tool_id?: string;
  }
): Promise<string | null> {
  const { data: unit } = await supabase
    .from("tool_units")
    .select("id, tool_id, status")
    .eq("id", unitId)
    .maybeSingle();

  if (!unit) return null;
  const previous = (unit as { status: string }).status;

  const { error } = await supabase
    .from("tool_units")
    .update({ status: newStatus })
    .eq("id", unitId);

  if (error) {
    console.error(`setUnitStatus(${unitId} -> ${newStatus}): ${error.message}`);
    return previous;
  }

  await recordToolEvent(supabase, {
    ...event,
    tool_id: event.tool_id ?? (unit as { tool_id: string }).tool_id,
    unit_id: unitId,
    status_from: previous,
    status_to: newStatus,
  });

  return previous;
}
