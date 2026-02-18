import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { type, id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select(
        "*, user:profiles!audit_logs_user_id_fkey(id, full_name, email)"
      )
      .eq("entity_type", type)
      .eq("entity_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Failed to fetch audit logs for ${type}/${id}: ${error.message}`
      );
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
