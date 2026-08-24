import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * PATCH /api/company-signup/[id]
 * Admin aprova ou reprova um cadastro de empresa (loja/fabricante).
 * Body: { status: 'approved'|'rejected', reason?: string }
 *
 * Aprovar chama a função `aprovar_cadastro_empresa` (migration 080), que
 * provisiona tudo numa transação só: loja ganha `partners` + `feed_sponsors`
 * + vínculo em `feed_sponsor_users`; fabricante ganha só `feed_sponsors` +
 * o vínculo. Os dois casos liberam `profiles.status='active'` — é isso que
 * destrava o acesso (ver o bloqueio em `authenticateRequest`).
 *
 * Reprovar marca `profiles.status='inactive'`, reaproveitando o mesmo
 * bloqueio que já existe pra conta desativada.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
    if (!status) throw new AuthError(400, "Status inválido");
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    const supabase = getAdminClient();

    const { data: req } = await supabase
      .from("company_signup_requests")
      .select("id, profile_id, company_type, company_name, status")
      .eq("id", id)
      .maybeSingle();
    if (!req) throw new AuthError(404, "Cadastro não encontrado");
    if (req.status !== "pending") {
      throw new AuthError(409, "Este cadastro já foi analisado.");
    }

    if (status === "approved") {
      const { error: rpcError } = await supabase.rpc("aprovar_cadastro_empresa", {
        p_request_id: id,
        p_reviewer_id: user.id,
      });
      if (rpcError) {
        console.error(`Falha ao aprovar cadastro de empresa: ${rpcError.message}`);
        throw new Error("Falha ao aprovar o cadastro");
      }

      await createNotification(
        req.profile_id,
        "Cadastro aprovado!",
        req.company_type === "loja"
          ? "Seu cadastro foi aprovado pela Reallliza. Sua conta já está liberada para acesso."
          : "Seu cadastro foi aprovado pela Reallliza. Acesse o Portal do Patrocinador para publicar no Feed.",
        "general"
      );
    } else {
      const { error: updErr } = await supabase
        .from("company_signup_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updErr) throw new Error(`Falha ao reprovar: ${updErr.message}`);

      await supabase.from("profiles").update({ status: "inactive" }).eq("id", req.profile_id);

      await createNotification(
        req.profile_id,
        "Cadastro não aprovado",
        reason
          ? `Seu cadastro não foi aprovado pela Reallliza: ${reason}`
          : "Seu cadastro não foi aprovado pela Reallliza.",
        "general"
      );
    }

    logAudit({
      userId: user.id,
      action: `company_signup_request.${status}`,
      entityType: "company_signup_request",
      entityId: id,
      newData: { status, company_name: req.company_name, reason },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
