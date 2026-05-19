import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface LevelPayload {
  level: string;
  min_overall_score?: number;
  min_specialties?: number;
  min_certifications?: number;
  min_days_active?: number;
  requires_certification?: boolean;
}

/**
 * GET /api/level-config
 * Critérios dos níveis Bronze/Prata/Ouro.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("level_config")
      .select("*")
      .order("order_index", { ascending: true });

    if (error) throw new Error("Falha ao carregar os níveis");
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/level-config
 * Atualiza os critérios dos níveis. Apenas admin.
 * Body: { levels: [{ level, min_overall_score, min_specialties,
 *         min_certifications, min_days_active, requires_certification }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!Array.isArray(body.levels) || body.levels.length === 0) {
      throw new AuthError(400, "levels deve ser uma lista");
    }

    const supabase = getAdminClient();

    for (const lv of body.levels as LevelPayload[]) {
      if (!lv.level || !["bronze", "prata", "ouro"].includes(lv.level)) {
        throw new AuthError(400, "Nível inválido");
      }
      const update: Record<string, unknown> = {};
      if (lv.min_overall_score !== undefined) {
        update.min_overall_score = Math.max(0, Number(lv.min_overall_score) || 0);
      }
      if (lv.min_specialties !== undefined) {
        update.min_specialties = Math.max(0, Number(lv.min_specialties) || 0);
      }
      if (lv.min_certifications !== undefined) {
        update.min_certifications = Math.max(
          0,
          Number(lv.min_certifications) || 0
        );
      }
      if (lv.min_days_active !== undefined) {
        update.min_days_active = Math.max(0, Number(lv.min_days_active) || 0);
      }
      if (lv.requires_certification !== undefined) {
        update.requires_certification = !!lv.requires_certification;
      }
      if (Object.keys(update).length === 0) continue;

      const { error } = await supabase
        .from("level_config")
        .update(update)
        .eq("level", lv.level);
      if (error) throw new Error(`Falha ao atualizar o nível ${lv.level}`);
    }

    logAudit({
      userId: user.id,
      action: "level_config.updated",
      entityType: "level_config",
      entityId: user.id,
      newData: { levels: body.levels.length },
    });

    const { data } = await supabase
      .from("level_config")
      .select("*")
      .order("order_index", { ascending: true });

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
