export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/lgpd/consent
 * Authenticated. Returns the current user's consent records.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const { data: consent } = await supabase
      .from("user_consents")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!consent) {
      return jsonResponse({
        terms_accepted: false,
        privacy_accepted: false,
        marketing_accepted: false,
        accepted_at: null,
      });
    }

    return jsonResponse({
      terms_accepted: consent.terms_accepted ?? false,
      privacy_accepted: consent.privacy_accepted ?? false,
      marketing_accepted: consent.marketing_accepted ?? false,
      accepted_at: consent.accepted_at || consent.updated_at || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/lgpd/consent
 * Authenticated. Updates the current user's consent preferences.
 * Body: { terms_accepted?: boolean, privacy_accepted?: boolean, marketing_accepted?: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const body = await request.json();

    // Validate consent fields
    const allowedFields = [
      "terms_accepted",
      "privacy_accepted",
      "marketing_accepted",
    ];
    const consentUpdate: Record<string, boolean> = {};
    for (const field of allowedFields) {
      if (typeof body[field] === "boolean") {
        consentUpdate[field] = body[field];
      }
    }

    if (Object.keys(consentUpdate).length === 0) {
      return jsonResponse(
        {
          message:
            "At least one consent field is required: terms_accepted, privacy_accepted, marketing_accepted",
        },
        400
      );
    }

    const now = new Date().toISOString();

    // Check if a consent record already exists
    const { data: existing } = await supabase
      .from("user_consents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing record
      const { data: updated, error } = await supabase
        .from("user_consents")
        .update({
          ...consentUpdate,
          accepted_at: now,
          updated_at: now,
        })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error(
          `Failed to update consent for user ${user.id}: ${error.message}`
        );
        throw new Error("Failed to update consent");
      }

      result = updated;

      logAudit({
        userId: user.id,
        action: "lgpd.consent_updated",
        entityType: "user_consent",
        entityId: user.id,
        newData: consentUpdate as unknown as Record<string, unknown>,
        ipAddress: request.headers.get("x-forwarded-for") || null,
        userAgent: request.headers.get("user-agent") || null,
      });
    } else {
      // Create new consent record
      const { data: created, error } = await supabase
        .from("user_consents")
        .insert({
          user_id: user.id,
          terms_accepted: consentUpdate.terms_accepted ?? false,
          privacy_accepted: consentUpdate.privacy_accepted ?? false,
          marketing_accepted: consentUpdate.marketing_accepted ?? false,
          accepted_at: now,
        })
        .select()
        .single();

      if (error) {
        console.error(
          `Failed to create consent for user ${user.id}: ${error.message}`
        );
        throw new Error("Failed to create consent record");
      }

      result = created;

      logAudit({
        userId: user.id,
        action: "lgpd.consent_created",
        entityType: "user_consent",
        entityId: user.id,
        newData: consentUpdate as unknown as Record<string, unknown>,
        ipAddress: request.headers.get("x-forwarded-for") || null,
        userAgent: request.headers.get("user-agent") || null,
      });
    }

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
