export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";
import { formatReportResponse } from "@/lib/api-helpers/report-format";

/**
 * GET /api/reports/os-by-partner
 * Admin-only. Returns service order stats grouped by partner.
 * Query params: date_from, date_to, partner_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const partnerId = searchParams.get("partner_id");
    const format = searchParams.get("format");

    const supabase = getAdminClient();

    let query = supabase
      .from("service_orders")
      .select(
        `
        status,
        estimated_value,
        final_value,
        partner_id,
        partner:partners(company_name, cnpj)
      `
      )
      .not("partner_id", "is", null);

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    if (partnerId) {
      query = query.eq("partner_id", partnerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch OS by partner report: ${error.message}`);
      throw new Error("Failed to generate report");
    }

    // Group by partner
    const partnerMap = new Map<
      string,
      {
        partner_id: string;
        name: string;
        cnpj: string | null;
        total: number;
        completed: number;
        pending: number;
        in_progress: number;
        cancelled: number;
        total_estimated_value: number;
        total_final_value: number;
      }
    >();

    for (const row of data || []) {
      const r = row as any;
      const pid = r.partner_id || "unknown";
      const partnerName = r.partner?.company_name || "Sem parceiro";
      const partnerCnpj = r.partner?.cnpj || null;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partner_id: pid,
          name: partnerName,
          cnpj: partnerCnpj,
          total: 0,
          completed: 0,
          pending: 0,
          in_progress: 0,
          cancelled: 0,
          total_estimated_value: 0,
          total_final_value: 0,
        });
      }

      const entry = partnerMap.get(pid)!;
      entry.total++;
      if (r.status === "completed") entry.completed++;
      if (r.status === "in_progress") entry.in_progress++;
      if (r.status === "cancelled") entry.cancelled++;
      if (
        r.status === "pending" ||
        r.status === "draft" ||
        r.status === "assigned"
      ) {
        entry.pending++;
      }
      entry.total_estimated_value += r.estimated_value || 0;
      entry.total_final_value += r.final_value || 0;
    }

    const partners = Array.from(partnerMap.values()).map((p) => ({
      ...p,
      completion_rate:
        p.total > 0
          ? parseFloat(((p.completed / p.total) * 100).toFixed(1))
          : 0,
    }));

    const columns = [
      { key: "name", label: "Parceiro", width: 150 },
      { key: "cnpj", label: "CNPJ" },
      { key: "total", label: "Total OS" },
      { key: "completed", label: "Concluidas" },
      { key: "in_progress", label: "Em Andamento" },
      { key: "pending", label: "Pendentes" },
      { key: "cancelled", label: "Canceladas" },
      { key: "completion_rate", label: "Taxa Conclusao (%)" },
      { key: "total_estimated_value", label: "Valor Est." },
      { key: "total_final_value", label: "Valor Final" },
    ];

    const summaryObj = {
      total_partners: partners.length,
      total_orders: (data || []).length,
    };

    return formatReportResponse(
      format,
      "Relatorio OS por Parceiro",
      columns,
      partners,
      { "Total de Parceiros": partners.length, "Total de OS": (data || []).length },
      { filters: { date_from: dateFrom, date_to: dateTo, partner_id: partnerId }, summary: summaryObj, data: partners }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
