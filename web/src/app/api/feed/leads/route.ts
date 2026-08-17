import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Leads do feed — o pedido que nasce de um botão de ação.
 *
 * POST é do profissional: ele toca em "Solicitar Contato" ou "Solicitar
 * Amostra" e o pedido vira registro com nome, telefone e origem. Clique
 * contado ninguém cobra; pedido rastreável, sim.
 *
 * GET é da administração, para trabalhar a fila.
 */
const TIPOS = ["contato", "amostra", "orcamento", "revendedor", "cupom", "treinamento", "outro"];

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();
    const body = await request.json();

    if (!body.post_id) throw new AuthError(400, "Informe a publicação");
    const tipo = TIPOS.includes(body.kind) ? body.kind : "contato";

    const { data: pode } = await supabase.rpc("feed_pode_ver", {
      p_post: body.post_id,
      p_user: user.id,
    });
    if (!pode) throw new AuthError(403, "Esta publicação não está disponível para você");

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, campaign_id, sponsor_id, title")
      .eq("id", body.post_id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");

    // O contato é copiado do perfil no instante do pedido, e o que a pessoa
    // digitar tem prioridade. O patrocinador recebe o dado como estava quando
    // o pedido foi feito — mudança de cadastro depois não reescreve o
    // histórico do que foi entregue.
    const { data: perfil } = await supabase
      .from("profiles")
      .select("full_name, email, phone, uf, city_name")
      .eq("id", user.id)
      .maybeSingle();

    const nome = String(body.name ?? perfil?.full_name ?? "").trim();
    if (!nome) throw new AuthError(400, "Informe seu nome para o contato");

    const registro = {
      post_id: post.id,
      cta_id: body.cta_id || null,
      campaign_id: post.campaign_id,
      sponsor_id: post.sponsor_id,
      user_id: user.id,
      kind: tipo,
      name: nome,
      email: String(body.email ?? perfil?.email ?? "").trim() || null,
      phone: String(body.phone ?? perfil?.phone ?? "").trim() || null,
      uf: perfil?.uf ?? null,
      city_name: perfil?.city_name ?? null,
      message: String(body.message ?? "").trim() || null,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    };

    // Pedido repetido não vira lead novo: a chave (publicação, pessoa, tipo)
    // é única. Reenviar atualiza o que já existe, o que também deixa a pessoa
    // corrigir um telefone digitado errado.
    const { data, error } = await supabase
      .from("feed_leads")
      .upsert(registro, { onConflict: "post_id,user_id,kind" })
      .select("id, kind, status, created_at")
      .single();

    if (error) throw new Error(error.message);

    return jsonResponse(
      {
        ...data,
        mensagem:
          tipo === "amostra"
            ? "Pedido de amostra enviado. O fabricante vai entrar em contato."
            : "Pedido enviado. Em breve entram em contato com você.",
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const situacao = searchParams.get("status");
    const patrocinador = searchParams.get("sponsor_id");
    const campanha = searchParams.get("campaign_id");
    const publicacao = searchParams.get("post_id");
    const limite = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    let consulta = supabase
      .from("feed_leads")
      .select(
        "*, post:feed_posts(id, title), sponsor:feed_sponsors(id, name), campaign:feed_campaigns(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(limite);

    if (situacao) consulta = consulta.eq("status", situacao);
    if (patrocinador) consulta = consulta.eq("sponsor_id", patrocinador);
    if (campanha) consulta = consulta.eq("campaign_id", campanha);
    if (publicacao) consulta = consulta.eq("post_id", publicacao);

    const { data, error } = await consulta;
    if (error) throw new Error(error.message);

    const { data: todos } = await supabase.from("feed_leads").select("status, kind");
    const porSituacao: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const l of todos ?? []) {
      porSituacao[l.status] = (porSituacao[l.status] ?? 0) + 1;
      porTipo[l.kind] = (porTipo[l.kind] ?? 0) + 1;
    }

    return jsonResponse({
      leads: data ?? [],
      resumo: {
        total: todos?.length ?? 0,
        por_situacao: porSituacao,
        por_tipo: porTipo,
        taxa_conversao:
          (todos?.length ?? 0) > 0
            ? Number((((porSituacao.convertido ?? 0) / (todos?.length ?? 1)) * 100).toFixed(1))
            : 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();
    const body = await request.json();

    if (!body.id) throw new AuthError(400, "Informe o lead");
    const SITUACOES = ["novo", "em_contato", "qualificado", "convertido", "descartado"];
    if (body.status && !SITUACOES.includes(body.status)) {
      throw new AuthError(400, `Situação inválida. Use: ${SITUACOES.join(", ")}`);
    }

    const mudancas: Record<string, unknown> = { handled_by: user.id };
    if (body.status) mudancas.status = body.status;
    if ("notes" in body) mudancas.notes = body.notes?.trim() || null;

    // A data da conversão é carimbada por gatilho no banco, não aqui:
    // relatório que depende de alguém lembrar de preencher data vira
    // relatório errado.
    const { data, error } = await supabase
      .from("feed_leads")
      .update(mudancas)
      .eq("id", body.id)
      .select("id, status, converted_at")
      .single();

    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "feed_lead.updated",
      entityType: "feed_lead",
      entityId: body.id,
      newData: mudancas,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
