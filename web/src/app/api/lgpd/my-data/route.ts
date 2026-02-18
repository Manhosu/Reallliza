export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/lgpd/my-data
 * Authenticated. Returns all personal data for the current user (LGPD data portability).
 * Includes profile, service orders, checklists, photos metadata, audit logs, notifications, and consent.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    // Fetch all user-related data in parallel
    const [
      profileRes,
      serviceOrdersRes,
      checklistsRes,
      photosRes,
      auditLogsRes,
      notificationsRes,
      consentRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single(),
      supabase
        .from("service_orders")
        .select("*")
        .or(`created_by.eq.${user.id},technician_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
      supabase
        .from("checklists")
        .select("*")
        .eq("completed_by", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("photos")
        .select("*")
        .eq("uploaded_by", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_consents")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      console.error(
        `Failed to fetch profile for LGPD export: ${profileRes.error.message}`
      );
      throw new Error("Failed to export user data");
    }

    if (!profileRes.data) {
      return jsonResponse({ message: "User profile not found" }, 404);
    }

    // Log the data export for audit purposes
    logAudit({
      userId: user.id,
      action: "lgpd.data_exported",
      entityType: "user",
      entityId: user.id,
      ipAddress: request.headers.get("x-forwarded-for") || null,
      userAgent: request.headers.get("user-agent") || null,
    });

    return jsonResponse({
      exported_at: new Date().toISOString(),
      profile: profileRes.data,
      consent: consentRes.data || null,
      service_orders: serviceOrdersRes.data || [],
      checklists: checklistsRes.data || [],
      photos: photosRes.data || [],
      audit_logs: auditLogsRes.data || [],
      notifications: notificationsRes.data || [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
