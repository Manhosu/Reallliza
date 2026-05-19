import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/evaluation-config
 * Pesos das 3 fontes da avaliação (Sistema, Cliente, Qualidade).
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("evaluation_weights")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("Falha ao carregar os pesos");

    return jsonResponse(
      data ?? { weight_system: 34, weight_client: 33, weight_quality: 33 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/evaluation-config
 * Atualiza os pesos. Apenas admin. Os 3 pesos devem somar 100.
 * Body: { weight_system, weight_client, weight_quality }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const ws = Number(body.weight_system);
    const wc = Number(body.weight_client);
    const wq = Number(body.weight_quality);

    for (const [name, v] of [
      ["weight_system", ws],
      ["weight_client", wc],
      ["weight_quality", wq],
    ] as const) {
      if (!Number.isInteger(v) || v < 0) {
        throw new AuthError(400, `${name} deve ser um inteiro >= 0`);
      }
    }
    if (ws + wc + wq !== 100) {
      throw new AuthError(400, "Os pesos devem somar 100");
    }

    const supabase = getAdminClient();

    const { data: existing } = await supabase
      .from("evaluation_weights")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      weight_system: ws,
      weight_client: wc,
      weight_quality: wq,
    };

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("evaluation_weights")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error("Falha ao salvar os pesos");
      result = data;
    } else {
      const { data, error } = await supabase
        .from("evaluation_weights")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error("Falha ao salvar os pesos");
      result = data;
    }

    logAudit({
      userId: user.id,
      action: "evaluation_weights.updated",
      entityType: "evaluation_weights",
      entityId: result.id,
      newData: payload,
    });

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
