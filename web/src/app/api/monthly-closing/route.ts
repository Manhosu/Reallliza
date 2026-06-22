import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/monthly-closing — lista fechamentos.
 * POST — fecha o mes (year + month). Apenas admin.
 *
 * Ao fechar: agrega total_received, total_paid, total_pending, total_custody,
 * total_released, count_quotes, count_os, count_warranties → grava em
 * monthly_closing.summary + marca status='closed'.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data } = await supabase
      .from("monthly_closing")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const year = Number(body.year);
    const month = Number(body.month);
    if (
      !Number.isInteger(year) ||
      year < 2020 ||
      year > 2099 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new AuthError(400, "year/month invalidos");
    }

    const supabase = getAdminClient();

    // Janela do mes
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0); // last day
    const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    const endIso = end + "T23:59:59";

    // Coleta agregados
    const [paymentsRes, quotesRes, osRes, warrantiesRes] = await Promise.all([
      supabase
        .from("payments")
        .select("amount, status, custody_status, payout_amount, platform_fee_amount, paid_at")
        .gte("paid_at", start)
        .lte("paid_at", endIso),
      supabase
        .from("quotes")
        .select("id, total_amount, status")
        .gte("created_at", start)
        .lte("created_at", endIso),
      supabase
        .from("service_orders")
        .select("id, status")
        .gte("created_at", start)
        .lte("created_at", endIso),
      supabase
        .from("warranties")
        .select("id")
        .gte("opened_at", start)
        .lte("opened_at", endIso),
    ]);

    type PayRow = {
      amount: number;
      status: string;
      custody_status: string;
      payout_amount: number | null;
      platform_fee_amount: number | null;
    };
    const payments = ((paymentsRes.data as unknown) as PayRow[] | null) ?? [];
    const total_received = payments
      .filter((p) => p.status === "confirmed")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total_paid_out = payments
      .filter((p) => p.custody_status === "released")
      .reduce((s, p) => s + (Number(p.payout_amount) || Number(p.amount) || 0), 0);
    const total_in_custody = payments
      .filter((p) => p.custody_status === "held")
      .reduce((s, p) => s + (Number(p.payout_amount) || Number(p.amount) || 0), 0);
    const total_platform_fees = payments.reduce(
      (s, p) => s + (Number(p.platform_fee_amount) || 0),
      0
    );

    const summary = {
      total_received: Math.round(total_received * 100) / 100,
      total_paid_out: Math.round(total_paid_out * 100) / 100,
      total_in_custody: Math.round(total_in_custody * 100) / 100,
      total_platform_fees: Math.round(total_platform_fees * 100) / 100,
      net_revenue: Math.round((total_received - total_paid_out) * 100) / 100,
      count_quotes: (quotesRes.data as unknown[] | null)?.length ?? 0,
      count_os: (osRes.data as unknown[] | null)?.length ?? 0,
      count_warranties: (warrantiesRes.data as unknown[] | null)?.length ?? 0,
    };

    const { data: closing, error } = await supabase
      .from("monthly_closing")
      .upsert(
        {
          year,
          month,
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user.id,
          summary,
        },
        { onConflict: "year,month" }
      )
      .select()
      .single();

    if (error) throw new Error("Falha ao fechar o mes");

    logAudit({
      userId: user.id,
      action: "monthly_closing.closed",
      entityType: "monthly_closing",
      entityId: `${year}-${month}`,
      newData: summary,
    });

    return jsonResponse(closing);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/monthly-closing?year=YYYY&month=MM — reabre o mes.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const sp = request.nextUrl.searchParams;
    const year = Number(sp.get("year"));
    const month = Number(sp.get("month"));
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new AuthError(400, "year/month obrigatorios");
    }

    const supabase = getAdminClient();
    await supabase
      .from("monthly_closing")
      .update({
        status: "open",
        closed_at: null,
        closed_by: null,
      })
      .eq("year", year)
      .eq("month", month);

    logAudit({
      userId: user.id,
      action: "monthly_closing.reopened",
      entityType: "monthly_closing",
      entityId: `${year}-${month}`,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
