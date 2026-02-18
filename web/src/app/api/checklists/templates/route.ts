import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { randomUUID } from "crypto";

/**
 * GET /api/checklists/templates
 * List active checklist templates with optional pagination and search.
 * Authenticated users can list templates.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search");
    const isActive = searchParams.get("is_active");

    const offset = (page - 1) * limit;
    const supabase = getAdminClient();

    let query = supabase
      .from("checklist_templates")
      .select("*", { count: "exact" });

    // Default to active-only for non-admin users
    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    } else {
      query = query.eq("is_active", true);
    }

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch checklist templates: ${error.message}`);
      throw new Error("Failed to fetch checklist templates");
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
 * POST /api/checklists/templates
 * Create a new checklist template with items.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const { name, description, category, items: rawItems } = body;

    if (!name) {
      return jsonResponse({ message: "Template name is required" }, 400);
    }

    const supabase = getAdminClient();

    // Generate IDs and normalize items
    const items = (rawItems || []).map(
      (
        item: { description: string; order?: number; required?: boolean },
        index: number
      ) => ({
        id: randomUUID(),
        description: item.description,
        label: item.description,
        required: item.required ?? false,
        order: item.order ?? index,
      })
    );

    const { data: template, error } = await supabase
      .from("checklist_templates")
      .insert({
        name,
        description: description || null,
        category: category || null,
        items,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to create checklist template: ${error.message}`);
      throw new Error("Failed to create checklist template");
    }

    logAudit({
      userId: user.id,
      action: "checklist_template.created",
      entityType: "checklist_template",
      entityId: template.id,
      newData: template as Record<string, unknown>,
    });

    return jsonResponse(template, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
