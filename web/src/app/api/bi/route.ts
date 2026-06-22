import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/bi
 * KPIs gerenciais: OS por status, receita por mes (12 meses), top servicos,
 * top tecnicos, taxa de garantia, NPS de avaliacoes.
 *
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (opcional, default ultimos 12 meses)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const defFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fromStr = sp.get("from") ?? defFrom.toISOString().slice(0, 10);
    const toStr = sp.get("to") ?? now.toISOString().slice(0, 10);

    const supabase = getAdminClient();

    const [
      osByStatus,
      monthlyRevenue,
      topServices,
      topTechnicians,
      warrantyStats,
      ratings,
    ] = await Promise.all([
      // 1. OS por status
      supabase
        .from("service_orders")
        .select("status")
        .gte("created_at", fromStr)
        .lte("created_at", toStr + "T23:59:59"),
      // 2. Receita por mes (payments confirmados)
      supabase
        .from("payments")
        .select("amount, paid_at")
        .eq("status", "confirmed")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr + "T23:59:59"),
      // 3. Top servicos (mais usados em OS)
      supabase
        .from("service_order_items")
        .select("service_id, description, unit_value, quantity")
        .not("service_id", "is", null),
      // 4. Top tecnicos
      supabase
        .from("service_orders")
        .select("technician_id, status")
        .not("technician_id", "is", null),
      // 5. Garantias
      supabase
        .from("warranties")
        .select("status, service_order_id"),
      // 6. Avaliacoes (system_score/client_score em profiles)
      supabase
        .from("professional_ratings")
        .select("rating, created_at"),
    ]);

    // 1. OS por status
    type OsRow = { status: string };
    const statusCounts: Record<string, number> = {};
    for (const o of ((osByStatus.data as unknown) as OsRow[] | null) ?? []) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    }
    const total_os = Object.values(statusCounts).reduce((s, n) => s + n, 0);

    // 2. Receita por mês — 12 últimos
    type PayRow = { amount: number; paid_at: string | null };
    const monthMap = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      monthMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const p of ((monthlyRevenue.data as unknown) as PayRow[] | null) ?? []) {
      if (!p.paid_at) continue;
      const key = p.paid_at.slice(0, 7);
      if (monthMap.has(key)) {
        monthMap.set(key, (monthMap.get(key) ?? 0) + (Number(p.amount) || 0));
      }
    }
    const revenue_by_month = Array.from(monthMap.entries()).map(([key, value]) => {
      const [year, month] = key.split("-").map((n) => parseInt(n, 10));
      const names = [
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez",
      ];
      return {
        month: `${names[month - 1]}/${String(year).slice(2)}`,
        revenue: Math.round(value * 100) / 100,
      };
    });

    // 3. Top servicos
    type ItemRow = {
      service_id: string;
      description: string | null;
      unit_value: number;
      quantity: number;
    };
    const serviceMap = new Map<
      string,
      { name: string; count: number; total: number }
    >();
    for (const it of ((topServices.data as unknown) as ItemRow[] | null) ?? []) {
      const cur = serviceMap.get(it.service_id) ?? {
        name: it.description ?? it.service_id.slice(0, 8),
        count: 0,
        total: 0,
      };
      cur.count++;
      cur.total += (Number(it.unit_value) || 0) * (Number(it.quantity) || 0);
      serviceMap.set(it.service_id, cur);
    }
    const top_services = Array.from(serviceMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([id, v]) => ({
        service_id: id,
        name: v.name.slice(0, 50),
        count: v.count,
        total: Math.round(v.total * 100) / 100,
      }));

    // 4. Top tecnicos
    type TechRow = { technician_id: string; status: string };
    const techMap = new Map<string, { total: number; completed: number }>();
    for (const t of ((topTechnicians.data as unknown) as TechRow[] | null) ?? []) {
      const cur = techMap.get(t.technician_id) ?? { total: 0, completed: 0 };
      cur.total++;
      if (["completed", "approved", "invoiced"].includes(t.status)) {
        cur.completed++;
      }
      techMap.set(t.technician_id, cur);
    }
    const techIds = Array.from(techMap.keys()).slice(0, 20);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, overall_score")
      .in("id", techIds);
    const profMap = new Map(
      ((profiles as unknown) as Array<{
        id: string;
        full_name: string;
        overall_score: number | null;
      }> | null)?.map((p) => [p.id, p]) ?? []
    );
    const top_technicians = Array.from(techMap.entries())
      .sort((a, b) => b[1].completed - a[1].completed)
      .slice(0, 5)
      .map(([id, v]) => ({
        technician_id: id,
        name: profMap.get(id)?.full_name ?? id.slice(0, 8),
        completed_count: v.completed,
        total_count: v.total,
        overall_score: profMap.get(id)?.overall_score ?? null,
      }));

    // 5. Taxa de garantia
    type WarrRow = { status: string; service_order_id: string };
    const warranties = ((warrantyStats.data as unknown) as WarrRow[] | null) ?? [];
    const total_warranties = warranties.length;
    const warranty_rate = total_os > 0
      ? Math.round((total_warranties / total_os) * 10000) / 100
      : 0;

    // 6. NPS / rating médio
    type RatingRow = { rating: number };
    const allRatings = ((ratings.data as unknown) as RatingRow[] | null) ?? [];
    const avg_rating = allRatings.length > 0
      ? Math.round(
          (allRatings.reduce((s, r) => s + (Number(r.rating) || 0), 0) /
            allRatings.length) * 100
        ) / 100
      : 0;

    return jsonResponse({
      range: { from: fromStr, to: toStr },
      os_by_status: statusCounts,
      total_os,
      revenue_by_month,
      top_services,
      top_technicians,
      total_warranties,
      warranty_rate, // % de OS que viraram garantia
      avg_rating,
      total_ratings: allRatings.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
