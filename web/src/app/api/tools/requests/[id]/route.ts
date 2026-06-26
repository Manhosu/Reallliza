import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/tools/requests/[id]
 * Aprova / rejeita uma solicitacao de ferramenta.
 * Body: { action: 'approve' | 'reject', rejection_reason?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "approve" | "reject";
      rejection_reason?: string;
    };

    if (!body.action || !["approve", "reject"].includes(body.action)) {
      throw new AuthError(400, "action must be 'approve' or 'reject'");
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role as string | undefined;
    if (!["admin", "supervisor", "gestor"].includes(role || "")) {
      throw new AuthError(403, "Apenas admin/supervisor/gestor pode decidir");
    }

    const { data: current, error: fetchError } = await supabase
      .from("tool_requests")
      .select("id, status, requester_id, tool_name, quantity, priority")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      throw new AuthError(404, "Solicitacao nao encontrada");
    }

    if (current.status !== "pending") {
      throw new AuthError(
        400,
        `Solicitacao ja esta em status '${current.status}'; nao pode mudar.`
      );
    }

    const nowIso = new Date().toISOString();
    const update =
      body.action === "approve"
        ? {
            status: "approved",
            approved_by: user.id,
            approved_at: nowIso,
          }
        : {
            status: "rejected",
            rejected_by: user.id,
            rejected_at: nowIso,
            rejection_reason: body.rejection_reason?.trim() || null,
          };

    const { data: updated, error: updateError } = await supabase
      .from("tool_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update: ${updateError.message}`);
    }

    logAudit({
      userId: user.id,
      action: body.action,
      entityType: "tool_request",
      entityId: id,
      oldData: { status: current.status } as Record<string, unknown>,
      newData: update as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse({ request: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
