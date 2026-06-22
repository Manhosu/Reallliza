import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { cancelNfe } from "@/lib/nfe/client";

/**
 * POST /api/invoices/[id]/cancel
 * Cancela a NFe via provedor (janela tipica de 24h). Apenas admin.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, nfe_status, nfe_external_id")
      .eq("id", id)
      .single();

    if (!invoice) throw new AuthError(404, "Fatura nao encontrada");

    const inv = invoice as { nfe_status: string; nfe_external_id: string | null };

    if (inv.nfe_status !== "issued") {
      throw new AuthError(400, "Apenas NFe ja emitida pode ser cancelada");
    }
    if (!inv.nfe_external_id) {
      throw new AuthError(400, "Fatura sem identificador no provedor");
    }

    const result = await cancelNfe(inv.nfe_external_id);
    if (!result.ok) {
      throw new AuthError(
        400,
        result.error_message ?? "Falha ao cancelar NFe no provedor"
      );
    }

    await supabase
      .from("invoices")
      .update({
        nfe_status: "cancelled",
        nfe_cancelled_at: new Date().toISOString(),
      })
      .eq("id", id);

    logAudit({
      userId: user.id,
      action: "invoice.nfe_cancelled",
      entityType: "invoice",
      entityId: id,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
