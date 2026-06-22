import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/dashboard/partner-extras
 * KPIs adicionais do dashboard da loja parceira (Fase 3 spec):
 *   - scheduled_count: solicitacoes agendadas (quotes paid/converted com OS pending/assigned)
 *   - warranties_open_count: garantias abertas
 *   - contracted_this_month: somatorio do valor das quotes pagas no mes
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();
    let partnerId: string | null = null;
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      partnerId = (p as { id?: string } | null)?.id ?? null;
      if (!partnerId) throw new AuthError(404, "Parceiro nao encontrado");
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();

    // Quotes agendadas (paid/converted, OS ainda pendente/atribuida)
    let scheduledQ = supabase
      .from("quotes")
      .select(
        "id, service_order_id, status, service_order:service_orders(status)",
        { count: "exact", head: false }
      )
      .in("status", ["paid", "converted"]);
    if (partnerId) scheduledQ = scheduledQ.eq("partner_id", partnerId);
    const { data: scheduledRows } = await scheduledQ;

    type ScheduledRow = {
      service_order_id: string | null;
      service_order: { status: string } | { status: string }[] | null;
    };
    const scheduled_count = ((scheduledRows as unknown) as ScheduledRow[] | null)?.filter(
      (r) => {
        if (!r.service_order_id) return false;
        const so = Array.isArray(r.service_order) ? r.service_order[0] : r.service_order;
        const s = so?.status;
        return s === "pending" || s === "assigned" || s === "scheduled";
      }
    ).length ?? 0;

    // Garantias abertas
    let warrQ = supabase
      .from("warranties")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]);
    if (partnerId) warrQ = warrQ.eq("partner_id", partnerId);
    const { count: warranties_open_count } = await warrQ;

    // Contratado no mes (quotes pagas)
    let monthQ = supabase
      .from("quotes")
      .select("total_amount, paid_at")
      .in("status", ["paid", "converted"])
      .gte("paid_at", monthStart);
    if (partnerId) monthQ = monthQ.eq("partner_id", partnerId);
    const { data: monthQuotes } = await monthQ;

    const contracted_this_month = ((monthQuotes as { total_amount: number }[] | null) ?? [])
      .reduce((s, q) => s + (Number(q.total_amount) || 0), 0);

    return jsonResponse({
      scheduled_count,
      warranties_open_count: warranties_open_count ?? 0,
      contracted_this_month: Math.round(contracted_this_month * 100) / 100,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
