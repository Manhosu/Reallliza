import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Patrocinadores — o cadastro que sustenta a monetização do feed.
 *
 * A tabela existe desde a 063, com logotipo, cor da marca e contato, porque
 * o plano previa a Fase 4 e remodelar depois sairia caro. O que faltava era
 * a porta de entrada.
 *
 * GET  lista, com o desempenho acumulado de cada um.
 * POST cadastra.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const busca = searchParams.get("q")?.trim();
    const somenteAtivos = searchParams.get("ativos") === "1";

    let consulta = supabase
      .from("feed_sponsors")
      .select("*")
      .order("name");

    if (somenteAtivos) consulta = consulta.eq("is_active", true);
    if (busca) consulta = consulta.ilike("name", `%${busca}%`);

    const { data: patrocinadores, error } = await consulta;
    if (error) throw new Error(error.message);

    // Desempenho por patrocinador numa consulta só. Uma chamada por linha
    // transformaria uma lista de vinte em vinte e uma consultas.
    const { data: metricas } = await supabase
      .from("feed_post_daily_metrics")
      .select("sponsor_id, impressions, clicks, video_starts")
      .not("sponsor_id", "is", null);

    const acumulado = new Map<string, { impressoes: number; cliques: number }>();
    for (const m of metricas ?? []) {
      const atual = acumulado.get(m.sponsor_id) ?? { impressoes: 0, cliques: 0 };
      atual.impressoes += Number(m.impressions ?? 0);
      atual.cliques += Number(m.clicks ?? 0);
      acumulado.set(m.sponsor_id, atual);
    }

    const { data: campanhas } = await supabase
      .from("feed_campaigns")
      .select("sponsor_id, status");

    const porPatrocinador = new Map<string, { total: number; ativas: number }>();
    for (const c of campanhas ?? []) {
      const atual = porPatrocinador.get(c.sponsor_id) ?? { total: 0, ativas: 0 };
      atual.total += 1;
      if (c.status === "active") atual.ativas += 1;
      porPatrocinador.set(c.sponsor_id, atual);
    }

    return jsonResponse({
      patrocinadores: (patrocinadores ?? []).map((p) => ({
        ...p,
        desempenho: acumulado.get(p.id) ?? { impressoes: 0, cliques: 0 },
        campanhas: porPatrocinador.get(p.id) ?? { total: 0, ativas: 0 },
      })),
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
    if (!nome) throw new AuthError(400, "Informe o nome do patrocinador");

    const TIPOS = ["fabricante", "loja", "distribuidor", "parceiro", "outro"];
    const tipo = TIPOS.includes(body.sponsor_type) ? body.sponsor_type : "fabricante";

    // CNPJ é único na tabela; devolver o erro do banco cru mostraria nome de
    // constraint para quem só quer saber que a empresa já está cadastrada.
    const cnpj = String(body.cnpj ?? "").replace(/\D/g, "") || null;
    if (cnpj) {
      const { data: existente } = await supabase
        .from("feed_sponsors")
        .select("id, name")
        .eq("cnpj", cnpj)
        .maybeSingle();
      if (existente) {
        throw new AuthError(409, `Este CNPJ já está cadastrado para "${existente.name}"`);
      }
    }

    const { data, error } = await supabase
      .from("feed_sponsors")
      .insert({
        name: nome,
        legal_name: body.legal_name?.trim() || null,
        cnpj,
        sponsor_type: tipo,
        partner_id: body.partner_id || null,
        logo_url: body.logo_url || null,
        website_url: body.website_url || null,
        primary_color: body.primary_color || null,
        contact_name: body.contact_name?.trim() || null,
        contact_email: body.contact_email?.trim() || null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "feed_sponsor.created",
      entityType: "feed_sponsor",
      entityId: data.id,
      newData: { nome, tipo },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
