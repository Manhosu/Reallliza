import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";
import { createScheduleFromOs } from "@/lib/api-helpers/schedules";
import { redactOsForRole } from "@/lib/api-helpers/redact";

/**
 * GET /api/service-orders/[id]
 * Get a single service order by ID with related data:
 * partner name, technician name, creator info, photos count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: order, error } = await supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url, specialties),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name, contact_phone, contact_email),
        creator:profiles!service_orders_created_by_fkey(id, full_name, email)
      `
      )
      .eq("id", id)
      .single();

    if (error || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Role-based access: technicians can only see their own orders
    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "You do not have permission to view this service order");
    }

    // Partners: ve OS atribuida ao seu partner_id OU OS que ele assumiu
    // como tecnico via broadcast (technician_id = user.id). Mesmo motivo
    // do filtro do listing — propostas broadcast nao tem partner_id.
    if (user.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      const ownsAsTechnician = order.technician_id === user.id;
      const ownsAsPartner =
        !!partnerData && order.partner_id === partnerData.id;

      if (!ownsAsTechnician && !ownsAsPartner) {
        throw new AuthError(403, "You do not have permission to view this service order");
      }
    }

    // Get photos count
    const { count: photosCount } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("service_order_id", id);

    // Get latest status history entries
    const { data: statusHistory } = await supabase
      .from("os_status_history")
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name)
      `
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Itens (produtos/servicos) - visiveis para admin/manager/technician designado
    const { data: items } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", id)
      .order("position", { ascending: true });

    // Parcelas - apenas admin/manager
    let payments: unknown[] = [];
    if (user.role === "admin" || user.role === "manager") {
      const { data: paymentsData } = await supabase
        .from("service_order_payments")
        .select("*")
        .eq("service_order_id", id)
        .order("position", { ascending: true });
      payments = paymentsData || [];
    }

    // Loja nao pode ver valores (Jessica 10/07) — server-side redaction
    const payload = redactOsForRole(
      {
        ...order,
        photos_count: photosCount || 0,
        status_history: statusHistory || [],
        items: items || [],
        payments,
      } as Record<string, unknown>,
      user.role
    );

    return jsonResponse(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/service-orders/[id]
 * Update an existing service order.
 * Admin/manager can update all fields. Technicians can update limited fields
 * (notes, metadata). Does not allow status changes (use PATCH /status).
 * Does not allow updating completed or cancelled orders.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    // Jessica 10/07: loja e' read-only na OS
    checkRole(user, [
      "admin",
      "manager",
      "gestor",
      "diretor",
      "supervisor",
      "operador",
      "technician",
    ]);
    const { id } = await params;

    const body = await request.json();

    const supabase = getAdminClient();

    // Verify the order exists and get current data for audit
    const { data: existing, error: findError } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Don't allow updates to completed or cancelled orders
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new AuthError(
        400,
        `Cannot update a service order with status: ${existing.status}`
      );
    }

    // Determine allowed fields based on role
    let updatePayload: Record<string, unknown> = {};

    if (user.role === "admin" || user.role === "manager") {
      // Admin/manager can update most fields
      const allowedFields = [
        "title",
        "description",
        "priority",
        "client_name",
        "client_phone",
        "client_email",
        "client_document",
        "address_street",
        "address_number",
        "address_complement",
        "address_neighborhood",
        "address_city",
        "address_state",
        "address_zip",
        "geo_lat",
        "geo_lng",
        "partner_id",
        "technician_id",
        "scheduled_date",
        "estimated_value",
        "notes",
        "metadata",
        // Modelo Cenize
        "historico",
        "client_contact_name",
        "client_rg_ie",
        "previsao_conclusao",
        "acrescimo",
        "desconto",
        "vale_troca",
        // Termo de conclusão (admin define texto customizado por OS)
        "completion_terms",
        // Template de execução escolhido pelo operador
        "step_template_group_id",
      ];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updatePayload[field] = body[field];
        }
      }
    } else if (user.role === "technician" || user.role === "partner") {
      // Operador (tecnico ou parceiro que assumiu via broadcast): so pode
      // atualizar um conjunto limitado de campos relacionados a execucao.
      let partnerOwnId: string | null = null;
      if (user.role === "partner") {
        const { data: pd } = await supabase
          .from("partners")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        partnerOwnId = pd?.id ?? null;
      }
      const okAsTech = existing.technician_id === user.id;
      const okAsPartner =
        !!partnerOwnId && (existing as { partner_id?: string | null }).partner_id === partnerOwnId;
      if (!okAsTech && !okAsPartner) {
        throw new AuthError(403, "You do not have permission to update this service order");
      }

      const techAllowedFields = [
        "notes",
        "metadata",
        // Aceite do termo + assinatura mobile
        "terms_accepted_text",
        "terms_accepted_at",
      ];
      for (const field of techAllowedFields) {
        if (body[field] !== undefined) {
          updatePayload[field] = body[field];
        }
      }
    } else {
      checkRole(user, ["admin", "manager", "technician"]);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    updatePayload.updated_at = new Date().toISOString();

    // Build update query
    let query = supabase
      .from("service_orders")
      .update(updatePayload)
      .eq("id", id);

    // Optimistic locking: only update if version matches
    if (body.version !== undefined) {
      query = query.eq("version", body.version);
    }

    const { data: order, error } = await query.select().single();

    if (error) {
      // PGRST116 = version mismatch (0 rows returned)
      if (body.version !== undefined && error.code === "PGRST116") {
        throw new AuthError(
          409,
          "Dados desatualizados. Recarregue a pagina e tente novamente."
        );
      }
      console.error(`Failed to update service order ${id}: ${error.message}`);
      throw new Error("Failed to update service order");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "service_order.updated",
      entityType: "service_order",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: order as Record<string, unknown>,
    });

    // Reatribuição → notifica o NOVO técnico (URGENT, aciona som Realliza).
    // Await porque na Vercel o fire-and-forget pode perder o INSERT.
    const oldTech = existing.technician_id as string | null;
    const newTech = (order as { technician_id: string | null }).technician_id;
    if (newTech && newTech !== oldTech) {
      try {
        await createNotification(
          newTech,
          oldTech ? "OS reatribuída para você" : "Nova OS atribuída",
          `OS #${(order as { order_number: number | null }).order_number ?? ""} — ${(order as { title: string }).title}`,
          "os_assigned",
          { service_order_id: id, order_number: (order as { order_number: number | null }).order_number },
          { priority: "urgent" }
        );
      } catch (err) {
        console.warn("os_assigned notify failed:", err);
      }

      // Cria automaticamente o evento na agenda do técnico
      // (Bloco 7 — pedido da Jessica 01/06). Se houver conflito de horário,
      // devolvemos 409 e o admin escolhe outro horário/técnico.
      try {
        const result = await createScheduleFromOs(
          supabase,
          id,
          newTech,
          "os_assignment"
        );
        if (result.outcome === "conflict") {
          throw new AuthError(
            409,
            result.conflict_message ??
              "Conflito de agenda para este técnico no horário escolhido."
          );
        }
      } catch (err) {
        if (err instanceof AuthError) throw err;
        console.warn("auto-schedule on assignment failed:", err);
      }
    }

    return jsonResponse(order);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/service-orders/[id]
 * Apaga uma OS e seus filhos (executions, history, messages, items, payments).
 * Admin/manager apaga qualquer OS; partner só apaga as próprias.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(_request);
    // Jessica 10/07: loja e' read-only na OS — nao pode deletar
    checkRole(user, ["admin", "manager", "gestor", "diretor"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from("service_orders")
      .select("id, partner_id, created_by, title, status")
      .eq("id", id)
      .single();

    if (fetchErr || !order) {
      throw new AuthError(404, "OS não encontrada");
    }

    // Partner só apaga OS da loja dele (ou criada por ele)
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();
      const ownsByPartner = !!p?.id && order.partner_id === p.id;
      const ownsByCreator = order.created_by === user.id;
      if (!ownsByPartner && !ownsByCreator) {
        throw new AuthError(403, "Você só pode apagar OS da sua loja.");
      }
    }

    // Apaga filhos. Erros silenciosos em tabelas que possam não existir
    // em todos os ambientes.
    await supabase.from("os_step_executions").delete().eq("service_order_id", id);
    await supabase.from("os_status_history").delete().eq("service_order_id", id);
    await supabase.from("os_messages").delete().eq("service_order_id", id);
    await supabase
      .from("service_order_items")
      .delete()
      .eq("service_order_id", id)
      .then(
        () => {},
        () => {}
      );
    await supabase
      .from("service_order_payments")
      .delete()
      .eq("service_order_id", id)
      .then(
        () => {},
        () => {}
      );

    const { error: delErr } = await supabase
      .from("service_orders")
      .delete()
      .eq("id", id);
    if (delErr) {
      console.error(`Failed to delete service order ${id}: ${delErr.message}`);
      throw new Error("Falha ao excluir OS");
    }

    logAudit({
      userId: user.id,
      action: "service_order.deleted",
      entityType: "service_order",
      entityId: id,
      oldData: order as Record<string, unknown>,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
