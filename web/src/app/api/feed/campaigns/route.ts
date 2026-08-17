import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

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

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();
    const body = await request.json();

    const nome = String(body.name ?? "").trim();
    if (!nome) throw new AuthError(400, "Informe o nome da campanha");
    if (!body.sponsor_id) throw new AuthError(400, "Toda campanha precisa de um patrocinador");

    const inicio = body.starts_at ? new Date(body.starts_at) : null;
    const fim = body.ends_at ? new Date(body.ends_at) : null;
    if (inicio && fim && fim <= inicio) {
      throw new AuthError(400, "O fim da campanha precisa ser depois do início");
    }

    const inteiro = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };

    const { data, error } = await supabase
      .from("feed_campaigns")
      .insert({
        sponsor_id: body.sponsor_id,
        name: nome,
        objective: body.objective?.trim() || null,
        status: "draft",
        starts_at: inicio?.toISOString() ?? null,
        ends_at: fim?.toISOString() ?? null,
        // Valor em centavos: guardar dinheiro em número fracionário é como se
        // perde centavo em relatório.
        budget_cents: body.budget_reais
          ? Math.round(Number(body.budget_reais) * 100)
          : (inteiro(body.budget_cents) ?? null),
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

    logAudit({
      userId: user.id,
      action: "feed_campaign.created",
      entityType: "feed_campaign",
      entityId: data.id,
      newData: { nome, patrocinador: body.sponsor_id },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
