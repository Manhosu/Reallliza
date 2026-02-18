import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/partners
 * List partners with pagination and filters.
 * Accessible by: admin, manager
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const supabase = getAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from("partners")
      .select(
        `
        *,
        user:profiles!partners_user_id_fkey(id, full_name, email, phone, avatar_url)
      `,
        { count: "exact" }
      );

    // Filter by active status
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    // Search across company_name, trading_name, contact_name, cnpj
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,trading_name.ilike.%${search}%,contact_name.ilike.%${search}%,cnpj.ilike.%${search}%`
      );
    }

    // Pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch partners: ${error.message}`);
      return jsonResponse({ message: "Failed to fetch partners" }, 500);
    }

    return jsonResponse({
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/partners
 * Create a new partner.
 * Accessible by: admin only
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const {
      company_name,
      contact_name,
      cnpj,
      trading_name,
      contact_phone,
      contact_email,
      notes,
      address,
      user_id,
    } = body;

    if (!company_name || !contact_name) {
      return jsonResponse(
        { message: "company_name and contact_name are required" },
        400
      );
    }

    const supabase = getAdminClient();

    // If user_id is provided, verify the user exists and has role 'partner'
    if (user_id) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user_id)
        .single();

      if (profileError || !profile) {
        return jsonResponse(
          { message: `User with ID ${user_id} not found` },
          400
        );
      }

      if (profile.role !== "partner") {
        return jsonResponse(
          { message: `User with ID ${user_id} does not have the 'partner' role` },
          400
        );
      }

      // Check if a partner record already exists for this user
      const { data: existingPartner } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user_id)
        .single();

      if (existingPartner) {
        return jsonResponse(
          { message: `A partner record already exists for user ${user_id}` },
          400
        );
      }
    }

    // Build insert data
    const insertData: Record<string, unknown> = {
      company_name,
      contact_name,
      is_active: true,
    };
    if (cnpj) insertData.cnpj = cnpj;
    if (trading_name) insertData.trading_name = trading_name;
    if (contact_phone) insertData.contact_phone = contact_phone;
    if (contact_email) insertData.contact_email = contact_email;
    if (notes) insertData.notes = notes;

    // Handle address
    if (address) {
      insertData.address =
        typeof address === "string" ? { full_address: address } : address;
    }

    // Handle user_id: if not provided, try to find partner user by contact_email
    if (user_id) {
      insertData.user_id = user_id;
    } else if (contact_email) {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", contact_email)
        .eq("role", "partner")
        .single();

      if (userProfile) {
        insertData.user_id = userProfile.id;
      }
    }

    // user_id is required by the database
    if (!insertData.user_id) {
      return jsonResponse(
        {
          message:
            "A partner user must be associated. Provide user_id or use an email that matches a partner user.",
        },
        400
      );
    }

    const { data: partner, error } = await supabase
      .from("partners")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create partner: ${error.message}`);
      return jsonResponse({ message: "Failed to create partner" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "partner",
      entityId: partner.id,
      newData: partner as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(partner, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
