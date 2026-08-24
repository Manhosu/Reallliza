import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createPixCharge, isAsaasConfigured } from "@/lib/asaas/client";
import { resolverSponsorDoUsuario } from "@/lib/feed/sponsor-auth";

/**
 * POST /api/feed/campaigns/[id]/pix
 *
 * Gera (ou reaproveita) a cobrança PIX da campanha — QR Code + copia-e-cola.
 * Quem paga é sempre quem está pedindo: admin (que pode repassar o PIX pro
 * cliente por fora) ou o próprio sponsor dono da campanha.
 *
 * Não publica nada — confirma pagamento. Quem publica é a aprovação
 * (POST /feed/campaigns/[id]/approve), depois que o admin revisa.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor", "partner"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: campanha, error } = await supabase
      .from("feed_campaigns")
      .select(
        "id, sponsor_id, name, total_price_cents, payment_status, pix_asaas_id, pix_checkout_url, pix_qr_code_base64, pix_copia_cola, pix_expires_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !campanha) throw new AuthError(404, "Campanha não encontrada");

    if (user.role !== "admin") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      if (campanha.sponsor_id !== sponsor_id) {
        throw new AuthError(403, "Esta campanha não pertence ao seu patrocinador.");
      }
    }

    if (campanha.payment_status === "waived") {
      throw new AuthError(400, "Esta campanha é da loja Reallliza — não cobra, não precisa de PIX.");
    }
    if (campanha.payment_status === "paid") {
      throw new AuthError(400, "Esta campanha já está paga.");
    }

    // Reaproveita a cobrança já gerada enquanto ela ainda vale — evita abrir
    // uma cobrança nova na Asaas a cada vez que a pessoa recarrega a tela.
    const jaTemPixValido =
      campanha.pix_asaas_id &&
      campanha.pix_expires_at &&
      new Date(campanha.pix_expires_at).getTime() > Date.now();

    if (jaTemPixValido) {
      return jsonResponse({
        pix_disponivel: true,
        reaproveitado: true,
        asaas_id: campanha.pix_asaas_id,
        checkout_url: campanha.pix_checkout_url,
        qr_code_base64: campanha.pix_qr_code_base64,
        copia_cola: campanha.pix_copia_cola,
        expira_em: campanha.pix_expires_at,
      });
    }

    if (!isAsaasConfigured()) {
      return jsonResponse({
        pix_disponivel: false,
        mensagem:
          "Pagamento por PIX automático não está configurado. Peça ao administrador para confirmar o pagamento manualmente.",
      });
    }

    const { data: patrocinador } = await supabase
      .from("feed_sponsors")
      .select("name, legal_name, cnpj, contact_email")
      .eq("id", campanha.sponsor_id)
      .maybeSingle();
    if (!patrocinador) throw new AuthError(404, "Patrocinador não encontrado");

    // A Asaas recusa criar cliente sem CPF/CNPJ válido (erro 400) — sem essa
    // checagem antes, a pessoa via um 500 genérico sem entender o motivo.
    // Cadastros feitos depois do fix em /api/company-signup já não deixam
    // passar CNPJ com tamanho errado, mas cadastros antigos (ou criados
    // direto pelo admin) ainda podem ter um valor inválido salvo.
    if (!patrocinador.cnpj || patrocinador.cnpj.length !== 14) {
      return jsonResponse({
        pix_disponivel: false,
        mensagem: !patrocinador.cnpj
          ? "Falta o CNPJ deste patrocinador. Peça ao administrador para completar o cadastro antes de gerar o PIX."
          : "O CNPJ cadastrado para este patrocinador está inválido (não tem 14 dígitos). Peça ao administrador para corrigir antes de gerar o PIX.",
      });
    }

    let charge;
    try {
      charge = await createPixCharge({
        amount: (campanha.total_price_cents ?? 0) / 100,
        description: `Campanha do Feed — ${campanha.name}`,
        customerName: patrocinador.legal_name || patrocinador.name,
        customerDocument: patrocinador.cnpj || undefined,
        customerEmail: patrocinador.contact_email || undefined,
        externalReference: campanha.id,
      });
    } catch (asaasError) {
      // Sem isto, qualquer rejeição da Asaas (CNPJ que passou nas checagens
      // acima mas ainda assim é recusado, valor inválido, etc.) derrubava a
      // rota com 500 cru — a tela ficava com o bloco de PIX em branco, sem
      // nenhuma mensagem, e a pessoa achava que só não tinha acontecido nada.
      console.error(`createPixCharge falhou: ${asaasError instanceof Error ? asaasError.message : asaasError}`);
      return jsonResponse({
        pix_disponivel: false,
        mensagem:
          "Não foi possível gerar o PIX com os dados cadastrados. Peça ao administrador para conferir o CNPJ e tentar de novo, ou confirmar o pagamento manualmente.",
      });
    }

    if (!charge) {
      return jsonResponse({
        pix_disponivel: false,
        mensagem:
          "Pagamento por PIX automático não está configurado. Peça ao administrador para confirmar o pagamento manualmente.",
      });
    }

    await supabase
      .from("feed_campaigns")
      .update({
        pix_asaas_id: charge.asaasId,
        pix_checkout_url: charge.checkoutUrl,
        pix_qr_code_base64: charge.qrCodeBase64,
        pix_copia_cola: charge.copiaCola,
        pix_expires_at: charge.expiraEm,
        pix_generated_at: new Date().toISOString(),
      })
      .eq("id", id);

    logAudit({
      userId: user.id,
      action: "feed_campaign.pix_generated",
      entityType: "feed_campaign",
      entityId: id,
      newData: { asaas_id: charge.asaasId },
    });

    return jsonResponse({
      pix_disponivel: true,
      reaproveitado: false,
      asaas_id: charge.asaasId,
      checkout_url: charge.checkoutUrl,
      qr_code_base64: charge.qrCodeBase64,
      copia_cola: charge.copiaCola,
      expira_em: charge.expiraEm,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
