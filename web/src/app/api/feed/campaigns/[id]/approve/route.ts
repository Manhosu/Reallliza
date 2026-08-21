import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { aprovarEPublicarCampanha } from "@/lib/feed/posts";

/**
 * POST /api/feed/campaigns/[id]/approve
 *
 * Desde 21/08 a aprovação já acontece sozinha assim que o pagamento é
 * confirmado (manual pelo admin ou automático via webhook do PIX) — ver
 * `aprovarEPublicarCampanha` em `lib/feed/posts.ts`. Karol pediu: aprovação
 * manual virou gargalo pro volume real de uso.
 *
 * Esta rota continua existindo pro caso raro de reprocessar: um post que
 * nasceu em rascunho DEPOIS da campanha já estar paga/aprovada (ela chama a
 * mesma função, que é idempotente).
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

    const resultado = await aprovarEPublicarCampanha(supabase, id, user.id);

    const { data: atualizada } = await supabase
      .from("feed_campaigns")
      .select("*")
      .eq("id", id)
      .single();

    return jsonResponse({
      ...atualizada,
      publicacoes_publicadas: resultado.publicacoes_publicadas,
      publicacoes_com_falha: resultado.publicacoes_com_falha,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
