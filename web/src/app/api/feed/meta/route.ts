import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/feed/meta
 *
 * Tudo que o editor precisa para montar os seletores, numa chamada só:
 * categorias, audiências, patrocinadores e campanhas.
 *
 * Quatro chamadas separadas ao abrir o editor seriam quatro autenticações
 * para dados que praticamente não mudam.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();

    const [categorias, audiencias, patrocinadores, campanhas] = await Promise.all([
      supabase
        .from("feed_categories")
        .select("id, slug, name, icon, color, requires_sponsor, default_notify")
        .eq("is_active", true)
        .order("order_index"),
      supabase
        .from("feed_audience_rules")
        .select("id, name, description, estimated_size, computed_at")
        .order("name"),
      supabase
        .from("feed_sponsors")
        .select("id, name, logo_url, primary_color")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("feed_campaigns")
        .select("id, name, status, sponsor_id, starts_at, ends_at")
        .in("status", ["draft", "scheduled", "active"])
        .order("name"),
    ]);

    return jsonResponse({
      categorias: categorias.data ?? [],
      audiencias: audiencias.data ?? [],
      patrocinadores: patrocinadores.data ?? [],
      campanhas: campanhas.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
