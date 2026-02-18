export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/reports/financial
 * Admin-only. Returns financial summary from service orders.
 * Query params: date_from, date_to
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    if (!dateFrom || !dateTo) {
      return jsonResponse(
        { message: "date_from and date_to are required" },
        400
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("service_orders")
      .select("estimated_value, final_value, created_at, status")
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`Failed to fetch financial report: ${error.message}`);
      throw new Error("Failed to generate report");
    }

    const orders = data || [];

    const totalOs = orders.length;
    const totalEstimated = orders.reduce(
      (sum: number, r: any) => sum + (r.estimated_value || 0),
      0
    );
    const totalFinal = orders.reduce(
      (sum: number, r: any) => sum + (r.final_value || 0),
      0
    );
    const averageTicket = totalOs > 0 ? totalFinal / totalOs : 0;

    // Breakdown by status
    const statusBreakdown: Record<
      string,
      { count: number; estimated_value: number; final_value: number }
    > = {};
    for (const order of orders) {
      const r = order as any;
      const s = r.status || "unknown";
      if (!statusBreakdown[s]) {
        statusBreakdown[s] = { count: 0, estimated_value: 0, final_value: 0 };
      }
      statusBreakdown[s].count++;
      statusBreakdown[s].estimated_value += r.estimated_value || 0;
      statusBreakdown[s].final_value += r.final_value || 0;
    }

    // Monthly breakdown
    const MONTH_NAMES_PT = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];

    const monthMap = new Map<
      string,
      {
        month: string;
        year: number;
        label: string;
        count: number;
        estimated_value: number;
        final_value: number;
      }
    >();

    for (const order of orders) {
      const r = order as any;
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTH_NAMES_PT[d.getMonth()]}/${d.getFullYear()}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          month: key,
          year: d.getFullYear(),
          label,
          count: 0,
          estimated_value: 0,
          final_value: 0,
        });
      }

      const entry = monthMap.get(key)!;
      entry.count++;
      entry.estimated_value += r.estimated_value || 0;
      entry.final_value += r.final_value || 0;
    }

    const monthlyData = Array.from(monthMap.values()).map((m) => ({
      ...m,
      average_ticket: m.count > 0 ? m.final_value / m.count : 0,
    }));

    return jsonResponse({
      filters: { date_from: dateFrom, date_to: dateTo },
      summary: {
        total_orders: totalOs,
        total_estimated_value: totalEstimated,
        total_final_value: totalFinal,
        average_ticket: averageTicket,
        status_breakdown: statusBreakdown,
      },
      monthly: monthlyData,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
