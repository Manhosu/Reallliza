export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";
import { formatReportResponse } from "@/lib/api-helpers/report-format";

/**
 * GET /api/reports/tools-custody
 * Admin-only. Returns current tool custody status and overdue items.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const format = request.nextUrl.searchParams.get("format");
    const supabase = getAdminClient();

    // Fetch all active custodies (not checked in yet)
    const { data: activeCustodies, error: custodyError } = await supabase
      .from("tool_custody")
      .select(
        `
        id,
        checked_out_at,
        expected_return_at,
        condition_out,
        notes,
        tool:tool_inventory(id, name, serial_number),
        user:profiles(id, full_name),
        service_order:service_orders(id, order_number, title)
      `
      )
      .is("checked_in_at", null)
      .order("checked_out_at", { ascending: false });

    if (custodyError) {
      console.error(
        `Failed to fetch tools custody report: ${custodyError.message}`
      );
      throw new Error("Failed to generate report");
    }

    const items = activeCustodies || [];
    const now = new Date().toISOString();

    // Identify overdue items
    const mapped = items.map((row: any) => {
      const isOverdue =
        row.expected_return_at && row.expected_return_at < now;
      return {
        custody_id: row.id,
        tool_id: row.tool?.id || null,
        tool_name: row.tool?.name || null,
        serial_number: row.tool?.serial_number || null,
        technician_id: row.user?.id || null,
        technician_name: row.user?.full_name || null,
        service_order_id: row.service_order?.id || null,
        order_number: row.service_order?.order_number || null,
        order_title: row.service_order?.title || null,
        checked_out_at: row.checked_out_at,
        expected_return_at: row.expected_return_at,
        condition_out: row.condition_out,
        notes: row.notes,
        is_overdue: isOverdue,
      };
    });

    const overdueCount = mapped.filter((item) => item.is_overdue).length;

    const columns = [
      { key: "tool_name", label: "Ferramenta", width: 120 },
      { key: "serial_number", label: "Numero Serie" },
      { key: "technician_name", label: "Tecnico" },
      { key: "order_number", label: "OS" },
      { key: "checked_out_at", label: "Saida" },
      { key: "expected_return_at", label: "Retorno Previsto" },
      { key: "condition_out", label: "Condicao" },
      { key: "is_overdue", label: "Atrasado" },
    ];

    const summaryObj = {
      total_active_custodies: mapped.length,
      overdue_count: overdueCount,
      generated_at: now,
    };

    return formatReportResponse(
      format,
      "Relatorio Ferramentas em Custodia",
      columns,
      mapped,
      { "Custodias Ativas": mapped.length, "Atrasados": overdueCount },
      { summary: summaryObj, data: mapped }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
