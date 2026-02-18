export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { randomUUID } from "crypto";

/**
 * POST /api/lgpd/anonymize/[userId]
 * Admin-only. Anonymizes a user's personal data.
 * Replaces PII with anonymous placeholders while preserving record integrity.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await authenticateRequest(request);
    checkRole(admin, ["admin"]);

    const { userId } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return jsonResponse({ message: "Invalid user ID format" }, 400);
    }

    const supabase = getAdminClient();

    // Verify user exists
    const { data: existing, error: findError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", userId)
      .single();

    if (findError || !existing) {
      return jsonResponse({ message: "User not found" }, 404);
    }

    const anonymizedEmail = `removed_${randomUUID()}@anon.com`;

    // Anonymize the profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: "Usuario Removido",
        email: anonymizedEmail,
        phone: null,
        cpf: null,
        rg: null,
        address: null,
        avatar_url: null,
        documents_urls: null,
        specialties: null,
        status: "inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (profileError) {
      console.error(
        `Failed to anonymize profile for user ${userId}: ${profileError.message}`
      );
      throw new Error("Failed to anonymize user data");
    }

    // Anonymize partner data if it exists
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (partnerData) {
      await supabase
        .from("partners")
        .update({
          contact_name: "Usuario Removido",
          contact_phone: null,
          contact_email: null,
          cnpj: null,
          address: null,
          notes: null,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    // Remove device tokens
    await supabase.from("device_tokens").delete().eq("user_id", userId);

    // Mark any pending LGPD requests as completed
    await supabase
      .from("lgpd_requests")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: admin.id,
      })
      .eq("user_id", userId)
      .eq("status", "pending");

    // Ban the user in Supabase Auth
    try {
      await supabase.auth.admin.updateUserById(userId, {
        email: anonymizedEmail,
        ban_duration: "none",
      });
    } catch (err) {
      console.warn(
        `Failed to update auth for anonymized user ${userId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Audit the anonymization
    logAudit({
      userId: admin.id,
      action: "lgpd.user_anonymized",
      entityType: "user",
      entityId: userId,
      oldData: {
        full_name: existing.full_name,
        email: existing.email,
      },
      newData: {
        full_name: "Usuario Removido",
        email: anonymizedEmail,
      },
      ipAddress: request.headers.get("x-forwarded-for") || null,
      userAgent: request.headers.get("user-agent") || null,
    });

    return jsonResponse({
      message: "User data anonymized successfully",
      user_id: userId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
