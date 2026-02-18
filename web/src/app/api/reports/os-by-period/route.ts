export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/reports/os-by-period
 * Admin-only. Returns service orders filtered/grouped by period.
 * Query params: date_from, date_to, status, priority
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

    if (!dateFrom || !dateTo) {
      return jsonResponse(
        { message: "date_from and date_to are required" },
        400
      );
    }

    const supabase = getAdminClient();

    let query = supabase
      .from("service_orders")
      .select(
        `
        id,
        order_number,
        title,
        status,
        priority,
        estimated_value,
        final_value,
        created_at,
        scheduled_date,
        technician:profiles!service_orders_technician_id_fkey(full_name),
        partner:partners!service_orders_partner_id_fkey(company_name)
      `
      )
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch OS by period report: ${error.message}`);
      throw new Error("Failed to generate report");
    }

    const orders = data || [];

    const totalOs = orders.length;
    const totalEstimatedValue = orders.reduce(
      (sum: number, r: any) => sum + (r.estimated_value || 0),
      0
    );
    const totalFinalValue = orders.reduce(
      (sum: number, r: any) => sum + (r.final_value || 0),
      0
    );

    // Group counts by status
    const statusBreakdown: Record<string, number> = {};
    for (const order of orders) {
      const s = (order as any).status || "unknown";
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }

    return jsonResponse({
      filters: { date_from: dateFrom, date_to: dateTo, status, priority },
      summary: {
        total_orders: totalOs,
        total_estimated_value: totalEstimatedValue,
        total_final_value: totalFinalValue,
        status_breakdown: statusBreakdown,
      },
      data: orders.map((row: any) => ({
        id: row.id,
        order_number: row.order_number,
        title: row.title,
        status: row.status,
        priority: row.priority,
        estimated_value: row.estimated_value,
        final_value: row.final_value,
        created_at: row.created_at,
        scheduled_date: row.scheduled_date,
        technician_name: row.technician?.full_name || null,
        partner_name: row.partner?.company_name || null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
