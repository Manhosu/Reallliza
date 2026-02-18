import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { randomUUID } from "crypto";

/**
 * POST /api/checklists
 * Create a checklist instance from a template for a service order.
 * Copies template items into the checklist's items JSONB field.
 * Authenticated users (admin, technician).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { service_order_id, template_id } = body;

    if (!service_order_id) {
      return jsonResponse({ message: "service_order_id is required" }, 400);
    }

    if (!template_id) {
      return jsonResponse({ message: "template_id is required" }, 400);
    }

    const supabase = getAdminClient();

    // Verify the service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", service_order_id)
      .single();

    if (soError || !serviceOrder) {
      throw new AuthError(
        404,
        `Service order with ID ${service_order_id} not found`
      );
    }

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (templateError || !template) {
      throw new AuthError(
        404,
        `Checklist template with ID ${template_id} not found`
      );
    }

    if (!template.is_active) {
      return jsonResponse(
        { message: "Cannot create a checklist from an inactive template" },
        400
      );
    }

    // Convert template items to checklist items (unchecked by default)
    const templateItems = (template.items || []) as Array<{
      id: string;
      label: string;
      description?: string;
      required: boolean;
      order: number;
    }>;

    const checklistItems = templateItems.map((item) => ({
      id: randomUUID(),
      description: item.description || item.label,
      label: item.label,
      order: item.order,
      required: item.required,
      checked: false,
      notes: null,
      photo_url: null,
      checked_at: null,
    }));

    const { data: checklist, error } = await supabase
      .from("checklists")
      .insert({
        service_order_id,
        template_id,
        status: "pending",
        items: checklistItems,
        completed_at: null,
        completed_by: null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to create checklist: ${error.message}`);
      throw new Error("Failed to create checklist");
    }

    logAudit({
      userId: user.id,
      action: "checklist.created",
      entityType: "checklist",
      entityId: checklist.id,
      newData: {
        service_order_id,
        template_id,
        template_name: template.name,
      },
    });

    return jsonResponse(checklist, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
