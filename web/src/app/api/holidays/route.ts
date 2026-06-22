import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const sp = request.nextUrl.searchParams;
    const year = sp.get("year");
    const supabase = getAdminClient();
    let q = supabase
      .from("public_holidays")
      .select("*")
      .order("date", { ascending: true });
    if (year && /^\d{4}$/.test(year)) {
      q = q.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
    }
    const { data } = await q;
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/holidays — cria feriado custom.
 * Body: { date, name, state?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
      throw new AuthError(400, "date no formato YYYY-MM-DD obrigatoria");
    }
    if (!body.name || !String(body.name).trim()) {
      throw new AuthError(400, "name obrigatorio");
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("public_holidays")
      .upsert(
        {
          date: body.date,
          name: String(body.name).trim().slice(0, 100),
          state: body.state ? String(body.state).toUpperCase().slice(0, 2) : null,
          is_national: !body.state,
          is_active: body.is_active !== false,
          source: "manual",
        },
        { onConflict: "date" }
      )
      .select()
      .single();

    if (error) throw new Error("Falha ao criar feriado");

    logAudit({
      userId: user.id,
      action: "holiday.created",
      entityType: "public_holiday",
      entityId: (data as { date: string }).date,
      newData: data as Record<string, unknown>,
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const date = request.nextUrl.searchParams.get("date");
    if (!date) throw new AuthError(400, "date obrigatorio");
    const supabase = getAdminClient();
    await supabase.from("public_holidays").delete().eq("date", date);
    logAudit({
      userId: user.id,
      action: "holiday.deleted",
      entityType: "public_holiday",
      entityId: date,
    });
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
