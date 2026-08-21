import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverPrecoCampanha, validarValorDeCobertura, type EscopoRegional } from "@/lib/feed/pricing";

/**
 * POST /api/feed/campaigns/price-preview
 *
 * Não persiste nada — é o que a tela chama a cada mudança de abrangência ou
 * duração pra mostrar o valor antes de criar a campanha de verdade.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor", "partner"]);
    const supabase = getAdminClient();
    const body = await request.json();

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

    const preco = await resolverPrecoCampanha(supabase, {
      coverage_type: coverageType,
      coverage_scope: coverageScope,
      coverage_value: coverageValue,
      duration_days: Number(body.duration_days),
    });

    return jsonResponse(preco);
  } catch (error) {
    return errorResponse(error);
  }
}
