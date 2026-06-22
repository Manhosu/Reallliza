import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/company-settings — singleton com config global (admin + auth).
 * PATCH — atualiza (admin only).
 *
 * Quando lat/lng nao vem no payload mas base_address foi alterado, faz
 * geocode automatico via Google (ou AwesomeAPI fallback se for endereço
 * com CEP detectavel).
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .single();
    if (error) throw new Error("Falha ao carregar company_settings");
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const update: Record<string, unknown> = {};

    if (body.base_address !== undefined) update.base_address = String(body.base_address).slice(0, 500);
    if (body.base_state !== undefined)
      update.base_state = body.base_state ? String(body.base_state).toUpperCase().slice(0, 2) : null;
    if (body.base_lat !== undefined) update.base_lat = body.base_lat === null ? null : Number(body.base_lat);
    if (body.base_lng !== undefined) update.base_lng = body.base_lng === null ? null : Number(body.base_lng);

    const num = (v: unknown, def: number, min: number, max: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return def;
      return Math.max(min, Math.min(max, n));
    };

    if (body.price_per_km !== undefined) update.price_per_km = num(body.price_per_km, 1.5, 0, 1000);
    if (body.special_hour_multiplier !== undefined)
      update.special_hour_multiplier = num(body.special_hour_multiplier, 1.25, 1, 3);
    if (body.platform_fee_pct !== undefined)
      update.platform_fee_pct = num(body.platform_fee_pct, 10, 0, 100);
    if (body.business_hour_start !== undefined)
      update.business_hour_start = String(body.business_hour_start).slice(0, 8);
    if (body.business_hour_end !== undefined)
      update.business_hour_end = String(body.business_hour_end).slice(0, 8);

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const supabase = getAdminClient();

    // Geocode automatico se mudou endereco e nao recebeu lat/lng explicitos
    if (
      typeof update.base_address === "string" &&
      update.base_lat === undefined &&
      update.base_lng === undefined
    ) {
      const { geocodeAddress } = await import("@/lib/quotes/geocode");
      const geo = await geocodeAddress({
        street: update.base_address as string,
        state: (update.base_state as string | undefined) ?? null,
      });
      if (geo) {
        update.base_lat = geo.lat;
        update.base_lng = geo.lng;
      }
    }

    const { data, error } = await supabase
      .from("company_settings")
      .update(update)
      .eq("is_singleton", true)
      .select()
      .single();

    if (error) throw new Error("Falha ao atualizar configuracoes globais");

    logAudit({
      userId: user.id,
      action: "company_settings.updated",
      entityType: "company_settings",
      entityId: (data as { id: string }).id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
