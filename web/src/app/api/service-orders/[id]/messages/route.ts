import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { dispatchTechMessageToGarantias } from "@/lib/api-helpers/dispatch-message";
import { createNotification } from "@/lib/api-helpers/notifications";
import { canTechnicianAccessOs, getTeamMemberIds } from "@/lib/api-helpers/team-scope";

type Channel = "interno" | "loja";

/**
 * Mapeia o role do usuário logado pro `sender_role` da mensagem.
 * Mantém os mesmos rótulos que o Garantias usa em `ticket_messages.remetente_tipo`.
 */
function senderRoleFromUserRole(role: string): "TECNICO" | "OPERADOR" | "PARTNER" {
  if (role === "technician") return "TECNICO";
  if (role === "partner") return "PARTNER";
  return "OPERADOR"; // admin | manager
}

/**
 * Resolve a OS + checa permissão + classifica quem é quem em relação a ela.
 *
 * Jessica 31/08: o botão "Conversar" da loja abria o MESMO chat que a
 * Reallliza usa com o técnico — sem separação, a loja veria qualquer coisa
 * que a equipe interna discutisse ali. Ela confirmou: a Reallliza continua
 * vendo tudo (supervisão), a loja só vê a própria conversa com o
 * homologado. Daqui pra baixo, cada mensagem pertence a um `channel`:
 * 'interno' (Reallliza↔executor) ou 'loja' (loja↔executor).
 *
 * `isExecutor` cobre técnico OU parceiro que aceitou a OS via broadcast —
 * canTechnicianAccessOs só confere IDs, não exige role="technician"
 * (mesmo ajuste feito nas outras rotas de OS em 31/08).
 */
async function loadAuthorizedOrder(
  request: NextRequest,
  orderId: string
) {
  const user = await authenticateRequest(request);
  const supabase = getAdminClient();

  const { data: order, error } = await supabase
    .from("service_orders")
    .select(
      "id, order_number, technician_id, team_id, partner_id, created_by, status, title, external_callback_url"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new AuthError(404, "Service order not found");
  }

  const isExecutor = await canTechnicianAccessOs(supabase, user.id, order);

  let isLojaClient = false;
  if (user.role === "partner") {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    isLojaClient = !!partnerData && order.partner_id === partnerData.id;
  }

  const isStaff = user.role !== "technician" && user.role !== "partner";

  if (!isExecutor && !isLojaClient && !isStaff) {
    throw new AuthError(403, "You do not have permission to view this service order");
  }

  return { user, supabase, order, isExecutor, isLojaClient, isStaff };
}

