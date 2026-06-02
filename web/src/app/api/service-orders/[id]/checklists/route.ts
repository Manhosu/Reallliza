import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/service-orders/[id]/checklists
 * List checklists for a service order.
 * Alias for /api/checklists/service-order/[serviceOrderId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id: serviceOrderId } = await params;

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("checklists")
      .select(
        `
        *,
        template:checklist_templates(id, name),
        technician:profiles!checklists_technician_id_fkey(id, full_name)
      `
      )
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to fetch checklists: ${error.message}`);
      throw new Error("Failed to fetch checklists");
    }

    // Alias `data` (coluna jsonb no DB) → `items` (que web admin e mobile esperam).
    // Mantemos `data` no retorno também pra compat retro de outros consumidores.
    const mapped = (data || []).map((cl: Record<string, unknown>) => ({
      ...cl,
      items: (cl.data ?? []) as unknown[],
    }));

    return jsonResponse(mapped);
  } catch (error) {
    return errorResponse(error);
  }
}
