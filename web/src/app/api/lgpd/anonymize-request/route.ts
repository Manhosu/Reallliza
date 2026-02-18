export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/lgpd/anonymize-request
 * Authenticated. Creates an anonymization request in the lgpd_requests table.
 * If a pending request already exists, returns the existing request ID.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    // Check if there is already a pending request for this user
    const { data: existingRequest } = await supabase
      .from("lgpd_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequest) {
      return jsonResponse({
        message: "An anonymization request is already pending",
        request_id: existingRequest.id,
      });
    }

    // Create the new request
    const { data: newRequest, error } = await supabase
      .from("lgpd_requests")
      .insert({
        user_id: user.id,
        type: "anonymization",
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to create anonymization request for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to create anonymization request");
    }

    // Audit the request
    logAudit({
      userId: user.id,
      action: "lgpd.anonymization_requested",
      entityType: "lgpd_request",
      entityId: newRequest.id,
      ipAddress: request.headers.get("x-forwarded-for") || null,
      userAgent: request.headers.get("user-agent") || null,
    });

    return jsonResponse(
      {
        message: "Anonymization request created successfully",
        request_id: newRequest.id,
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
