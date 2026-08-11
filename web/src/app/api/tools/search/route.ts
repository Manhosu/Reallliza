import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/search?q=
 * Pesquisa global do almoxarifado (spec seções 5-7).
 *
 * "A pesquisa deverá reconhecer automaticamente o tipo de informação digitada."
 * Buscamos em paralelo unidades, tipos, técnicos e OS, e devolvemos tudo
 * classificado — a tela decide se abre a ficha direto (um único resultado
 * forte) ou mostra a lista.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      throw new AuthError(400, "Digite ao menos 2 caracteres");
    }

    const supabase = getAdminClient();
    const like = `%${q}%`;

    const [units, tools, technicians, orders] = await Promise.all([
      supabase
        .from("tool_units")
        .select(
          `id, code, patrimony_code, serial_number, status, location, photos,
           tool:tool_inventory(id, name, category, brand, model)`
        )
        .or(
          `code.ilike.${like},patrimony_code.ilike.${like},serial_number.ilike.${like},location.ilike.${like},notes.ilike.${like}`
        )
        .limit(20),
      supabase
        .from("tool_inventory")
        .select(
          "id, name, category, brand, model, status, tracking_mode, quantity_available, photo_url"
        )
        .or(
          `name.ilike.${like},category.ilike.${like},brand.ilike.${like},model.ilike.${like},description.ilike.${like}`
        )
        .limit(20),
      supabase
        .from("profiles")
        .select("id, full_name, role, phone, status")
        .eq("role", "technician")
        .ilike("full_name", like)
        .limit(20),
      supabase
        .from("service_orders")
        .select("id, order_number, title, client_name, status")
        .or(`order_number.ilike.${like},title.ilike.${like},client_name.ilike.${like}`)
        .limit(20),
    ]);

    // Para cada técnico encontrado, quantas ferramentas ele tem agora —
    // é o que a seção 6 pede como cabeçalho do resultado por técnico.
    const technicianRows = (technicians.data ?? []) as Array<{ id: string }>;
    const custodyCounts = new Map<string, number>();
    if (technicianRows.length > 0) {
      const { data: custodies } = await supabase
        .from("tool_custody")
        .select("user_id")
        .is("checked_in_at", null)
        .in(
          "user_id",
          technicianRows.map((t) => t.id)
        );
      for (const c of (custodies ?? []) as Array<{ user_id: string }>) {
        custodyCounts.set(c.user_id, (custodyCounts.get(c.user_id) ?? 0) + 1);
      }
    }

    const results = {
      units: units.data ?? [],
      tools: tools.data ?? [],
      technicians: ((technicians.data ?? []) as Array<Record<string, unknown>>).map(
        (t) => ({ ...t, custody_count: custodyCounts.get(t.id as string) ?? 0 })
      ),
      service_orders: orders.data ?? [],
    };

    const total =
      results.units.length +
      results.tools.length +
      results.technicians.length +
      results.service_orders.length;

    // Match forte: código/patrimônio/série exatos apontam pra uma unidade só.
    const exactUnit = results.units.find(
      (u) =>
        [u.code, u.patrimony_code, u.serial_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase() === q.toLowerCase())
    );

    return jsonResponse({
      query: q,
      total,
      exact_unit_id: exactUnit?.id ?? null,
      results,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
