import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/proposals/[id]/respond
 * Partner responds to a proposal.
 * Body: { action: 'accept' | 'reject', response_message? }
 * Only the partner who received the proposal can respond.
 * If accept: update proposal status to 'accepted', set responded_at,
 *   associate partner to the service_order (update partner_id).
 * If reject: update status to 'rejected', set responded_at.
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

    // Get the proposal
    const { data: proposal, error: findError } = await supabase
      .from("service_proposals")
      .select("*, partner:partners!service_proposals_partner_id_fkey(id, user_id, company_name)")
      .eq("id", id)
      .single();

    if (findError || !proposal) {
      throw new AuthError(404, `Proposal with ID ${id} not found`);
    }

    // Only the partner who received the proposal can respond
    if (!proposal.partner || proposal.partner.user_id !== user.id) {
      throw new AuthError(
        403,
        "You do not have permission to respond to this proposal"
      );
    }

    // Proposal must be in 'pending' status to respond
    if (proposal.status !== "pending") {
      throw new AuthError(
        400,
        `Cannot respond to a proposal with status '${proposal.status}'. Only pending proposals can be responded to.`
      );
    }

    const now = new Date().toISOString();
    const newStatus = action === "accept" ? "accepted" : "rejected";

    // Update proposal
    const updateData: Record<string, unknown> = {
      status: newStatus,
      responded_at: now,
      updated_at: now,
    };

    if (response_message) {
      updateData.response_message = response_message;
    }

    const { data: updatedProposal, error: updateError } = await supabase
      .from("service_proposals")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error(
        `Failed to update proposal ${id}: ${updateError.message}`
      );
      throw new Error("Failed to respond to proposal");
    }

    // If accepted, associate partner to the service order
    if (action === "accept") {
      const { error: soUpdateError } = await supabase
        .from("service_orders")
        .update({
          partner_id: proposal.partner_id,
          updated_at: now,
        })
        .eq("id", proposal.service_order_id);

      if (soUpdateError) {
        console.error(
          `Failed to associate partner to service order: ${soUpdateError.message}`
        );
      }
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: `proposal.${newStatus}`,
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
