import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/quotes/[id]/release-payout
 * Libera o repasse pro homologado (modalidade Homologados). Apenas admin.
 *
 * Valida:
 *   - Quote modalidade = 'homologados'
 *   - Payment com custody_status = 'held'
 *   - OS vinculada esta `completed`
 *   - Todas as etapas obrigatorias concluidas
 *   - Quote tem `payout_amount` > 0
 *
 * Acao:
 *   - Marca payments.custody_status='released' + released_at + released_by
 *   - Cria Transfer Asaas pro homologado (se ASAAS_API_KEY + asaas_account_id)
 *   - Audit log
 *
 * Body opcional: { reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : null;

    const supabase = getAdminClient();

    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .select(
        "id, modality, service_order_id, payout_amount, custody_held"
      )
      .eq("id", id)
      .single();

    if (qErr || !quote) {
      throw new AuthError(404, "Orçamento não encontrado");
    }
    if (quote.modality !== "homologados") {
      throw new AuthError(
        400,
        "Repasse só se aplica à modalidade Homologados"
      );
    }
    if (!quote.service_order_id) {
      throw new AuthError(400, "Orçamento sem OS vinculada");
    }
    if (!quote.payout_amount || Number(quote.payout_amount) <= 0) {
      throw new AuthError(400, "payout_amount inválido na quote");
    }

    // Valida OS concluida
    const { data: os } = await supabase
      .from("service_orders")
      .select("id, status, technician_id")
      .eq("id", quote.service_order_id)
      .single();

    if (!os) {
      throw new AuthError(404, "OS não encontrada");
    }
    if (os.status !== "completed") {
      throw new AuthError(
        400,
        `OS precisa estar concluída antes do repasse (status atual: ${os.status}).`
      );
    }

    // Etapas obrigatorias todas concluidas
    const { data: steps } = await supabase
      .from("os_step_executions")
      .select("status, metadata")
      .eq("service_order_id", os.id);

    const pendingRequired = (steps ?? []).filter((s) => {
      const meta = ((s as { metadata?: Record<string, unknown> }).metadata ??
        {}) as { is_required?: boolean };
      const isRequired = meta.is_required !== false; // default true
      return (
        isRequired &&
        (s as { status: string }).status !== "completed" &&
        (s as { status: string }).status !== "skipped"
      );
    });
    if (pendingRequired.length > 0) {
      throw new AuthError(
        400,
        `${pendingRequired.length} etapa(s) obrigatória(s) ainda não concluída(s).`
      );
    }

    // Payment com custodia
    const { data: payment } = await supabase
      .from("payments")
      .select("id, custody_status, asaas_id")
      .eq("quote_id", id)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      throw new AuthError(400, "Nenhum pagamento confirmado vinculado");
    }
    if (payment.custody_status !== "held") {
      throw new AuthError(
        400,
        `Custódia em estado inválido para liberação: ${payment.custody_status}`
      );
    }

    // Asaas Transfer (best-effort — sem chave configurada, marca apenas no DB)
    const asaasApiKey = process.env.ASAAS_API_KEY;
    const asaasEnv = process.env.ASAAS_ENV ?? "sandbox";
    const baseUrl =
      asaasEnv === "production"
        ? "https://api.asaas.com/v3"
        : "https://sandbox.asaas.com/api/v3";

    let asaasTransferId: string | null = null;
    let transferError: string | null = null;

    // Carrega wallet_id do tecnico (caso F2.x — homologado tem subaccount)
    if (asaasApiKey && os.technician_id) {
      const { data: techProfile } = await supabase
        .from("profiles")
        .select("asaas_wallet_id")
        .eq("id", os.technician_id)
        .maybeSingle();

      const walletId = (techProfile as { asaas_wallet_id?: string } | null)
        ?.asaas_wallet_id;

      if (walletId) {
        try {
          const res = await fetch(`${baseUrl}/transfers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              access_token: asaasApiKey,
            },
            body: JSON.stringify({
              walletId,
              value: Number(quote.payout_amount),
              externalReference: payment.id,
              description: `Repasse OS #${quote.service_order_id?.slice(0, 8)}`,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { id?: string };
            asaasTransferId = data.id ?? null;
          } else {
            const errText = await res.text();
            transferError = `Asaas transfer failed: ${res.status} ${errText.slice(0, 200)}`;
            console.error(transferError);
          }
        } catch (err) {
          transferError = err instanceof Error ? err.message : "transfer error";
          console.error("Asaas transfer error:", err);
        }
      } else {
        transferError =
          "Homologado sem asaas_wallet_id — repasse marcado como liberado mas transferência manual necessária.";
      }
    }

    // Marca como released
    const releasedAt = new Date().toISOString();
    await supabase
      .from("payments")
      .update({
        custody_status: "released",
        released_at: releasedAt,
        released_by: user.id,
        release_reason: reason,
        asaas_transfer_id: asaasTransferId,
      })
      .eq("id", payment.id);

    await supabase
      .from("quotes")
      .update({ custody_held: false })
      .eq("id", id);

    logAudit({
      userId: user.id,
      action: "payment.payout_released",
      entityType: "payment",
      entityId: payment.id,
      newData: {
        quote_id: id,
        service_order_id: os.id,
        amount: quote.payout_amount,
        asaas_transfer_id: asaasTransferId,
        transfer_error: transferError,
        reason,
      },
    });

    return jsonResponse({
      success: true,
      payment_id: payment.id,
      asaas_transfer_id: asaasTransferId,
      transfer_warning: transferError,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
