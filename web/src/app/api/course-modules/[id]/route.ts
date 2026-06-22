import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = String(body.title).slice(0, 200);
    if (body.description !== undefined)
      update.description = body.description ? String(body.description).slice(0, 1000) : null;
    if (body.order_index !== undefined) update.order_index = body.order_index;
    if (body.is_published !== undefined) update.is_published = !!body.is_published;

    if (Object.keys(update).length === 0) throw new AuthError(400, "Nada para atualizar");

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("course_modules")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error("Falha ao atualizar modulo");
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const { error } = await supabase.from("course_modules").delete().eq("id", id);
    if (error) throw new Error("Falha ao remover modulo");
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
