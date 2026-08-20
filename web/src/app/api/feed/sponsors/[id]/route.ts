import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const CAMPOS_EDITAVEIS = [
  "name", "legal_name", "sponsor_type", "partner_id", "logo_url",
  "website_url", "primary_color", "contact_name", "contact_email", "is_active",
  "is_house_account",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: patrocinador } = await supabase
      .from("feed_sponsors")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!patrocinador) throw new AuthError(404, "Patrocinador não encontrado");

    const [campanhas, publicacoes, leads] = await Promise.all([
      supabase
        .from("feed_campaigns")
        .select("id, name, status, starts_at, ends_at")
        .eq("sponsor_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("feed_posts")
        .select("id, title, status, published_at, impression_count, click_count, lead_count")
        .eq("sponsor_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("feed_leads")
        .select("id, status", { count: "exact" })
        .eq("sponsor_id", id),
    ]);

    const convertidos = (leads.data ?? []).filter((l) => l.status === "convertido").length;

    return jsonResponse({
      ...patrocinador,
      campanhas: campanhas.data ?? [],
      publicacoes: publicacoes.data ?? [],
      leads: { total: leads.count ?? 0, convertidos },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const body = await request.json();

    const mudancas: Record<string, unknown> = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (campo in body) mudancas[campo] = body[campo];
    }
    // CNPJ fica de fora da edição livre de propósito: trocar o CNPJ de um
    // patrocinador com campanha em curso reescreve o histórico comercial.
    if (Object.keys(mudancas).length === 0) {
      throw new AuthError(400, "Nada para alterar");
    }
    if ("name" in mudancas && !String(mudancas.name ?? "").trim()) {
      throw new AuthError(400, "O nome não pode ficar vazio");
    }
    // Mesma checagem proativa do POST: no máximo uma conta-casa.
    if (mudancas.is_house_account === true) {
      const { data: existente } = await supabase
        .from("feed_sponsors")
        .select("id, name")
        .eq("is_house_account", true)
        .neq("id", id)
        .maybeSingle();
      if (existente) {
        throw new AuthError(
          409,
          `Já existe uma conta configurada como loja Reallliza (sem cobrança): "${existente.name}"`
        );
      }
    }

    const { data, error } = await supabase
      .from("feed_sponsors")
      .update(mudancas)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "feed_sponsor.updated",
      entityType: "feed_sponsor",
      entityId: id,
      newData: mudancas,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Patrocinador com campanha nunca é apagado — é desativado.
 *
 * Apagar levaria junto o vínculo das publicações e o relatório do que já foi
 * entregue e cobrado. Desativar tira das listas de seleção e preserva o
 * histórico.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const [{ count: comCampanha }, { count: comPost }] = await Promise.all([
      supabase.from("feed_campaigns").select("id", { count: "exact", head: true }).eq("sponsor_id", id),
      supabase.from("feed_posts").select("id", { count: "exact", head: true }).eq("sponsor_id", id),
    ]);

    const temHistorico = (comCampanha ?? 0) > 0 || (comPost ?? 0) > 0;

    if (temHistorico) {
      const { error } = await supabase
        .from("feed_sponsors")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw new Error(error.message);

      logAudit({
        userId: user.id,
        action: "feed_sponsor.deactivated",
        entityType: "feed_sponsor",
        entityId: id,
        newData: { campanhas: comCampanha, publicacoes: comPost },
      });

      return jsonResponse({
        desativado: true,
        motivo: `Este patrocinador tem ${comCampanha ?? 0} campanha(s) e ${comPost ?? 0} publicação(ões). Foi desativado para preservar o histórico.`,
      });
    }

    const { error } = await supabase.from("feed_sponsors").delete().eq("id", id);
    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "feed_sponsor.deleted",
      entityType: "feed_sponsor",
      entityId: id,
    });

    return jsonResponse({ excluido: true });
  } catch (error) {
    return errorResponse(error);
  }
}
