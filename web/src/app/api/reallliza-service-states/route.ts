import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { invalidateUfScopeCache } from "@/lib/quotes/uf-scope";

/**
 * GET /api/reallliza-service-states — UFs onde a Reallliza atende diretamente.
 * PATCH — admin ativa/desativa em lote.
 *
 * Deve ser subconjunto de platform_states (FK). Se a UF nao existe em
 * platform_states, o upsert falha via FK — sinal claro pro admin ativar
 * primeiro na Cobertura Plataforma.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    // LEFT JOIN pra sempre retornar as 27 UFs (mesmo as nao cadastradas ainda)
    // Retornamos a "view" completa: state + is_active_reallliza + is_active_platform
    const { data: platform, error: pErr } = await supabase
      .from("platform_states")
      .select("state, is_active");
    if (pErr) throw new Error("Falha ao carregar platform_states");

    const { data: reallliza, error: rErr } = await supabase
      .from("reallliza_service_states")
      .select("state, is_active, notes");
    if (rErr) throw new Error("Falha ao carregar reallliza_service_states");

    const rMap = new Map(
      (reallliza ?? []).map((r) => [r.state, r as { state: string; is_active: boolean; notes: string | null }])
    );

    const merged = (platform ?? [])
      .map((p) => ({
        state: p.state,
        platform_active: p.is_active,
        is_active: rMap.get(p.state)?.is_active ?? false,
        notes: rMap.get(p.state)?.notes ?? null,
      }))
      .sort((a, b) => a.state.localeCompare(b.state));

    return jsonResponse(merged);
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

    // Validar que todos os states existem em platform_states — pega inconsistencia
    // antes do upsert (que falharia via FK).
    const { data: existing, error: exErr } = await supabase
      .from("platform_states")
      .select("state")
      .in("state", updates.map((u) => u.state));
    if (exErr) throw new Error("Falha ao validar platform_states");

    const knownStates = new Set((existing ?? []).map((e) => e.state));
    const missing = updates.filter((u) => !knownStates.has(u.state)).map((u) => u.state);
    if (missing.length > 0) {
      throw new AuthError(
        400,
        `UFs ${missing.join(", ")} nao existem em platform_states — ative primeiro em Cobertura Plataforma.`
      );
    }

    const { error } = await supabase
      .from("reallliza_service_states")
      .upsert(updates, { onConflict: "state" });
    if (error) throw new Error(`Falha upsert reallliza_service_states: ${error.message}`);

    invalidateUfScopeCache();

    logAudit({
      userId: user.id,
      action: "reallliza_service_states.batch_update",
      entityType: "reallliza_service_states",
      entityId: "batch",
      newData: { count: updates.length, states: updates.map((u) => u.state) },
    });

    return jsonResponse({ updated: updates.length });
  } catch (error) {
    return errorResponse(error);
  }
}
