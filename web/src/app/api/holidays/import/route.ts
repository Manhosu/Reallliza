import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/holidays/import
 * Importa feriados em lote — duas fontes:
 *   - 'brasilapi' (default): puxa de brasilapi.com.br/api/feriados/v1/{year}
 *   - 'csv': aceita CSV com colunas `date,name,is_active?`
 *
 * Body:
 *   { source: 'brasilapi', year: 2026 }
 *   ou { source: 'csv', csvContent: 'date,name\n2026-01-01,Ano Novo\n...' }
 *
 * Idempotente: usa upsert por `date`. Apenas admin.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const source = body.source ?? "brasilapi";

    type ImportItem = {
      date: string;
      name: string;
      is_active?: boolean;
      state?: string;
    };
    let items: ImportItem[] = [];

    if (source === "brasilapi") {
      const year = Number(body.year);
      if (!Number.isInteger(year) || year < 2020 || year > 2099) {
        throw new AuthError(400, "year invalido (2020-2099)");
      }
      const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (!res.ok) {
        throw new AuthError(502, "Falha ao buscar feriados na BrasilAPI");
      }
      const data = (await res.json()) as Array<{
        date: string;
        name: string;
        type: string;
      }>;
      items = data.map((d) => ({
        date: d.date,
        name: d.name,
        is_active: true,
      }));
    } else if (source === "csv") {
      const csv = String(body.csvContent ?? "").trim();
      if (!csv) throw new AuthError(400, "csvContent vazio");
      const lines = csv.split(/\r?\n/).filter((l) => l.trim());
      const header = lines.shift()?.toLowerCase() ?? "";
      if (!header.includes("date") || !header.includes("name")) {
        throw new AuthError(400, "CSV precisa de colunas date,name");
      }
      const cols = header.split(",").map((c) => c.trim());
      const idxDate = cols.indexOf("date");
      const idxName = cols.indexOf("name");
      const idxActive = cols.indexOf("is_active");
      const idxState = cols.indexOf("state");
      for (const line of lines) {
        const parts = line.split(",");
        const date = parts[idxDate]?.trim();
        const name = parts[idxName]?.trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) continue;
        items.push({
          date,
          name: name.slice(0, 100),
          is_active:
            idxActive >= 0
              ? !["false", "0", "no", "nao"].includes(
                  parts[idxActive]?.trim().toLowerCase() ?? ""
                )
              : true,
          state:
            idxState >= 0 && parts[idxState]?.trim()
              ? parts[idxState].trim().toUpperCase().slice(0, 2)
              : undefined,
        });
      }
    } else {
      throw new AuthError(400, "source invalido (brasilapi|csv)");
    }

    if (items.length === 0) {
      return jsonResponse({ success: true, imported: 0, items: [] });
    }

    const supabase = getAdminClient();
    const rows = items.map((it) => ({
      date: it.date,
      name: it.name,
      state: it.state ?? null,
      is_national: !it.state,
      is_active: it.is_active !== false,
      source,
    }));

    const { error, data } = await supabase
      .from("public_holidays")
      .upsert(rows, { onConflict: "date" })
      .select();

    if (error) throw new Error("Falha ao importar feriados");

    logAudit({
      userId: user.id,
      action: "holidays.imported",
      entityType: "public_holidays",
      entityId: "bulk",
      newData: { source, count: rows.length },
    });

    return jsonResponse({
      success: true,
      imported: (data as unknown[] | null)?.length ?? rows.length,
      items: data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
