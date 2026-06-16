import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const GPS_ARRIVAL_RADIUS_METERS = 300;

/** Haversine — distance in meters between two lat/lng points. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * PATCH /api/service-orders/[id]/arrived
 * Registra a chegada do técnico no local da OS.
 *
 * Body: { lat?, lng?, notes?, force_override? }
 *  - Exige status = 'in_progress' (técnico já iniciou deslocamento).
 *  - Idempotente: se já tem arrived_at, retorna sem regravar.
 *  - Valida raio GPS (300m) quando lat/lng fornecidos E a OS tem
 *    geo_lat/geo_lng. force_override=true pula a checagem.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const lat =
      typeof body.lat === "number" && Number.isFinite(body.lat)
        ? body.lat
        : undefined;
    const lng =
      typeof body.lng === "number" && Number.isFinite(body.lng)
        ? body.lng
        : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const forceOverride = body.force_override === true;

    const supabase = getAdminClient();

    const { data: order, error: findError } = await supabase
      .from("service_orders")
      .select(
        "id, status, order_number, technician_id, partner_id, arrived_at, geo_lat, geo_lng"
      )
      .eq("id", id)
      .single();

    if (findError || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Permissao: tecnico OU parceiro que aceitou a OS (broadcast/direta).
    // Antes so olhava technician_id pra role=technician — parceiro role
    // aceitando broadcast ficava sem permissao.
    if (user.role === "technician" || user.role === "partner") {
      let partnerOwnId: string | null = null;
      if (user.role === "partner") {
        const { data: pd } = await supabase
          .from("partners")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        partnerOwnId = pd?.id ?? null;
      }
      const okAsTech = order.technician_id === user.id;
      const okAsPartner =
        !!partnerOwnId && (order as { partner_id?: string | null }).partner_id === partnerOwnId;
      if (!okAsTech && !okAsPartner) {
        throw new AuthError(
          403,
          "Voce nao tem permissao para registrar chegada nesta OS"
        );
      }
    }

    if (order.status !== "in_progress") {
      throw new AuthError(
        400,
        `Só é possível marcar chegada quando a OS está em deslocamento (status atual: ${order.status}). Inicie o deslocamento antes.`
      );
    }

    // Idempotência: já marcou → devolve o estado atual.
    if (order.arrived_at) {
      return jsonResponse({ order, already_arrived: true });
    }

    // Validação de raio (300m) quando temos coords da OS + GPS do técnico.
    if (
      !forceOverride &&
      lat !== undefined &&
      lng !== undefined &&
      typeof order.geo_lat === "number" &&
      typeof order.geo_lng === "number"
    ) {
      const distance = haversineMeters(lat, lng, order.geo_lat, order.geo_lng);
      if (distance > GPS_ARRIVAL_RADIUS_METERS) {
        throw new AuthError(
          400,
          `Você está a ${Math.round(distance)}m do local. É necessário estar a menos de ${GPS_ARRIVAL_RADIUS_METERS}m para registrar chegada. Caso o GPS esteja impreciso, confirme mesmo assim.`
        );
      }
    }

    const arrivedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("service_orders")
      .update({
        arrived_at: arrivedAt,
        arrival_geo_lat: lat ?? null,
        arrival_geo_lng: lng ?? null,
        updated_at: arrivedAt,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to mark arrival:", updateError);
      throw new AuthError(500, "Falha ao registrar chegada");
    }

    logAudit({
      userId: user.id,
      action: "service_order.arrived",
      entityType: "service_order",
      entityId: id,
      newData: {
        order_number: order.order_number,
        arrived_at: arrivedAt,
        lat,
        lng,
        notes,
        force_override: forceOverride,
      },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