/**
 * GET /api/service-orders/[id]/messages?channel=interno|loja
 *
 * Lista as mensagens da OS, mais antigas primeiro.
 * - Loja: sempre só o canal 'loja', ignora qualquer `channel` pedido —
 *   nunca é o cliente quem decide o que ele pode ver.
 * - Staff/executor: filtra pelo `channel` pedido; sem parâmetro, devolve os
 *   dois (supervisão da Reallliza precisa enxergar tudo de uma vez).
 *
 * Ao mesmo tempo marca como lidas as mensagens que o usuário ainda não viu
 * (todas exceto as próprias). Idempotente — só atualiza onde `read_at IS NULL`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase, order, isLojaClient } = await loadAuthorizedOrder(request, id);

    const channelParam = request.nextUrl.searchParams.get("channel");

    let query = supabase
      .from("os_messages")
      .select(
        "id, service_order_id, sender_user_id, sender_role, sender_name, content, attachment_url, attachment_type, external_message_id, read_at, created_at, channel"
      )
      .eq("service_order_id", order.id);

    if (isLojaClient) {
      query = query.eq("channel", "loja");
    } else if (channelParam === "interno" || channelParam === "loja") {
      query = query.eq("channel", channelParam);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      console.error(`Failed to load os_messages: ${error.message}`);
      throw new Error("Failed to load messages");
    }

    // Marca como lidas as mensagens dos outros (fire-and-forget). So' do
    // mesmo escopo de canal que a leitura, senao marcar "lido" numa consulta
    // filtrada apagaria o nao-lido de um canal que a pessoa nem abriu.
    let marcarLidas = supabase
      .from("os_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("service_order_id", order.id)
      .is("read_at", null)
      .neq("sender_user_id", user.id);
    if (isLojaClient) {
      marcarLidas = marcarLidas.eq("channel", "loja");
    } else if (channelParam === "interno" || channelParam === "loja") {
      marcarLidas = marcarLidas.eq("channel", channelParam);
    }
    marcarLidas.then(({ error: markErr }) => {
      if (markErr) {
        console.warn(`Mark-as-read failed: ${markErr.message}`);
      }
    });

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-orders/[id]/messages
 *
 * Body: { content: string, attachment_url?: string, attachment_type?: string, channel?: 'interno'|'loja' }
 *
 * Insere a mensagem em `os_messages`, dispara webhook reverso pra Garantias
 * (sempre — o callback dedupa do outro lado) e gera notificação pro
 * "outro lado" da conversa NAQUELE canal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase, order, isExecutor, isLojaClient } = await loadAuthorizedOrder(request, id);

    const body = (await request.json()) as {
      content?: string;
      attachment_url?: string;
      attachment_type?: string;
      channel?: string;
    };

    const content = (body.content || "").trim();
    if (!content) {
      throw new AuthError(400, "content is required");
    }

    // A loja so' fala no proprio canal, nunca decide entrar no interno —
    // igual na leitura, o pedido do cliente nunca e' a fonte da verdade.
    const channel: Channel = isLojaClient
      ? "loja"
      : body.channel === "loja"
        ? "loja"
        : "interno";

    const senderRole = senderRoleFromUserRole(user.role);

    const { data: msg, error: insertErr } = await supabase
      .from("os_messages")
      .insert({
        service_order_id: order.id,
        sender_user_id: user.id,
        sender_role: senderRole,
        sender_name: user.full_name || user.email || "Usuário",
        content,
        attachment_url: body.attachment_url || null,
        attachment_type: body.attachment_type || null,
        external_message_id: null,
        channel,
      })
      .select(
        "id, service_order_id, sender_user_id, sender_role, sender_name, content, attachment_url, attachment_type, external_message_id, read_at, created_at, channel"
      )
      .single();

    if (insertErr || !msg) {
      console.error(`Failed to insert os_messages: ${insertErr?.message}`);
      throw new Error("Failed to insert message");
    }

    logAudit({
      userId: user.id,
      action: "os_message.sent",
      entityType: "os_message",
      entityId: msg.id,
      newData: {
        service_order_id: order.id,
        sender_role: senderRole,
        channel,
      },
    });

    // Webhook reverso Execução → Garantias. Na Vercel, o runtime
    // pode encerrar a Lambda no return e perder Promises não-aguardadas;
    // awaitamos pra garantir que pelo menos o `webhook_events` é gravado
    // (entrega ao Garantias tem retry cron de 5min se falhar).
    if (order.external_callback_url) {
      try {
        await dispatchTechMessageToGarantias({
          service_order_id: order.id,
          message_id: msg.id,
          sender_role: senderRole,
          sender_name: msg.sender_name,
          content: msg.content,
          attachment_url: msg.attachment_url,
          attachment_type: msg.attachment_type,
          created_at: msg.created_at,
        });
      } catch (err) {
        console.error("dispatchTechMessageToGarantias failed:", err);
      }
    }

    // Notifica o "outro lado" DAQUELE canal (com push + priority). Awaitamos
    // pra garantir o INSERT em `notifications` antes do return.
    let recipientIds: string[] = [];
    if (channel === "loja") {
      if (isLojaClient) {
        // Loja mandou -> avisa o executor.
        if (order.technician_id) recipientIds = [order.technician_id];
      } else if (isExecutor && order.partner_id) {
        // Executor mandou -> avisa quem é o usuário da loja dona da OS.
        const { data: partnerRow } = await supabase
          .from("partners")
          .select("user_id")
          .eq("id", order.partner_id)
          .maybeSingle();
        if (partnerRow?.user_id) recipientIds = [partnerRow.user_id];
      }
    } else {
      // Canal interno — mesma lógica de sempre: executor fala com quem
      // criou a OS; staff fala com o executor (direto ou via equipe, pra OS
      // auto-atribuída sem um único "técnico").
      if (isExecutor) {
        recipientIds = order.created_by ? [order.created_by] : [];
      } else if (order.technician_id) {
        recipientIds = [order.technician_id];
      } else if (order.team_id) {
        recipientIds = await getTeamMemberIds(supabase, order.team_id);
      }
    }

    for (const recipientId of new Set(recipientIds)) {
      if (!recipientId || recipientId === user.id) continue;
      try {
        await createNotification(
          recipientId,
          `Nova mensagem na OS #${order.order_number ?? ""}`.trim(),
          content.slice(0, 120),
          "message_received",
          {
            service_order_id: order.id,
            message_id: msg.id,
            sender_role: senderRole,
            channel,
          },
          { priority: "high" }
        );
      } catch (err) {
        console.warn("Notification dispatch failed:", err);
      }
    }

    return jsonResponse(msg, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
