import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/custody/active
 * List all active custody records (tools not yet returned).
 * Optionally filtered by user_id query param.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id");

    const supabase = getAdminClient();

    let query = supabase
      .from("tool_custody")
      .select(
        `
        *,
        tool:tool_inventory(id, name, serial_number, category, photo_url),
        unit:tool_units(id, code, patrimony_code, status),
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders(id, order_number, title)
      `
      )
      .is("checked_in_at", null)
      .order("checked_out_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch active custodies: ${error.message}`);
      throw new Error("Failed to fetch active custodies");
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    // Prorrogação pendente entra aqui em UMA consulta. A tela precisa disso pra
    // exibir a situação "Prorrogação pendente" (spec seção 6) — buscar uma a
    // uma seria N requisições.
    const ids = rows.map((r) => r.id as string);
    const pending = new Set<string>();
    if (ids.length > 0) {
      const { data: exts } = await supabase
        .from("tool_extension_requests")
        .select("custody_id")
        .eq("status", "pending")
        .in("custody_id", ids);
      for (const e of (exts ?? []) as Array<{ custody_id: string }>) {
        pending.add(e.custody_id);
      }
    }

    return jsonResponse(
      rows.map((r) => ({
        ...r,
        has_pending_extension: pending.has(r.id as string),
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
