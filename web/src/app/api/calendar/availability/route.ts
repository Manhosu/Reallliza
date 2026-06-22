import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/calendar/availability?days=30&from=YYYY-MM-DD
 *
 * Retorna disponibilidade da agenda Reallliza pros proximos N dias —
 * usado pela loja parceira pra escolher data no /orcamentos/novo
 * (modalidade Reallliza, spec novosajustes.md secao "Calendario Reallliza").
 *
 * Resposta:
 *   {
 *     from: 'YYYY-MM-DD',
 *     to: 'YYYY-MM-DD',
 *     days: {
 *       'YYYY-MM-DD': {
 *         available: boolean,        // libera escolha?
 *         is_weekend: boolean,
 *         is_holiday: boolean,
 *         holiday_name?: string,
 *         booked_slots: number,      // qtos schedules ja ocupam o dia
 *         busy_full: boolean,        // dia inteiro ocupado por equipe
 *       }
 *     }
 *   }
 *
 * Regras:
 *   - Domingo e feriado: bloqueado por padrao (loja pode pedir manualmente,
 *     mas vai cair em horario especial)
 *   - Dia com 3+ schedules ativos: marcado como busy_full (politica simples;
 *     equipe Reallliza pequena)
 *   - Sabado: liberado mas marcado is_weekend pra UI alertar +25%
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const sp = request.nextUrl.searchParams;
    const fromStr =
      sp.get("from") ?? new Date().toISOString().slice(0, 10);
    const daysParam = Math.min(
      Math.max(parseInt(sp.get("days") ?? "30", 10) || 30, 1),
      90
    );

    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + daysParam - 1);
    const toStr = to.toISOString().slice(0, 10);

    const supabase = getAdminClient();

    // Schedules no periodo
    const { data: schedules } = await supabase
      .from("schedules")
      .select("date, status")
      .gte("date", fromStr)
      .lte("date", toStr)
      .in("status", ["scheduled", "confirmed", "in_progress"]);

    // Feriados no periodo
    const { data: holidays } = await supabase
      .from("public_holidays")
      .select("date, name")
      .gte("date", fromStr)
      .lte("date", toStr)
      .eq("is_active", true);

    const scheduleCountByDate = new Map<string, number>();
    for (const s of (schedules ?? []) as Array<{ date: string }>) {
      scheduleCountByDate.set(s.date, (scheduleCountByDate.get(s.date) ?? 0) + 1);
    }
    const holidayByDate = new Map<string, string>();
    for (const h of (holidays ?? []) as Array<{ date: string; name: string }>) {
      holidayByDate.set(h.date, h.name);
    }

    const result: Record<
      string,
      {
        available: boolean;
        is_weekend: boolean;
        is_holiday: boolean;
        holiday_name?: string;
        booked_slots: number;
        busy_full: boolean;
      }
    > = {};

    for (let i = 0; i < daysParam; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dow = d.getDay(); // 0=Dom, 6=Sab
      const is_weekend = dow === 0 || dow === 6;
      const holidayName = holidayByDate.get(dateStr);
      const is_holiday = !!holidayName;
      const booked_slots = scheduleCountByDate.get(dateStr) ?? 0;
      const busy_full = booked_slots >= 3;

      // Domingo e feriado bloqueados; sabado e dia ocupado liberados mas
      // marcados (UI mostra warning de horario especial / ocupado)
      const available = !busy_full && dow !== 0 && !is_holiday;

      result[dateStr] = {
        available,
        is_weekend,
        is_holiday,
        ...(holidayName ? { holiday_name: holidayName } : {}),
        booked_slots,
        busy_full,
      };
    }

    return jsonResponse({ from: fromStr, to: toStr, days: result });
  } catch (error) {
    return errorResponse(error);
  }
}
