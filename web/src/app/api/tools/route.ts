import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/tools
 * List tools inventory with pagination and filters.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const offset = (page - 1) * limit;
    const supabase = getAdminClient();

    let query = supabase
      .from("tool_inventory")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,serial_number.ilike.%${search}%`
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch tools: ${error.message}`);
      throw new Error("Failed to fetch tools");
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
 * POST /api/tools
 * Create a new tool in inventory.
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const supabase = getAdminClient();

    // Map DTO fields to DB column names
    const { image_url, purchase_value, ...rest } = body;
    const insertData: Record<string, unknown> = { ...rest };
    if (image_url) insertData.photo_url = image_url;

    const { data: tool, error } = await supabase
      .from("tool_inventory")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create tool: ${error.message}`);
      throw new Error("Failed to create tool");
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "create",
      entityType: "tool_inventory",
      entityId: tool.id,
      newData: tool as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(tool, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
