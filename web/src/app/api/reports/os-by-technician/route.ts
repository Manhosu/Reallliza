export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";
import { formatReportResponse } from "@/lib/api-helpers/report-format";

/**
 * GET /api/reports/os-by-technician
 * Admin-only. Returns service order stats grouped by technician.
 * Query params: date_from, date_to, technician_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const technicianId = searchParams.get("technician_id");
    const format = searchParams.get("format");

    const supabase = getAdminClient();

    let query = supabase
      .from("service_orders")
      .select(
        `
        status,
        technician_id,
        estimated_value,
        final_value,
        technician:profiles!service_orders_technician_id_fkey(full_name)
      `
      )
      .not("technician_id", "is", null);

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    if (technicianId) {
      query = query.eq("technician_id", technicianId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `Failed to fetch OS by technician report: ${error.message}`
      );
      throw new Error("Failed to generate report");
    }

    // Group by technician
    const techMap = new Map<
      string,
      {
        technician_id: string;
        name: string;
        total: number;
        completed: number;
        in_progress: number;
        cancelled: number;
        pending: number;
        total_estimated_value: number;
        total_final_value: number;
      }
    >();

    for (const row of data || []) {
      const r = row as any;
      const techName = r.technician?.full_name || "Sem tecnico";
      const techId = r.technician_id || "unknown";

      if (!techMap.has(techId)) {
        techMap.set(techId, {
          technician_id: techId,
          name: techName,
          total: 0,
          completed: 0,
          in_progress: 0,
          cancelled: 0,
          pending: 0,
          total_estimated_value: 0,
          total_final_value: 0,
        });
      }

      const entry = techMap.get(techId)!;
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

    const technicians = Array.from(techMap.values()).map((t) => ({
      ...t,
      completion_rate:
        t.total > 0
          ? parseFloat(((t.completed / t.total) * 100).toFixed(1))
          : 0,
    }));

    const columns = [
      { key: "name", label: "Tecnico", width: 150 },
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
      total_technicians: technicians.length,
      total_orders: (data || []).length,
    };

    return formatReportResponse(
      format,
      "Relatorio OS por Tecnico",
      columns,
      technicians,
      { "Total de Tecnicos": technicians.length, "Total de OS": (data || []).length },
      { filters: { date_from: dateFrom, date_to: dateTo, technician_id: technicianId }, summary: summaryObj, data: technicians }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
