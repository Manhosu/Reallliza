import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { publicarPost } from "@/lib/feed/posts";

/**
 * POST /api/feed/campaigns/[id]/approve
 *
 * Aprovação editorial — é o controle da Reallliza sobre o que vai ao ar.
 * Recusa se o pagamento ainda está pendente: aprovar antes de pagar
 * inverteria o fluxo pedido. (A conta-casa nunca passa por aqui — pula
 * pagamento E aprovação, ver `garantirCampanhaLiberada`.)
 *
 * Aprovar publica sozinho: no diagrama pedido (CRIAR → CONFIGURAR → PAGAR →
 * APROVAR → PUBLICAR), não existe clique separado depois da aprovação. Por
 * isso, logo depois de marcar `approval_status='approved'`, publica todo
 * post em rascunho vinculado a esta campanha.
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

    const { data: campanha, error } = await supabase
      .from("feed_campaigns")
      .select("id, payment_status, approval_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !campanha) throw new AuthError(404, "Campanha não encontrada");

    if (campanha.payment_status === "pending") {
      throw new AuthError(402, "Esta campanha ainda não teve o pagamento confirmado.");
    }
    if (campanha.approval_status === "approved") {
      throw new AuthError(400, "Esta campanha já está aprovada.");
    }

    const { data: atualizada, error: errUp } = await supabase
      .from("feed_campaigns")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        rejection_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (errUp) throw new Error(errUp.message);

    logAudit({
      userId: user.id,
      action: "feed_campaign.approved",
      entityType: "feed_campaign",
      entityId: id,
    });

    // Publica sozinho os rascunhos desta campanha. A aprovação em si já foi
    // gravada — se um post falhar (ex.: audiência zerada), a falha fica
    // isolada nesta lista em vez de desfazer a aprovação; aquele post
    // continua em draft, publicável depois via POST /feed/[id]/publish.
    const { data: rascunhos } = await supabase
      .from("feed_posts")
      .select("id")
      .eq("campaign_id", id)
      .eq("status", "draft");

    const publicadas: string[] = [];
    const falhas: Array<{ post_id: string; erro: string }> = [];
    for (const post of rascunhos ?? []) {
      try {
        const r = await publicarPost(supabase, post.id, user.id);
        publicadas.push(r.id);
      } catch (e) {
        falhas.push({ post_id: post.id, erro: e instanceof Error ? e.message : "erro desconhecido" });
      }
    }

    return jsonResponse({
      ...atualizada,
      publicacoes_publicadas: publicadas,
      publicacoes_com_falha: falhas,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
