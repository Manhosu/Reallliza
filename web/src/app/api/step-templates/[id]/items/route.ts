import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

function slugifyKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "STEP";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("step_template_items")
      .select("*")
      .eq("group_id", id)
      .order("order_index", { ascending: true });
    if (error) throw new Error("Falha ao listar etapas");
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    if (!body.name) throw new AuthError(400, "Nome é obrigatório");

    const supabase = getAdminClient();

    const { data: existing } = await supabase
      .from("step_template_items")
      .select("step_key, order_index")
      .eq("group_id", id);

    const usedKeys = new Set((existing || []).map((e: { step_key: string }) => e.step_key));
    const maxOrder = (existing || []).reduce(
      (m: number, e: { order_index: number }) => Math.max(m, e.order_index),
      0
    );

    let key = (body.step_key || slugifyKey(body.name)).toUpperCase();
    let candidate = key;
    let n = 2;
    while (usedKeys.has(candidate)) candidate = `${key}_${n++}`;

    const { data, error } = await supabase
      .from("step_template_items")
      .insert({
        group_id: id,
        step_key: candidate,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        order_index: body.order_index ?? maxOrder + 1,
        photos_required_min: body.photos_required_min ?? 1,
        final_photos_required_min: body.final_photos_required_min ?? 1,
        occurrence_enabled: body.occurrence_enabled ?? true,
        is_required: body.is_required ?? true,
      })
      .select()
      .single();

    if (error) throw new Error("Falha ao criar etapa");
    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
