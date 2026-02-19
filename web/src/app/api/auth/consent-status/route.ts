import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/auth/consent-status
 * Check if current user has accepted terms.
 * Returns { has_accepted: boolean, consent: {...} | null }.
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

    if (!consent || !consent.terms_accepted) {
      return jsonResponse({
        has_accepted: false,
        consent: null,
      });
    }

    return jsonResponse({
      has_accepted: true,
      consent,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
