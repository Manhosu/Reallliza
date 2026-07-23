import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/teams
 * Lista equipes com contagem de membros e especialidades herdadas.
 * Todos os autenticados leem; admin escreve.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "1";

    let query = supabase
      .from("teams")
      .select(
        `id, name, color, description, is_active, created_at,
         members:team_members(technician_id, is_leader,
           profile:profiles(id, full_name, email))`
      )
      .order("name", { ascending: true });
    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw error;

    // Enriquece com especialidades herdadas dos membros
    const teamIds = (data ?? []).map((t) => t.id as string);
    if (teamIds.length === 0) return jsonResponse([]);

    const memberIds = new Set<string>();
    for (const t of data ?? []) {
      for (const m of (t.members as Array<{ technician_id: string }>) ?? []) {
        memberIds.add(m.technician_id);
      }
    }

    let specsByTech = new Map<string, Array<{ id: string; name: string }>>();
    if (memberIds.size > 0) {
      const { data: sos } = await supabase
        .from("service_order_specialties")
        .select("specialty:specialties(id, name)")
        .limit(1);
      // Prefer profile_specialties se existir; fallback usa tabela local
      const { data: techSpecs } = await supabase
        .from("technician_specialty_scores")
        .select("technician_id, specialty:specialties(id, name)")
        .in("technician_id", Array.from(memberIds));
      for (const r of (techSpecs ?? []) as unknown as Array<{
        technician_id: string;
        specialty: { id: string; name: string } | { id: string; name: string }[] | null;
      }>) {
        const spec = Array.isArray(r.specialty) ? r.specialty[0] : r.specialty;
        if (!spec) continue;
        const list = specsByTech.get(r.technician_id) ?? [];
        if (!list.find((x) => x.id === spec.id)) list.push(spec);
        specsByTech.set(r.technician_id, list);
      }
      void sos;
    }

    const enriched = (data ?? []).map((t) => {
      const members = (t.members as unknown as Array<{
        technician_id: string;
        is_leader: boolean;
        profile:
          | { id: string; full_name: string; email: string }
          | { id: string; full_name: string; email: string }[]
          | null;
      }>) ?? [];
      const specSet = new Map<string, string>();
      for (const m of members) {
        for (const s of specsByTech.get(m.technician_id) ?? []) {
          specSet.set(s.id, s.name);
        }
      }
      return {
        ...t,
        member_count: members.length,
        specialties: Array.from(specSet, ([id, name]) => ({ id, name })),
      };
    });

    return jsonResponse(enriched);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/teams
 * Body: { name, color?, description? }
 * Apenas admin.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const body = await request.json();
    const { name, color, description } = body as {
      name?: string;
      color?: string;
      description?: string;
    };
    if (!name || !name.trim()) {
      return errorResponse(new Error("name obrigatorio"));
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("teams")
      .insert({
        name: name.trim(),
        color: color || "#EAB308",
        description: description ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

    logAudit({
      userId: user.id,
      action: "team.created",
      entityType: "team",
      entityId: (data as { id: string }).id,
      newData: data as Record<string, unknown>,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
