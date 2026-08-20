import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Preços do Feed — o que o admin configura para cobrar de campanha.
 *
 * A tabela nasce vazia: sem uma regra "nacional" e uma "regional" ativas,
 * nenhuma campanha paga consegue ser criada (ver `feed/lib/pricing.ts`).
 *
 * GET   lista todas as regras (mesmo padrão de leitura de `state-stay-rates`
 *       — qualquer usuário autenticado, não só admin).
 * PATCH faz upsert em lote por escopo (`scope_type` + `scope_kind` +
 *       `scope_value`), só o que veio no body — admin only.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("feed_pricing_rules")
      .select("*")
      .order("scope_type")
      .order("scope_kind", { nullsFirst: true });
    if (error) throw new Error(error.message);
    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

interface RegraNoBody {
  scope_type?: string;
  scope_kind?: string | null;
  scope_value?: string | null;
  price_per_day_cents?: number;
  min_days?: number;
  is_active?: boolean;
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const regras: RegraNoBody[] = Array.isArray(body.rules) ? body.rules : [];
    if (regras.length === 0) throw new AuthError(400, "rules obrigatório");

    const supabase = getAdminClient();
    let salvas = 0;

    for (const r of regras) {
      if (r.scope_type !== "nacional" && r.scope_type !== "regional") continue;

      const scopeKind = r.scope_type === "nacional" ? null : r.scope_kind ?? null;
      const scopeValue = r.scope_type === "nacional" ? null : r.scope_value ?? null;
      if (r.scope_type === "regional" && scopeKind && !scopeValue) continue;
      if (scopeKind !== null && scopeKind !== "uf" && scopeKind !== "regiao") continue;

      const campos: Record<string, unknown> = {
        scope_type: r.scope_type,
        scope_kind: scopeKind,
        scope_value: scopeValue,
        updated_by: user.id,
      };
      if (typeof r.price_per_day_cents === "number" && r.price_per_day_cents >= 0) {
        campos.price_per_day_cents = Math.round(r.price_per_day_cents);
      }
      if (typeof r.min_days === "number" && r.min_days >= 1) {
        campos.min_days = Math.round(r.min_days);
      }
      if (typeof r.is_active === "boolean") campos.is_active = r.is_active;

      // A chave de escopo usa COALESCE no índice único, então a busca aqui
      // trata NULL com `.is()` — `.eq('col', null)` não bate com IS NULL.
      let busca = supabase.from("feed_pricing_rules").select("id").eq("scope_type", r.scope_type);
      busca = scopeKind === null ? busca.is("scope_kind", null) : busca.eq("scope_kind", scopeKind);
      busca = scopeValue === null ? busca.is("scope_value", null) : busca.eq("scope_value", scopeValue);
      const { data: existente } = await busca.maybeSingle();

      if (existente) {
        await supabase.from("feed_pricing_rules").update(campos).eq("id", existente.id);
      } else {
        if (typeof campos.price_per_day_cents !== "number") continue; // preço é obrigatório pra criar
        await supabase.from("feed_pricing_rules").insert(campos);
      }
      salvas++;
    }

    logAudit({
      userId: user.id,
      action: "feed_pricing_rules.updated",
      entityType: "feed_pricing_rules",
      entityId: "bulk",
      newData: { count: salvas },
    });

    return jsonResponse({ success: true, updated: salvas });
  } catch (error) {
    return errorResponse(error);
  }
}
