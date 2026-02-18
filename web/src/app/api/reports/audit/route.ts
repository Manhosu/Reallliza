export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/reports/audit
 * Admin-only. Returns audit log entries with optional filters.
 * Query params: date_from, date_to, entity_type (optional), action (optional), user_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const entityType = searchParams.get("entity_type");
    const action = searchParams.get("action");
    const userId = searchParams.get("user_id");

    if (!dateFrom || !dateTo) {
      return jsonResponse(
        { message: "date_from and date_to are required" },
        400
      );
    }

    const supabase = getAdminClient();

    let query = supabase
      .from("audit_logs")
      .select(
        `
        id,
        created_at,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        old_data,
        new_data,
        user_id,
        user:profiles!audit_logs_user_id_fkey(full_name)
      `
      )
      .gte("created_at", `${dateFrom}T00:00:00`)
      .lte("created_at", `${dateTo}T23:59:59`)
      .order("created_at", { ascending: false });

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch audit report: ${error.message}`);
      throw new Error("Failed to generate report");
    }

    const logs = data || [];

    // Summary: group by action
    const actionBreakdown: Record<string, number> = {};
    const entityBreakdown: Record<string, number> = {};
    for (const log of logs) {
      const l = log as any;
      const a = l.action || "unknown";
      const e = l.entity_type || "unknown";
      actionBreakdown[a] = (actionBreakdown[a] || 0) + 1;
      entityBreakdown[e] = (entityBreakdown[e] || 0) + 1;
    }

    return jsonResponse({
      filters: {
        date_from: dateFrom,
        date_to: dateTo,
        entity_type: entityType,
        action,
        user_id: userId,
      },
      summary: {
        total_entries: logs.length,
        action_breakdown: actionBreakdown,
        entity_breakdown: entityBreakdown,
      },
      data: logs.map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        user_id: row.user_id,
        user_name: row.user?.full_name || null,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        old_data: row.old_data,
        new_data: row.new_data,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
