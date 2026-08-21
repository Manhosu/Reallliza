import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { linhas as tipar } from "@/lib/api-helpers/rows";
import {
  resolverPrecoCampanha,
  validarValorDeCobertura,
  garantirCampanhaLiberada,
  type EscopoRegional,
} from "@/lib/feed/pricing";
import { resolverSponsorDoUsuario } from "@/lib/feed/sponsor-auth";

/** Campos que um sponsor pode editar na própria campanha — o resto é admin only. */
const CAMPOS_EDITAVEIS_POR_SPONSOR = new Set([
  "coverage_type", "coverage_scope", "coverage_value", "duration_days",
  "name", "objective", "notes",
]);

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
    checkRole(user, ["admin", "sponsor"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: campanha } = await supabase
      .from("feed_campaigns")
      .select("*, sponsor:feed_sponsors(id, name, logo_url, primary_color, contact_name, contact_email)")
      .eq("id", id)
      .maybeSingle();

    if (!campanha) throw new AuthError(404, "Campanha não encontrada");
    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      if (campanha.sponsor_id !== sponsor_id) throw new AuthError(404, "Campanha não encontrada");
    }

    const [publicacoes, diario, leads, recortes] = await Promise.all([
      supabase
        .from("feed_posts")
        .select(
          "id, title, status, published_at, impression_count, unique_reach, click_count, " +
            "lead_count, conversion_count, like_count, comment_count, share_count, " +
            "save_count, download_count, video_view_count"
        )
        .eq("campaign_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("feed_post_daily_metrics")
        .select(
          "day, impressions, unique_reach, views, clicks, downloads, leads, conversions, " +
            "video_starts, video_q25, video_q50, video_q75, video_q100, video_watch_ms"
        )
        .eq("campaign_id", id)
        .order("day"),
      supabase
        .from("feed_leads")
        .select("id, kind, status, created_at")
        .eq("campaign_id", id),
      // Os sete recortes que o José pediu, agora também no nível da campanha
      // — é o nível em que ele foi vendido.
      supabase
        .from("feed_post_daily_metrics_dim")
        .select("dim_type, dim_value, impressions, views, clicks, post_id")
        .in(
          "post_id",
          (
            await supabase.from("feed_posts").select("id").eq("campaign_id", id)
          ).data?.map((p) => p.id) ?? ["00000000-0000-0000-0000-000000000000"]
        ),
    ]);

    const dias = tipar<Record<string, number>>(diario.data);
    const soma = (campo: string) => dias.reduce((a, d) => a + Number(d[campo] ?? 0), 0);

    const impressoes = soma("impressions");
    const cliques = soma("clicks");
    const totalLeads = (leads.data ?? []).length;
    const convertidos = (leads.data ?? []).filter((l) => l.status === "convertido").length;

    // Interações vêm dos contadores da publicação, não da série diária: são
    // estado atual (quantas curtidas a peça tem), não fluxo por dia.
    const pecas = tipar<Record<string, number>>(publicacoes.data);
    const somaPecas = (campo: string) =>
      pecas.reduce((a, p) => a + Number(p[campo] ?? 0), 0);

    const curtidas = somaPecas("like_count");
    const comentarios = somaPecas("comment_count");
    const compartilhamentos = somaPecas("share_count");
    const salvamentos = somaPecas("save_count");
    const alcanceUnico = somaPecas("unique_reach");
    const engajamentos = curtidas + comentarios + compartilhamentos + salvamentos;
    const inicios = soma("video_starts");

    // Agrupa os recortes por dimensão, somando as peças da campanha.
    const porDimensao: Record<string, Array<{ valor: string; impressoes: number; cliques: number }>> = {};
    for (const r of tipar<{ dim_type: string; dim_value: string; impressions: number; clicks: number }>(recortes.data)) {
      const lista = (porDimensao[r.dim_type] ??= []);
      const existente = lista.find((x) => x.valor === r.dim_value);
      if (existente) {
        existente.impressoes += Number(r.impressions ?? 0);
        existente.cliques += Number(r.clicks ?? 0);
      } else {
        lista.push({
          valor: r.dim_value,
          impressoes: Number(r.impressions ?? 0),
          cliques: Number(r.clicks ?? 0),
        });
      }
    }
    for (const k of Object.keys(porDimensao)) {
      porDimensao[k].sort((a, b) => b.impressoes - a.impressoes);
    }

    return jsonResponse({
      ...campanha,
      publicacoes: pecas,
      totais: {
        impressoes,
        alcance_unico: alcanceUnico,
        visualizacoes: soma("views"),
        curtidas,
        comentarios,
        compartilhamentos,
        salvamentos,
        cliques,
        downloads: soma("downloads"),
        leads: totalLeads,
        conversoes: convertidos,
        ctr: impressoes > 0 ? Number(((cliques / impressoes) * 100).toFixed(2)) : 0,
        // Engajamento sobre alcance, não sobre impressões — a definição que o
        // mercado usa e a que o cliente tem na cabeça.
        taxa_engajamento:
          alcanceUnico > 0 ? Number(((engajamentos / alcanceUnico) * 100).toFixed(2)) : 0,
        // Do clique ao pedido: é a taxa que separa campanha que gera atenção
        // de campanha que gera negócio.
        taxa_lead: cliques > 0 ? Number(((totalLeads / cliques) * 100).toFixed(2)) : 0,
        taxa_conversao: totalLeads > 0 ? Number(((convertidos / totalLeads) * 100).toFixed(2)) : 0,
        video: {
          inicios,
          q25: soma("video_q25"),
          q50: soma("video_q50"),
          q75: soma("video_q75"),
          completos: soma("video_q100"),
          tempo_medio_ms: inicios > 0 ? Math.round(soma("video_watch_ms") / inicios) : 0,
        },
      },
      evolucao_diaria: dias,
      recortes: porDimensao,
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
    checkRole(user, ["admin", "sponsor"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const body = await request.json();

    const { data: atual } = await supabase
      .from("feed_campaigns")
      .select(
        "id, status, name, sponsor_id, payment_status, approval_status, coverage_type, coverage_scope, coverage_value, duration_days"
      )
      .eq("id", id)
      .maybeSingle();
    if (!atual) throw new AuthError(404, "Campanha não encontrada");

    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      if (atual.sponsor_id !== sponsor_id) throw new AuthError(404, "Campanha não encontrada");
      const camposForaDaLista = Object.keys(body).filter((c) => !CAMPOS_EDITAVEIS_POR_SPONSOR.has(c));
      if (camposForaDaLista.length > 0) {
        throw new AuthError(403, `Só o administrador altera: ${camposForaDaLista.join(", ")}.`);
      }
    }

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
      // Ativar/agendar sem pagamento confirmado ou aprovação seria a peça
      // paga indo ao ar sem ter passado pelo controle pedido.
      if (body.status === "scheduled" || body.status === "active") {
        garantirCampanhaLiberada(atual);
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

    // Abrangência e duração só são editáveis enquanto o preço ainda não foi
    // travado por um pagamento — depois de pago, mudar cobertura reabriria
    // a pergunta de quanto foi cobrado por quê.
    const pedeMudarCobertura = ["coverage_type", "coverage_scope", "coverage_value", "duration_days"].some(
      (c) => c in body
    );
    if (pedeMudarCobertura) {
      if (atual.payment_status !== "pending") {
        throw new AuthError(409, "Esta campanha já foi paga — não é possível mudar abrangência ou duração.");
      }
      const coverageType: "nacional" | "regional" =
        body.coverage_type === "regional" || body.coverage_type === "nacional"
          ? body.coverage_type
          : (atual.coverage_type as "nacional" | "regional");
      const coverageScope: EscopoRegional | null =
        coverageType === "regional"
          ? ("coverage_scope" in body ? body.coverage_scope : atual.coverage_scope) ?? null
          : null;
      const coverageValue: string | null =
        coverageType === "regional"
          ? ("coverage_value" in body ? body.coverage_value : atual.coverage_value) ?? null
          : null;
      if (coverageType === "regional" && coverageScope && coverageValue) {
        await validarValorDeCobertura(supabase, coverageScope, coverageValue);
      }
      const duracao = "duration_days" in body ? Number(body.duration_days) : Number(atual.duration_days);
      const preco = await resolverPrecoCampanha(supabase, {
        coverage_type: coverageType,
        coverage_scope: coverageScope,
        coverage_value: coverageValue,
        duration_days: duracao,
      });
      mudancas.coverage_type = coverageType;
      mudancas.coverage_scope = coverageScope;
      mudancas.coverage_value = coverageValue;
      mudancas.duration_days = duracao;
      mudancas.price_per_day_cents = preco.price_per_day_cents;
      mudancas.total_price_cents = preco.total_cents;
      mudancas.pricing_rule_id = preco.pricing_rule_id;
      mudancas.budget_cents = preco.total_cents;
    }

    if (Object.keys(mudancas).length === 0) throw new AuthError(400, "Nada para alterar");

    const inicio = mudancas.starts_at ?? null;
    const fim = mudancas.ends_at ?? null;
    if (inicio && fim && new Date(String(fim)) <= new Date(String(inicio))) {
      throw new AuthError(400, "O fim da campanha precisa ser depois do início");
    }

    // Editar o conteúdo depois de reprovada reabre a fila de aprovação —
    // sem isto, a campanha corrigida ficaria travada em "rejected" para
    // sempre, sem nenhum caminho de volta.
    const mudaAlgoAlemDoStatus = Object.keys(mudancas).some((k) => k !== "status");
    if (atual.approval_status === "rejected" && mudaAlgoAlemDoStatus) {
      mudancas.approval_status = "pending";
      mudancas.rejection_reason = null;
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
