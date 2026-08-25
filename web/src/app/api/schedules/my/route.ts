import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { getUserTeamIds, buildTeamScopeFilter } from "@/lib/api-helpers/team-scope";

/**
 * GET /api/schedules/my
 * List schedules for the authenticated technician.
 * Supports date_from/date_to filters.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const status = searchParams.get("status");

    const supabase = getAdminClient();

    // Jessica 10/08: os agendamentos gerados na conversao de orcamento nascem
    // com technician_id NULL e so' team_id preenchido (a equipe distribui
    // internamente). Sem o escopo de equipe a aba Agenda do app fica vazia.
    const teamIds = await getUserTeamIds(supabase, user.id);
    const scope = buildTeamScopeFilter(user.id, teamIds);

    // A nova Agenda (pedido da Jéssica, ago/2026) mostra endereço completo,
    // contato do cliente e "tipo de serviço" (derivado de external_metadata)
    // em cada card — nenhum desses campos vinha antes, e a tela só sabia
    // exibir a cidade.
    let query = supabase
      .from("schedules")
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(
          id, order_number, title, status, priority,
          client_name, client_phone, client_email,
          address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip,
          external_metadata
        )
      `
      );

    query = scope ? query.or(scope) : query.eq("technician_id", user.id);

    if (status) {
      query = query.eq("status", status);
    }

    if (date_from) {
      query = query.gte("date", date_from);
    }

    if (date_to) {
      query = query.lte("date", date_to);
    }

    query = query
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch my schedules: ${error.message}`);
      throw new Error("Failed to fetch schedules");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
