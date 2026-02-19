import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/auth/accept-terms
 * Accept terms of use. Any authenticated user.
 * Body: { terms_version?, location_consent, image_consent }
 * Upserts into user_consents table with user_id from auth,
 * sets terms_accepted_at and privacy_accepted_at to now().
 * Records IP and user-agent.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { terms_version, location_consent, image_consent } = body;

    if (typeof location_consent !== "boolean") {
      throw new AuthError(400, "location_consent (boolean) is required");
    }
    if (typeof image_consent !== "boolean") {
      throw new AuthError(400, "image_consent (boolean) is required");
    }

    const supabase = getAdminClient();
    const now = new Date().toISOString();
    const ipAddress = request.headers.get("x-forwarded-for") || null;
    const userAgent = request.headers.get("user-agent") || null;

    // Check if a consent record already exists for this user
    const { data: existing } = await supabase
      .from("user_consents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let result;

    const consentData: Record<string, unknown> = {
      location_consent,
      image_consent,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      updated_at: now,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    if (terms_version) {
      consentData.terms_version = terms_version;
    }

    if (existing) {
      // Update existing consent record
      const { data: updated, error } = await supabase
        .from("user_consents")
        .update(consentData)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error(
          `Failed to update consent for user ${user.id}: ${error.message}`
        );
        throw new Error(`Failed to update consent: ${error.message} | ${error.code} | ${error.details}`);
      }

      result = updated;
    } else {
      // Insert new consent record
      const { data: created, error } = await supabase
        .from("user_consents")
        .insert({
          user_id: user.id,
          ...consentData,
        })
        .select()
        .single();

      if (error) {
        console.error(
          `Failed to create consent for user ${user.id}: ${error.message}`
        );
        throw new Error(`Failed to create consent record: ${error.message} | ${error.code} | ${error.details}`);
      }

      result = created;
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "auth.terms_accepted",
      entityType: "user_consent",
      entityId: user.id,
      newData: {
        terms_version: terms_version || null,
        location_consent,
        image_consent,
      },
      ipAddress,
      userAgent,
    });

    return jsonResponse({
      message: "Terms accepted successfully",
      consent: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
