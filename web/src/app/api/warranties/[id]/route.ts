import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError, type AuthUser } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Admin sempre; homologado só se for o `assigned_technician_id` de uma
 * garantia com `executor_type==='homologado'` (Jessica 16/07). Usada pelo
 * PATCH e pela rota de upload de fotos de solução — mesma regra nos dois
 * lugares, então mora aqui em vez de duplicada.
 */
export async function podeGerenciarGarantia(
  supabase: SupabaseClient,
  user: AuthUser,
  warrantyId: string
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role !== "technician") return false;
  const { data: w } = await supabase
    .from("warranties")
    .select("assigned_technician_id, executor_type")
    .eq("id", warrantyId)
    .maybeSingle();
  const wRow = w as
    | { assigned_technician_id?: string | null; executor_type?: string | null }
    | null;
  return (
    !!wRow &&
    wRow.executor_type === "homologado" &&
    wRow.assigned_technician_id === user.id
  );
}

/**
 * GET /api/warranties/[id] — detalhe.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranties")
      .select(
        "*, service_order:service_orders!warranties_service_order_id_fkey(id, order_number, title, client_name, completed_at, technician_id), opened_by_user:profiles!warranties_opened_by_fkey(full_name)"
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new AuthError(404, "Garantia nao encontrada");

    // Loja so ve as proprias
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const partnerId = (p as { id?: string } | null)?.id;
      if (partnerId !== (data as { partner_id: string }).partner_id) {
        throw new AuthError(403, "Sem permissao");
      }
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

function sanitizeMedia(arr: unknown) {
  if (!Array.isArray(arr)) return undefined;
  return arr
    .filter(
      (m): m is { url: string } =>
        !!m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string"
    )
    .map((m) => ({
      url: String((m as { url: string }).url),
      thumbnail_url: (m as { thumbnail_url?: string }).thumbnail_url ?? null,
      storage_path: (m as { storage_path?: string }).storage_path ?? null,
    }));
}

/**
 * PATCH /api/warranties/[id]
 * Admin atualiza status / notas / converte em OS de assistencia.
 *
 * Body: { status?, resolution_notes?, assistance_service_order_id?,
 *         resolution_photos?, resolution_videos? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    // Admin sempre; homologado apenas se for o assigned_technician_id (Jessica 16/07)
    if (!(await podeGerenciarGarantia(supabase, user, id))) {
      throw new AuthError(403, "Sem permissao pra alterar esta garantia");
    }

    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.status !== undefined) {
      const valid = ["open", "in_progress", "resolved", "rejected"];
      if (!valid.includes(body.status)) {
        throw new AuthError(400, "status invalido");
      }
      update.status = body.status;
      if (body.status === "resolved" || body.status === "rejected") {
        update.resolved_at = new Date().toISOString();
        update.resolved_by = user.id;
      }
    }
    if (body.resolution_notes !== undefined) {
      update.resolution_notes = body.resolution_notes
        ? String(body.resolution_notes).slice(0, 2000)
        : null;
    }
    if (body.assistance_service_order_id !== undefined) {
      update.assistance_service_order_id = body.assistance_service_order_id || null;
    }
    if (body.notes !== undefined) {
      update.notes = body.notes ? String(body.notes).slice(0, 1000) : null;
    }
    // Fotos/videos de solucao (Jose 27/08) — o app mobile manda por
    // POST /warranties/[id]/resolution-photos (multipart); isto aqui cobre
    // o fluxo web, que sobe pro Storage no cliente e so manda a URL.
    if (body.resolution_photos !== undefined) {
      update.resolution_photos = sanitizeMedia(body.resolution_photos) ?? [];
    }
    if (body.resolution_videos !== undefined) {
      update.resolution_videos = sanitizeMedia(body.resolution_videos) ?? [];
    }

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const { data, error } = await supabase
      .from("warranties")
      .update(update)
      .eq("id", id)
      .select("*, service_order:service_orders!warranties_service_order_id_fkey(order_number)")
      .single();

    if (error || !data) throw new Error("Falha ao atualizar garantia");

    logAudit({
      userId: user.id,
      action: "warranty.updated",
      entityType: "warranty",
      entityId: id,
      newData: update,
    });

    // Avisa a loja quando a garantia e' concluida (Jose 27/08) — fecha o
    // ciclo que ela pediu ("facilitar o acompanhamento pela loja").
    const w = data as {
      opened_by?: string | null;
      service_order_id: string;
      service_order?: { order_number?: number | null } | null;
    };
    if ((update.status === "resolved" || update.status === "rejected") && w.opened_by) {
      const { createNotification } = await import("@/lib/api-helpers/notifications");
      const titulo =
        update.status === "resolved" ? "Garantia resolvida" : "Garantia recusada";
      createNotification(
        w.opened_by,
        titulo,
        `A garantia da OS #${w.service_order?.order_number ?? ""} foi ${
          update.status === "resolved" ? "resolvida" : "recusada"
        }. Confira os detalhes.`,
        "warranty_resolved",
        { warranty_id: id, service_order_id: w.service_order_id },
        { priority: "high" }
      ).catch(() => {});
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
