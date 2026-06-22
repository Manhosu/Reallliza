import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/warranties
 * Lista garantias. Loja so ve as proprias; admin ve tudo.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    let query = supabase
      .from("warranties")
      .select(
        "*, service_order:service_orders(id, order_number, title, client_name, completed_at)"
      )
      .order("opened_at", { ascending: false });

    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const partnerId = (p as { id?: string } | null)?.id;
      if (!partnerId) throw new AuthError(404, "Parceiro nao encontrado");
      query = query.eq("partner_id", partnerId);
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status");
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new Error("Falha ao listar garantias");
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/warranties
 * Cria solicitacao de garantia. Loja (partner) ou admin.
 *
 * Body: { service_order_id, description, photos?: [{url, ...}], videos?: [...], notes? }
 *
 * Validacoes:
 *   - OS precisa existir, estar concluida, e ser do partner que abre
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json();

    if (!body.service_order_id || typeof body.service_order_id !== "string") {
      throw new AuthError(400, "service_order_id obrigatorio");
    }
    if (
      !body.description ||
      typeof body.description !== "string" ||
      body.description.trim().length < 10
    ) {
      throw new AuthError(400, "Descreva o problema com pelo menos 10 caracteres");
    }

    const supabase = getAdminClient();

    // Valida OS + permissao
    const { data: os } = await supabase
      .from("service_orders")
      .select("id, status, partner_id")
      .eq("id", body.service_order_id)
      .single();

    if (!os) throw new AuthError(404, "OS nao encontrada");

    const allowedStatus = ["completed", "approved", "invoiced"];
    if (!allowedStatus.includes((os as { status: string }).status)) {
      throw new AuthError(
        400,
        "So e possivel abrir garantia para OS concluida."
      );
    }

    let partnerId: string | null =
      ((os as { partner_id: string | null }).partner_id ?? null);
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const myPartner = (p as { id?: string } | null)?.id;
      if (!myPartner || myPartner !== partnerId) {
        throw new AuthError(
          403,
          "Voce nao pode abrir garantia para uma OS que nao e sua"
        );
      }
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    const sanitizeMedia = (arr: unknown) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(
          (m): m is { url: string } =>
            !!m &&
            typeof m === "object" &&
            typeof (m as { url?: unknown }).url === "string"
        )
        .map((m) => ({
          url: String((m as { url: string }).url),
          thumbnail_url: (m as { thumbnail_url?: string }).thumbnail_url ?? null,
          storage_path: (m as { storage_path?: string }).storage_path ?? null,
        }));
    };

    const { data: w, error } = await supabase
      .from("warranties")
      .insert({
        service_order_id: body.service_order_id,
        partner_id: partnerId,
        opened_by: user.id,
        status: "open",
        description: body.description.trim().slice(0, 2000),
        photos: sanitizeMedia(body.photos),
        videos: sanitizeMedia(body.videos),
        notes: body.notes ? String(body.notes).slice(0, 1000) : null,
      })
      .select()
      .single();

    if (error || !w) {
      console.error("Failed to create warranty:", error);
      throw new Error("Falha ao abrir garantia");
    }

    logAudit({
      userId: user.id,
      action: "warranty.opened",
      entityType: "warranty",
      entityId: (w as { id: string }).id,
      newData: {
        service_order_id: body.service_order_id,
        partner_id: partnerId,
      },
    });

    return jsonResponse(w, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
