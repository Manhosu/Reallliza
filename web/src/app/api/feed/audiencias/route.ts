import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import {
  estimarAudiencia, resolverAudiencia, RegraInvalida, type RegraAudiencia,
} from "@/lib/feed/audience";

/**
 * Públicos do Feed.
 *
 * A publicação sempre aponta para uma regra salva, nunca carrega critério
 * solto. Isso é o que permite reaproveitar "Instaladores homologados do
 * Sudeste" na campanha seguinte, e é o que faz o recálculo periódico ter onde
 * acontecer.
 *
 * GET  lista os públicos, com o tamanho estimado.
 * POST estima uma regra ainda não salva, ou salva um público novo.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("feed_audience_rules")
      .select("id, name, description, definition, estimated_size, computed_at, is_reusable")
      .order("name");
    if (error) throw new Error(error.message);

    return jsonResponse({ audiencias: data ?? [] });
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

    const definicao = body.definition as RegraAudiencia | undefined;
    if (!definicao) throw new AuthError(400, "Informe os critérios do público");

    // Só estimar: é o que a tela chama a cada mudança de critério, para
    // mostrar "alcança N pessoas" antes de o administrador salvar qualquer
    // coisa. Estimar não grava nada.
    if (body.apenas_estimar) {
      try {
        const total = await estimarAudiencia(supabase, definicao);
        return jsonResponse({ estimativa: total });
      } catch (e) {
        if (e instanceof RegraInvalida) throw new AuthError(400, e.message);
        throw e;
      }
    }

    const nome = String(body.name ?? "").trim();
    if (!nome) throw new AuthError(400, "Dê um nome ao público para poder reaproveitá-lo");

    let criada;
    try {
      // Estimar antes de gravar serve de validação: regra que o compilador
      // recusa nunca chega a virar público salvo.
      const estimativa = await estimarAudiencia(supabase, definicao);

      const { data, error } = await supabase
        .from("feed_audience_rules")
        .insert({
          name: nome,
          description: body.description?.trim() || null,
          definition: definicao,
          estimated_size: estimativa,
          created_by: user.id,
        })
        .select("id, name, estimated_size")
        .single();

      if (error) {
        if (error.code === "23505") throw new AuthError(409, `Já existe um público chamado "${nome}"`);
        throw new Error(error.message);
      }
      criada = data;
    } catch (e) {
      if (e instanceof RegraInvalida) throw new AuthError(400, e.message);
      throw e;
    }

    // Materializa a lista já na criação: sem isso o público existe e não
    // alcança ninguém até o próximo recálculo.
    const { total } = await resolverAudiencia(supabase, criada.id);

    logAudit({
      userId: user.id,
      action: "feed_audience.created",
      entityType: "feed_audience_rule",
      entityId: criada.id,
      newData: { nome, alcance: total },
    });

    return jsonResponse({ ...criada, alcance: total }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
