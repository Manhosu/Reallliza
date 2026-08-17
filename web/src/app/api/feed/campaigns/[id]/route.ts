import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Transições permitidas da campanha.
 *
 * Um mapa explícito, e não um campo livre, porque "encerrada" que volta para
 * "ativa" é o tipo de coisa que ninguém quer explicar ao cliente depois. De
 * encerrada só se sai para arquivada.
 */
const TRANSICOES: Record<string, string[]> = {
  draft:     ["scheduled", "active", "archived"],
  scheduled: ["active", "paused", "ended", "archived"],
  active:    ["paused", "ended"],
  paused:    ["active", "ended", "archived"],
  ended:     ["archived"],
  archived:  [],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: campanha } = await supabase
      .from("feed_campaigns")
      .select("*, sponsor:feed_sponsors(id, name, logo_url, primary_color, contact_name, contact_email)")
      .eq("id", id)
      .maybeSingle();

    if (!campanha) throw new AuthError(404, "Campanha não encontrada");

    const [publicacoes, diario, leads] = await Promise.all([
      supabase
        .from("feed_posts")
        .select("id, title, status, published_at, impression_count, unique_reach, click_count, lead_count, conversion_count")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("feed_post_daily_metrics")
        .select("day, impressions, unique_reach, views, clicks, downloads, leads, conversions, video_starts, video_q100")
        .eq("campaign_id", id)
        .order("day"),
      supabase
        .from("feed_leads")
        .select("id, kind, status, created_at")
        .eq("campaign_id", id),
    ]);

    const dias = diario.data ?? [];
    const soma = (campo: string) =>
      dias.reduce((a, d) => a + Number((d as Record<string, unknown>)[campo] ?? 0), 0);

    const impressoes = soma("impressions");
    const cliques = soma("clicks");
    const totalLeads = (leads.data ?? []).length;
    const convertidos = (leads.data ?? []).filter((l) => l.status === "convertido").length;

    return jsonResponse({
      ...campanha,
      publicacoes: publicacoes.data ?? [],
      totais: {
        impressoes,
        visualizacoes: soma("views"),
        cliques,
        downloads: soma("downloads"),
        leads: totalLeads,
        conversoes: convertidos,
        ctr: impressoes > 0 ? Number(((cliques / impressoes) * 100).toFixed(2)) : 0,
        // Do clique ao pedido: é a taxa que separa campanha que gera atenção
        // de campanha que gera negócio.
        taxa_lead: cliques > 0 ? Number(((totalLeads / cliques) * 100).toFixed(2)) : 0,
        taxa_conversao: totalLeads > 0 ? Number(((convertidos / totalLeads) * 100).toFixed(2)) : 0,
      },
      evolucao_diaria: dias,
      transicoes_possiveis: TRANSICOES[campanha.status] ?? [],
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

    const { data: atual } = await supabase
      .from("feed_campaigns")
      .select("id, status, name")
      .eq("id", id)
      .maybeSingle();
    if (!atual) throw new AuthError(404, "Campanha não encontrada");

    const mudancas: Record<string, unknown> = {};

    if (body.status && body.status !== atual.status) {
      const permitidas = TRANSICOES[atual.status] ?? [];
      if (!permitidas.includes(body.status)) {
        throw new AuthError(
          409,
          `Uma campanha "${atual.status}" não pode passar para "${body.status}".` +
            (permitidas.length ? ` Possíveis: ${permitidas.join(", ")}.` : " Ela está encerrada.")
        );
      }
      mudancas.status = body.status;
    }

    for (const campo of ["name", "objective", "contract_ref", "notes", "starts_at", "ends_at"]) {
      if (campo in body) mudancas[campo] = body[campo] || null;
    }
    for (const campo of ["goal_impressions", "goal_clicks", "goal_leads", "frequency_cap"]) {
      if (campo in body) {
        const n = Number(body[campo]);
        mudancas[campo] = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      }
    }
    if ("budget_reais" in body) {
      mudancas.budget_cents = body.budget_reais ? Math.round(Number(body.budget_reais) * 100) : null;
    }

    if (Object.keys(mudancas).length === 0) throw new AuthError(400, "Nada para alterar");

    const inicio = mudancas.starts_at ?? null;
    const fim = mudancas.ends_at ?? null;
    if (inicio && fim && new Date(String(fim)) <= new Date(String(inicio))) {
      throw new AuthError(400, "O fim da campanha precisa ser depois do início");
    }

    const { data, error } = await supabase
      .from("feed_campaigns")
      .update(mudancas)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Encerrar campanha tira as peças do ar junto. Deixar publicação
    // patrocinada rodando depois do fim do contrato é entrega não cobrada —
    // e, do lado do cliente, promessa quebrada.
    let pecasPausadas = 0;
    if (mudancas.status === "ended" || mudancas.status === "paused") {
      const { data: pecas } = await supabase
        .from("feed_posts")
        .update({ status: "paused", is_published: false })
        .eq("campaign_id", id)
        .eq("status", "published")
        .select("id");
      pecasPausadas = pecas?.length ?? 0;
    }

    logAudit({
      userId: user.id,
      action: "feed_campaign.updated",
      entityType: "feed_campaign",
      entityId: id,
      newData: { ...mudancas, pecasPausadas },
    });

    return jsonResponse({ ...data, pecas_pausadas: pecasPausadas });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { count } = await supabase
      .from("feed_posts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id);

    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from("feed_campaigns")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw new Error(error.message);

      logAudit({
        userId: user.id,
        action: "feed_campaign.archived",
        entityType: "feed_campaign",
        entityId: id,
      });

      return jsonResponse({
        arquivada: true,
        motivo: `Esta campanha tem ${count} publicação(ões) e foi arquivada em vez de excluída, para o histórico não se perder.`,
      });
    }

    const { error } = await supabase.from("feed_campaigns").delete().eq("id", id);
    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "feed_campaign.deleted",
      entityType: "feed_campaign",
      entityId: id,
    });

    return jsonResponse({ excluida: true });
  } catch (error) {
    return errorResponse(error);
  }
}
