import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !profile) {
      throw new AuthError(404, `User with ID ${id} not found`);
    }

    // If the user is a partner, fetch their partner data
    let partner = null;
    if (profile.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", id)
        .single();

      partner = partnerData;
    }

    return jsonResponse({
      ...profile,
      partner,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    // Verify user exists and get old data for audit
    const { data: existing, error: findError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `User with ID ${id} not found`);
    }

    // Quando o admin envia specialty_ratings, normalizamos pra gravar nome
    // resolvido (mantendo o jsonb auto-contido) E refletimos em
    // technician_specialty_scores — mesmo padrão do POST /api/auth/register.
    // Bug 7 (Jessica 11/06): "como acrescentar especialidade em técnico
    // já cadastrado?". Antes a rota só atualizava nome/telefone.
    const incomingRatings = body.specialty_ratings;
    let normalizedRatings:
      | Array<{ specialty_id?: string; name: string; stars: number }>
      | undefined;

    if (Array.isArray(incomingRatings)) {
      const idsToResolve = incomingRatings
        .map((r: { specialty_id?: string }) => r?.specialty_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0);

      const nameById = new Map<string, string>();
      if (idsToResolve.length > 0) {
        const { data: specs } = await supabase
          .from("specialties")
          .select("id, name")
          .in("id", idsToResolve);
        for (const s of specs ?? []) {
          nameById.set(s.id as string, s.name as string);
        }
      }

      normalizedRatings = incomingRatings
        .map((r: { specialty_id?: string; name?: string; stars?: number }) => {
          const resolvedName =
            (r.specialty_id && nameById.get(r.specialty_id)) ||
            (typeof r.name === "string" ? r.name.trim() : "");
          if (!resolvedName) return null;
          return {
            specialty_id: r.specialty_id,
            name: resolvedName,
            stars: Math.max(1, Math.min(5, Math.round(Number(r.stars) || 0))),
          };
        })
        .filter(Boolean) as typeof normalizedRatings;
    }

    const updatePayload: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    };
    if (normalizedRatings !== undefined) {
      updatePayload.specialty_ratings = normalizedRatings;
      // Espelha `specialties` (array de strings) pra busca por texto.
      updatePayload.specialties = normalizedRatings.map((r) => r.name);
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update user ${id}: ${error.message}`);
      throw new AuthError(500, `Falha ao atualizar usuário: ${error.message}`);
    }

    // Sincroniza technician_specialty_scores quando vier specialty_ratings
    // (técnicos): remove os scores cuja specialty saiu da lista e upserta os
    // que estão. Não mexe em os_count/last_recalc_at de scores existentes —
    // só cria novos com a estrela vinda do form.
    if (normalizedRatings && (existing as { role?: string }).role === "technician") {
      const incomingIds = normalizedRatings
        .map((r) => r.specialty_id)
        .filter((v): v is string => !!v);

      // Remove scores que saíram do select.
      if (incomingIds.length === 0) {
        await supabase
          .from("technician_specialty_scores")
          .delete()
          .eq("technician_id", id);
      } else {
        // Busca scores atuais e remove os que não estão na nova lista.
        const { data: currentScores } = await supabase
          .from("technician_specialty_scores")
          .select("specialty_id")
          .eq("technician_id", id);

        const toRemove = (currentScores ?? [])
          .map((s: { specialty_id: string }) => s.specialty_id)
          .filter((sid: string) => !incomingIds.includes(sid));

        if (toRemove.length > 0) {
          await supabase
            .from("technician_specialty_scores")
            .delete()
            .eq("technician_id", id)
            .in("specialty_id", toRemove);
        }
      }

      // Upsert dos que ficaram (cria os novos).
      const rows = normalizedRatings
        .filter((r) => r.specialty_id)
        .map((r) => ({
          technician_id: id,
          specialty_id: r.specialty_id!,
          os_count: 0,
          score_avg: r.stars,
        }));
      if (rows.length > 0) {
        await supabase
          .from("technician_specialty_scores")
          .upsert(rows, { onConflict: "technician_id,specialty_id" });
      }
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "user.updated",
      entityType: "user",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: profile as Record<string, unknown>,
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
