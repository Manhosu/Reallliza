import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/profile/me
 * Get the authenticated user's profile.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      throw new AuthError(500, "Failed to fetch profile");
    }

    // Enriquecemos com:
    // - specialty_ratings: join com nome e nota média atual em
    //   technician_specialty_scores (preferido quando existe)
    // - stats: agregações em service_orders (concluídas, andamento, canceladas,
    //   pontualidade, tempo médio)
    // - client_relationship: agregação de customer_ratings
    const [tssRes, soRes, ratingsRes] = await Promise.all([
      supabase
        .from("technician_specialty_scores")
        .select("specialty_id, score_avg, os_count, specialty:specialties(name, order_index)")
        .eq("technician_id", user.id),
      supabase
        .from("service_orders")
        .select("status, scheduled_date, started_at, completed_at")
        .eq("technician_id", user.id),
      supabase
        .from("customer_ratings")
        .select("overall_score")
        .eq("technician_user_id", user.id),
    ]);

    type TssRowRaw = {
      specialty_id: string;
      score_avg: number;
      os_count: number;
      specialty:
        | { name: string; order_index: number }
        | Array<{ name: string; order_index: number }>
        | null;
    };
    const tssRows = (tssRes.data ?? []) as unknown as TssRowRaw[];
    const specialtyRatingsEnriched = tssRows
      .map((r) => {
        const sp = Array.isArray(r.specialty)
          ? r.specialty[0] ?? null
          : r.specialty;
        return {
          specialty_id: r.specialty_id,
          name: sp?.name ?? "",
          order_index: sp?.order_index ?? 99,
          stars: Number(r.score_avg ?? 0),
          os_count: r.os_count ?? 0,
        };
      })
      .filter((r) => r.name)
      .sort((a, b) => a.order_index - b.order_index)
      .map(({ order_index: _o, ...rest }) => rest);

    type SoRow = {
      status: string;
      scheduled_date: string | null;
      started_at: string | null;
      completed_at: string | null;
    };
    const soRows = (soRes.data ?? []) as SoRow[];
    const osCompleted = soRows.filter(
      (s) => s.status === "completed" || s.status === "invoiced"
    ).length;
    const osInProgress = soRows.filter(
      (s) => s.status === "in_progress" || s.status === "paused"
    ).length;
    const osCancelled = soRows.filter((s) => s.status === "cancelled").length;
    const punctualSos = soRows.filter(
      (s) =>
        (s.status === "completed" || s.status === "invoiced") &&
        s.started_at &&
        s.scheduled_date
    );
    const punctualOnTime = punctualSos.filter((s) => {
      // pontual = started_at no MESMO dia do scheduled_date (sem tolerância)
      const sched = s.scheduled_date!;
      const started = (s.started_at as string).slice(0, 10);
      return started <= sched;
    }).length;
    const punctualityPct = punctualSos.length
      ? Math.round((punctualOnTime / punctualSos.length) * 100)
      : null;

    const completedWithDuration = soRows.filter(
      (s) =>
        (s.status === "completed" || s.status === "invoiced") &&
        s.started_at &&
        s.completed_at
    );
    const avgCompletionDays = completedWithDuration.length
      ? Math.round(
          (completedWithDuration.reduce((acc, s) => {
            const start = new Date(s.started_at as string).getTime();
            const end = new Date(s.completed_at as string).getTime();
            return acc + (end - start) / 86_400_000;
          }, 0) /
            completedWithDuration.length) *
            10
        ) / 10
      : null;

    const ratings = (ratingsRes.data ?? []) as Array<{
      overall_score: number | null;
    }>;
    const ratingsCount = ratings.filter((r) => r.overall_score !== null).length;
    const ratingsAvg =
      ratingsCount > 0
        ? Math.round(
            (ratings
              .filter((r) => r.overall_score !== null)
              .reduce((acc, r) => acc + Number(r.overall_score), 0) /
              ratingsCount) *
              10
          ) / 10
        : null;

    return jsonResponse({
      ...profile,
      specialty_ratings_enriched: specialtyRatingsEnriched,
      stats: {
        os_completed: osCompleted,
        os_in_progress: osInProgress,
        os_cancelled: osCancelled,
        punctuality_pct: punctualityPct,
        avg_completion_days: avgCompletionDays,
      },
      client_relationship: {
        ratings_count: ratingsCount,
        rating_avg: ratingsAvg,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/profile/me
 * Update the authenticated user's profile.
 * Allowed fields: full_name, phone, avatar_url, cpf, rg, address, specialties.
 */
const ALLOWED_FIELDS = [
  "full_name",
  "phone",
  "avatar_url",
  "cpf",
  "rg",
  "address",
  "specialties",
  "specialty_ratings",
];

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    updateData.updated_at = new Date().toISOString();

    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      throw new AuthError(500, "Failed to update profile");
    }

    logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "profile",
      entityId: user.id,
      newData: updateData,
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
