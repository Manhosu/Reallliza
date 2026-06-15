import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createScheduleFromOs } from "@/lib/api-helpers/schedules";

/**
 * POST /api/proposals/[id]/respond
 * Aceitar/recusar uma proposta.
 *
 * 2 modos:
 * - Direta: a proposta tem partner_id; só o user dono daquele partner pode responder.
 * - Broadcast: partner_id IS NULL; qualquer technician/partner ativo da
 *   região alvo pode responder. Primeiro a aceitar fica com a OS e as
 *   demais propostas pendentes do mesmo service_order_id são expiradas.
 *
 * Body: { action: 'accept' | 'reject', response_message? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json();
    const { action, response_message } = body;

    if (!action || !["accept", "reject"].includes(action)) {
      throw new AuthError(
        400,
        "action is required and must be 'accept' or 'reject'"
      );
    }

    const supabase = getAdminClient();

    const { data: proposal, error: findError } = await supabase
      .from("service_proposals")
      .select(
        "*, partner:partners!service_proposals_partner_id_fkey(id, user_id, company_name)"
      )
      .eq("id", id)
      .single();

    if (findError || !proposal) {
      throw new AuthError(404, `Proposal with ID ${id} not found`);
    }

    const isBroadcast = !proposal.partner_id;

    // Permissão
    if (isBroadcast) {
      // Qualquer technician/partner ativo
      if (!["technician", "partner"].includes(user.role)) {
        throw new AuthError(
          403,
          "Apenas técnicos ou parceiros podem responder propostas em broadcast"
        );
      }

      // Verifica região se proposta tem target_state
      if (proposal.target_state) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("operating_region")
          .eq("id", user.id)
          .maybeSingle();
        const region = (profileData?.operating_region || "").toUpperCase();
        if (region && !region.includes(proposal.target_state)) {
          throw new AuthError(
            403,
            `Esta proposta é para a região ${proposal.target_state} — sua região é ${profileData?.operating_region || "não informada"}`
          );
        }
      }
    } else {
      // Direta: só o partner dono
      if (!proposal.partner || proposal.partner.user_id !== user.id) {
        throw new AuthError(
          403,
          "You do not have permission to respond to this proposal"
        );
      }
    }

    if (proposal.status !== "pending") {
      throw new AuthError(
        400,
        `Cannot respond to a proposal with status '${proposal.status}'. Only pending proposals can be responded to.`
      );
    }

    const now = new Date().toISOString();
    const newStatus = action === "accept" ? "accepted" : "rejected";

    const updateData: Record<string, unknown> = {
      status: newStatus,
      responded_at: now,
      updated_at: now,
    };
    if (response_message) updateData.response_message = response_message;
    if (action === "accept") updateData.accepted_by = user.id;

    // Para broadcast: garante atomicidade — só atualiza se ainda for pending.
    // Se outro técnico aceitou primeiro (race), `eq("status","pending")` falha.
    let updatedProposal: Record<string, unknown> | null = null;
    if (isBroadcast && action === "accept") {
      const { data, error } = await supabase
        .from("service_proposals")
        .update(updateData)
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .maybeSingle();
      if (error) {
        console.error(`Failed to lock-accept proposal: ${error.message}`);
        throw new Error("Falha ao aceitar proposta");
      }
      if (!data) {
        throw new AuthError(
          409,
          "Outro profissional aceitou esta proposta primeiro"
        );
      }
      updatedProposal = data;
    } else {
      const { data, error } = await supabase
        .from("service_proposals")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error(`Failed to update proposal ${id}: ${error.message}`);
        throw new Error("Failed to respond to proposal");
      }
      updatedProposal = data;
    }

    // Se aceitou, associa à OS.
    // Jessica 14/06: ao aceitar uma proposta DIRETA, o código antigo só
    // setava partner_id e a OS ficava em status 'pending', sem
    // technician_id — daí a aba "Serviços" do parceiro ficava sem o
    // botão "Iniciar Deslocamento" e nada acontecia. Agora os dois
    // modos (direto e broadcast) caem no mesmo fluxo: technician_id
    // = quem aceitou, status = 'assigned', e o resto (histórico de
    // status, agenda automática) acontece igual.
    if (action === "accept") {
      const soUpdate: Record<string, unknown> = {
        updated_at: now,
        technician_id: user.id,
        status: "assigned",
      };
      // Direta: marca também o partner_id pra preservar a empresa do
      // contrato; broadcast não tem partner.
      if (!isBroadcast && proposal.partner_id) {
        soUpdate.partner_id = proposal.partner_id;
      }

      const { error: soUpdateError } = await supabase
        .from("service_orders")
        .update(soUpdate)
        .eq("id", proposal.service_order_id);

      if (soUpdateError) {
        console.error(
          `Failed to associate proposal to service order: ${soUpdateError.message}`
        );
      }

      // Para broadcast: expira outras propostas pendentes da mesma OS.
      if (isBroadcast) {
        await supabase
          .from("service_proposals")
          .update({ status: "expired", updated_at: now })
          .eq("service_order_id", proposal.service_order_id)
          .eq("status", "pending")
          .neq("id", id);
      }

      // Histórico de status da OS (vale pros dois modos).
      const noteSuffix = isBroadcast
        ? `Proposta broadcast aceita por ${user.full_name || user.email}`
        : `Proposta aceita por ${user.full_name || user.email} (parceiro)`;
      await supabase.from("os_status_history").insert({
        service_order_id: proposal.service_order_id,
        from_status: "pending",
        to_status: "assigned",
        changed_by: user.id,
        notes: noteSuffix,
      });

      // Bloco 7 (01/06) — proposta aceita também cria agenda automática
      // pro técnico que aceitou. Vale pros dois modos. Conflito não
      // aborta (a aceitação já foi gravada), só loga — agenda nesse
      // caso fica pra ajuste manual.
      try {
        const result = await createScheduleFromOs(
          supabase,
          proposal.service_order_id,
          user.id,
          "proposal_accepted"
        );
        if (result.outcome === "conflict") {
          console.warn(
            `proposal-accepted: schedule conflict for tech ${user.id}: ${result.conflict_message}`
          );
        }
      } catch (err) {
        console.warn("auto-schedule on proposal accept failed:", err);
      }
    }

    logAudit({
      userId: user.id,
      action: `proposal.${newStatus}${isBroadcast ? ".broadcast" : ""}`,
      entityType: "proposal",
      entityId: id,
      oldData: { status: "pending" },
      newData: {
        status: newStatus,
        response_message: response_message || null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(updatedProposal);
  } catch (error) {
    return errorResponse(error);
  }
}
