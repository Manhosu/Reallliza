import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * Resolves the partner table ID for a user with the partner role.
 */
async function resolvePartnerId(userId: string, userRole: string): Promise<string | null> {
  if (userRole !== "partner") return null;

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id")
    .eq("user_id", userId)
    .single();

  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const partnerId = await resolvePartnerId(user.id, user.role);

    const applyRoleFilter = (query: any) => {
      if (user.role === "partner" && partnerId) {
        return query.eq("partner_id", partnerId);
      }
      if (user.role === "technician") {
        return query.eq("technician_id", user.id);
      }
      return query; // admin - no extra filter
    };

    const today = new Date().toISOString().slice(0, 10);

    // Open: draft, pending, assigned
    const openQuery = applyRoleFilter(
      supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "pending", "assigned"])
    );

    // In progress
    const inProgressQuery = applyRoleFilter(
      supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress")
    );

    // Completed
    const completedQuery = applyRoleFilter(
      supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
    );

    // Overdue: pending/assigned/in_progress with scheduled_date < today
    const overdueQuery = applyRoleFilter(
      supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "assigned", "in_progress"])
        .lt("scheduled_date", today)
    );

    const [openRes, inProgressRes, completedRes, overdueRes] =
      await Promise.all([openQuery, inProgressQuery, completedQuery, overdueQuery]);

    if (openRes.error || inProgressRes.error || completedRes.error || overdueRes.error) {
      const msg =
        openRes.error?.message ||
        inProgressRes.error?.message ||
        completedRes.error?.message ||
        overdueRes.error?.message;
      throw new Error(`Failed to fetch dashboard stats: ${msg}`);
    }

    // Jessica 17/07: admin ganha KPIs segregados Reallliza vs Homologados.
    // Reusa a mesma regra (professional_type='external' OR is_homologated).
    let homologadosStats:
      | { openOs: number; inProgressOs: number; completedOs: number; overdueOs: number }
      | null = null;
    if (user.role === "admin" || user.role === "manager") {
      const { data: homs } = await supabase
        .from("profiles")
        .select("id")
        .or("professional_type.eq.external,is_homologated.eq.true");
      const homIds = ((homs as { id: string }[]) || []).map((p) => p.id);
      if (homIds.length > 0) {
        const inHomFilter = (q: any) => q.in("technician_id", homIds);
        const [oH, iH, cH, ovH] = await Promise.all([
          inHomFilter(
            supabase
              .from("service_orders")
              .select("id", { count: "exact", head: true })
              .in("status", ["draft", "pending", "assigned"])
          ),
          inHomFilter(
            supabase
              .from("service_orders")
              .select("id", { count: "exact", head: true })
              .eq("status", "in_progress")
          ),
          inHomFilter(
            supabase
              .from("service_orders")
              .select("id", { count: "exact", head: true })
              .eq("status", "completed")
          ),
          inHomFilter(
            supabase
              .from("service_orders")
              .select("id", { count: "exact", head: true })
              .in("status", ["pending", "assigned", "in_progress"])
              .lt("scheduled_date", today)
          ),
        ]);
        homologadosStats = {
          openOs: oH.count ?? 0,
          inProgressOs: iH.count ?? 0,
          completedOs: cH.count ?? 0,
          overdueOs: ovH.count ?? 0,
        };
      } else {
        homologadosStats = {
          openOs: 0,
          inProgressOs: 0,
          completedOs: 0,
          overdueOs: 0,
        };
      }
    }

    // Reallliza = total - homologados (evita nova query)
    const reallizaStats =
      homologadosStats && (user.role === "admin" || user.role === "manager")
        ? {
            openOs: (openRes.count ?? 0) - homologadosStats.openOs,
            inProgressOs:
              (inProgressRes.count ?? 0) - homologadosStats.inProgressOs,
            completedOs:
              (completedRes.count ?? 0) - homologadosStats.completedOs,
            overdueOs: (overdueRes.count ?? 0) - homologadosStats.overdueOs,
          }
        : null;

    return jsonResponse({
      // Totais (backward compat pra partner/technician)
      openOs: openRes.count ?? 0,
      inProgressOs: inProgressRes.count ?? 0,
      completedOs: completedRes.count ?? 0,
      overdueOs: overdueRes.count ?? 0,
      // Segregado admin (Jessica 17/07)
      reallliza: reallizaStats,
      homologados: homologadosStats,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
