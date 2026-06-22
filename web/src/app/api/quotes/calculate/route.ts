import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { calculateQuote } from "@/lib/quotes/calculator";

/**
 * POST /api/quotes/calculate
 * Devolve preview do orcamento (deslocamento, estadia, horario especial,
 * total) ANTES de salvar. Util pra Step 4 da UI multi-step na loja parceira.
 *
 * Body:
 * {
 *   modality: 'reallliza' | 'homologados',
 *   items: [{ service_id, quantity }],
 *   service_address_zip?, service_address_city?, service_address_state?,
 *   service_address_street?, service_date?, service_time?,
 *   manual_total_amount?   // modalidade homologados
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const body = (await request.json()) as Record<string, unknown>;

    const modality = body.modality;
    if (modality !== "reallliza" && modality !== "homologados") {
      throw new AuthError(400, "modality precisa ser 'reallliza' ou 'homologados'");
    }

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    if (itemsRaw.length === 0) {
      throw new AuthError(400, "Informe ao menos 1 item");
    }

    type RawItem = { service_id?: string; quantity?: number };
    const serviceIds = itemsRaw
      .map((it) => (it as RawItem).service_id)
      .filter((v): v is string => typeof v === "string");

    const supabase = getAdminClient();
    const { data: services } = await supabase
      .from("services")
      .select("id, commercial_price, estimated_time_hours, unit, is_active")
      .in("id", serviceIds);

    type SvcRow = {
      id: string;
      commercial_price: number;
      estimated_time_hours: number;
      unit: string;
      is_active: boolean;
    };

    const items = itemsRaw.flatMap((rawIt) => {
      const it = rawIt as RawItem;
      const svc = (services as SvcRow[] | null)?.find((s) => s.id === it.service_id);
      if (!svc || !svc.is_active) return [];
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return [];
      return [
        {
          service_id: svc.id,
          quantity: qty,
          commercial_price: Number(svc.commercial_price),
          estimated_time_hours: Number(svc.estimated_time_hours),
          unit: svc.unit,
        },
      ];
    });

    if (items.length === 0) {
      throw new AuthError(400, "Nenhum item valido");
    }

    const result = await calculateQuote({
      modality,
      items,
      service_address_zip: (body.service_address_zip as string | undefined) ?? null,
      service_address_city:
        (body.service_address_city as string | undefined) ?? null,
      service_address_state:
        (body.service_address_state as string | undefined) ?? null,
      service_address_street:
        (body.service_address_street as string | undefined) ?? null,
      service_date: (body.service_date as string | undefined) ?? null,
      service_time: (body.service_time as string | undefined) ?? null,
      manual_total_amount:
        typeof body.manual_total_amount === "number"
          ? body.manual_total_amount
          : null,
    });

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
