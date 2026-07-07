import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { invalidateUfScopeCache } from "@/lib/quotes/uf-scope";

/**
 * GET /api/platform-states — lista as 27 UFs com is_active.
 * PATCH — admin ativa/desativa uma ou mais UFs em lote.
 *
 * Body PATCH: { states: Array<{ state: 'PB', is_active: true, notes?: string }> }
 *
 * "Onde a plataforma opera" — se is_active=false, lojas nao podem criar
 * quotes com endereco nessa UF (nenhuma modalidade).
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("platform_states")
      .select("*")
      .order("state", { ascending: true });
    if (error) throw new Error("Falha ao carregar platform_states");
    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const states = Array.isArray(body?.states) ? body.states : [];
    if (states.length === 0) throw new AuthError(400, "states vazio");

    const supabase = getAdminClient();
    const updates: Array<{ state: string; is_active: boolean; notes: string | null }> = [];

    for (const raw of states) {
      const state = String(raw.state ?? "").toUpperCase().slice(0, 2);
      if (state.length !== 2) continue;
      updates.push({
        state,
        is_active: Boolean(raw.is_active),
        notes: raw.notes ? String(raw.notes).slice(0, 500) : null,
      });
    }
    if (updates.length === 0) throw new AuthError(400, "Nenhum estado valido");

    // Upsert em lote — INSERT ... ON CONFLICT via .upsert()
    const { error } = await supabase
      .from("platform_states")
      .upsert(updates, { onConflict: "state" });
    if (error) throw new Error(`Falha upsert platform_states: ${error.message}`);

    invalidateUfScopeCache();

    logAudit({
      userId: user.id,
      action: "platform_states.batch_update",
      entityType: "platform_states",
      entityId: "batch",
      newData: { count: updates.length, states: updates.map((u) => u.state) },
    });

    return jsonResponse({ updated: updates.length });
  } catch (error) {
    return errorResponse(error);
  }
}
