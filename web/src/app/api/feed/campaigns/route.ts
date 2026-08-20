import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { resolverPrecoCampanha, validarValorDeCobertura, type EscopoRegional } from "@/lib/feed/pricing";
import { criarPost } from "@/lib/feed/posts";

/**
 * Campanhas — o guarda-chuva comercial das publicações patrocinadas.
 *
 * Uma campanha reúne várias peças do mesmo patrocinador, com período, meta e
 * referência de contrato. É o nível em que o fabricante pensa e em que a
 * cobrança acontece; publicação é a peça.
 *
 * As metas (impressões, cliques, leads) entram aqui e não na publicação
 * porque é a campanha que foi vendida.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const situacao = searchParams.get("status");
    const patrocinador = searchParams.get("sponsor_id");

    let consulta = supabase
      .from("feed_campaigns")
      .select("*, sponsor:feed_sponsors(id, name, logo_url, primary_color)")
      .order("created_at", { ascending: false });

    if (situacao) consulta = consulta.eq("status", situacao);
    if (patrocinador) consulta = consulta.eq("sponsor_id", patrocinador);

    const { data: campanhas, error } = await consulta;
    if (error) throw new Error(error.message);

    // Entregue x contratado, numa consulta só para a lista inteira.
    const { data: metricas } = await supabase
      .from("feed_post_daily_metrics")
      .select("campaign_id, impressions, clicks, leads, conversions")
      .not("campaign_id", "is", null);

    const soma = new Map<string, { impressoes: number; cliques: number; leads: number; conversoes: number }>();
    for (const m of metricas ?? []) {
      const a = soma.get(m.campaign_id) ?? { impressoes: 0, cliques: 0, leads: 0, conversoes: 0 };
      a.impressoes += Number(m.impressions ?? 0);
      a.cliques += Number(m.clicks ?? 0);
      a.leads += Number(m.leads ?? 0);
      a.conversoes += Number(m.conversions ?? 0);
      soma.set(m.campaign_id, a);
    }

    const pct = (feito: number, meta?: number | null) =>
      meta && meta > 0 ? Math.min(999, Math.round((feito / meta) * 100)) : null;

    return jsonResponse({
      campanhas: (campanhas ?? []).map((c) => {
        const entregue = soma.get(c.id) ?? { impressoes: 0, cliques: 0, leads: 0, conversoes: 0 };
        return {
          ...c,
          entregue,
          // Percentual só existe quando há meta contratada. Mostrar "0%" para
          // campanha sem meta faria toda campanha institucional parecer
          // fracassada.
          progresso: {
            impressoes: pct(entregue.impressoes, c.goal_impressions),
            cliques: pct(entregue.cliques, c.goal_clicks),
            leads: pct(entregue.leads, c.goal_leads),
          },
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST cria a campanha e, opcionalmente, a primeira peça (`body.post`) no
 * mesmo pedido — é assim que o editor unificado do Feed evita a pessoa
 * alternar entre "Feed" e "Campanhas" para publicar algo patrocinado.
 *
 * O preço nunca vem do cliente: é sempre recalculado aqui a partir de
 * `coverage_type/scope/value` + `duration_days`, contra as regras que o
 * admin configurou em Configurações Globais → Preços do Feed.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  let campanhaId: string | null = null;

  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const body = await request.json();

    const nome = String(body.name ?? "").trim();
    if (!nome) throw new AuthError(400, "Informe o nome da campanha");
    if (!body.sponsor_id) throw new AuthError(400, "Toda campanha precisa de um patrocinador");

    const { data: patrocinador } = await supabase
      .from("feed_sponsors")
      .select("id, is_house_account")
      .eq("id", body.sponsor_id)
      .maybeSingle();
    if (!patrocinador) throw new AuthError(400, "Patrocinador não encontrado");

    const coverageType = body.coverage_type === "regional" ? "regional" : "nacional";
    const coverageScope: EscopoRegional | null =
      coverageType === "regional" && (body.coverage_scope === "uf" || body.coverage_scope === "regiao")
        ? body.coverage_scope
        : null;
    const coverageValue: string | null =
      coverageType === "regional" && typeof body.coverage_value === "string" && body.coverage_value.trim()
        ? body.coverage_value.trim()
        : null;
    if (coverageType === "regional" && coverageScope && coverageValue) {
      await validarValorDeCobertura(supabase, coverageScope, coverageValue);
    }

    const duracao = Number(body.duration_days);
    const preco = await resolverPrecoCampanha(supabase, {
      coverage_type: coverageType,
      coverage_scope: coverageScope,
      coverage_value: coverageValue,
      duration_days: duracao,
    });

    const inteiro = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };

    const { data: campanha, error } = await supabase
      .from("feed_campaigns")
      .insert({
        sponsor_id: body.sponsor_id,
        name: nome,
        objective: body.objective?.trim() || null,
        status: "draft",
        // Datas só entram quando a campanha é de fato publicada (ver
        // POST /feed/[id]/publish) — pedir início antes de paga/aprovada
        // não faz sentido.
        coverage_type: coverageType,
        coverage_scope: coverageScope,
        coverage_value: coverageValue,
        duration_days: duracao,
        price_per_day_cents: preco.price_per_day_cents,
        total_price_cents: preco.total_cents,
        pricing_rule_id: preco.pricing_rule_id,
        payment_status: patrocinador.is_house_account ? "waived" : "pending",
        approval_status: "pending",
        budget_cents: preco.total_cents,
        contract_ref: body.contract_ref?.trim() || null,
        goal_impressions: inteiro(body.goal_impressions),
        goal_clicks: inteiro(body.goal_clicks),
        goal_leads: inteiro(body.goal_leads),
        frequency_cap: inteiro(body.frequency_cap),
        notes: body.notes?.trim() || null,
        created_by: user.id,
      })
      .select("*, sponsor:feed_sponsors(id, name)")
      .single();

    if (error) throw new Error(error.message);
    campanhaId = campanha.id;

    logAudit({
      userId: user.id,
      action: "feed_campaign.created",
      entityType: "feed_campaign",
      entityId: campanha.id,
      newData: { nome, patrocinador: body.sponsor_id, total_cents: preco.total_cents },
    });

    let post = null;
    if (body.post && typeof body.post === "object") {
      const resultado = await criarPost(supabase, user.id, {
        ...body.post,
        campaign_id: campanha.id,
        sponsor_id: body.sponsor_id,
        status: "draft", // publicar é sempre ato separado, mesmo aqui
      });
      post = resultado.post;
    }

    return jsonResponse({ ...campanha, post }, 201);
  } catch (error) {
    // A peça falhou depois de a campanha já existir: apagar em vez de
    // deixar um rascunho de campanha órfão, sem peça, travado em
    // "aguardando pagamento" para sempre.
    if (campanhaId) {
      await supabase.from("feed_campaigns").delete().eq("id", campanhaId);
    }
    return errorResponse(error);
  }
}
