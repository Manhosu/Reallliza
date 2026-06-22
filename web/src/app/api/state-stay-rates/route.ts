import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("state_stay_rates")
      .select("*")
      .order("state");
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/state-stay-rates
 * Body: { rates: [{ state, daily_rate, is_active? }] }
 * Bulk update — admin only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const rates = Array.isArray(body.rates) ? body.rates : [];
    if (rates.length === 0) {
      throw new AuthError(400, "rates obrigatorio");
    }

    const supabase = getAdminClient();
    let updated = 0;

    for (const r of rates as Array<{
      state?: string;
      daily_rate?: number;
      is_active?: boolean;
    }>) {
      if (!r.state || typeof r.state !== "string") continue;
      const update: Record<string, unknown> = {};
      if (typeof r.daily_rate === "number" && r.daily_rate >= 0) {
        update.daily_rate = Math.round(r.daily_rate * 100) / 100;
      }
      if (typeof r.is_active === "boolean") update.is_active = r.is_active;
      if (Object.keys(update).length === 0) continue;
      await supabase
        .from("state_stay_rates")
        .update(update)
        .eq("state", r.state.toUpperCase());
      updated++;
    }

    logAudit({
      userId: user.id,
      action: "state_stay_rates.updated",
      entityType: "state_stay_rates",
      entityId: "bulk",
      newData: { count: updated },
    });

    return jsonResponse({ success: true, updated });
  } catch (error) {
    return errorResponse(error);
  }
}
