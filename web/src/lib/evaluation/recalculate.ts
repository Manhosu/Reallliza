/**
 * Recálculo do score e nível do profissional (Marco 6 / Bloco 3E).
 *
 * Consolida as 3 fontes — Sistema, Cliente, Qualidade — num score
 * 0-100 (média ponderada pelos pesos configuráveis) e determina o
 * nível Bronze/Prata/Ouro pelos critérios da level_config.
 *
 * Fontes sem dados são excluídas e os pesos renormalizados entre as
 * fontes que têm dados — um profissional novo não é penalizado.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSystemScore } from "./system-score";

export interface RecalculatedScore {
  system_score: number | null;
  client_score: number | null;
  quality_score: number | null;
  overall_score: number | null;
  level: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

interface LevelRow {
  level: string;
  order_index: number;
  min_overall_score: number;
  min_specialties: number;
  min_certifications: number;
  min_days_active: number;
  requires_certification: boolean;
}

/** Determina o nível pelo score e critérios da level_config. */
async function determineLevel(
  supabase: SupabaseClient,
  technicianId: string,
  overallScore: number | null
): Promise<string> {
  const { data: levels } = await supabase
    .from("level_config")
    .select(
      "level, order_index, min_overall_score, min_specialties, min_certifications, min_days_active, requires_certification"
    )
    .order("order_index", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("specialties, created_at")
    .eq("id", technicianId)
    .maybeSingle();

  const specialtiesCount = Array.isArray(profile?.specialties)
    ? profile!.specialties.length
    : 0;
  const daysActive = profile?.created_at
    ? Math.floor(
        (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000
      )
    : 0;
  // A contagem de certificações depende da sincronização de certificados
  // do Garantias (decisão em aberto do roadmap) — por ora é 0.
  const certifications = 0;
  const score = overallScore ?? 0;

  for (const lv of (levels as LevelRow[] | null) || []) {
    if (score < Number(lv.min_overall_score)) continue;
    if (specialtiesCount < lv.min_specialties) continue;
    if (certifications < lv.min_certifications) continue;
    if (daysActive < lv.min_days_active) continue;
    if (lv.requires_certification && certifications < 1) continue;
    return lv.level;
  }
  return "bronze";
}

/**
 * Recalcula e grava system/client/quality/overall score + nível do
 * profissional. Seguro para chamar como fire-and-forget.
 */
export async function recalculateTechnicianScore(
  supabase: SupabaseClient,
  technicianId: string
): Promise<RecalculatedScore> {
  // Fonte SISTEMA
  const sys = await computeSystemScore(supabase, technicianId);
  const systemScore = sys.sampleSize > 0 ? sys.score : null;

  // Fonte CLIENTE — média do overall_score das avaliações (1-5) → 0-100
  const { data: ratings } = await supabase
    .from("customer_ratings")
    .select("overall_score")
    .eq("technician_user_id", technicianId);
  const clientAvg = average(
    ((ratings as Array<{ overall_score: number | null }> | null) || [])
      .map((r) => r.overall_score)
      .filter((v): v is number => typeof v === "number")
  );
  const clientScore = clientAvg !== null ? round2(clientAvg * 20) : null;

  // Fonte QUALIDADE — média das avaliações de qualidade (já 0-100)
  const { data: qevals } = await supabase
    .from("quality_evaluations")
    .select("score")
    .eq("technician_id", technicianId);
  const qualityAvg = average(
    ((qevals as Array<{ score: number | null }> | null) || [])
      .map((q) => q.score)
      .filter((v): v is number => typeof v === "number")
  );
  const qualityScore = qualityAvg !== null ? round2(qualityAvg) : null;

  // Pesos configuráveis
  const { data: weights } = await supabase
    .from("evaluation_weights")
    .select("weight_system, weight_client, weight_quality")
    .limit(1)
    .maybeSingle();
  const wSystem = weights?.weight_system ?? 34;
  const wClient = weights?.weight_client ?? 33;
  const wQuality = weights?.weight_quality ?? 33;

  // Média ponderada sobre as fontes com dados (renormaliza os pesos).
  const parts: Array<{ score: number; weight: number }> = [];
  if (systemScore !== null) parts.push({ score: systemScore, weight: wSystem });
  if (clientScore !== null) parts.push({ score: clientScore, weight: wClient });
  if (qualityScore !== null)
    parts.push({ score: qualityScore, weight: wQuality });

  const weightTotal = parts.reduce((s, p) => s + p.weight, 0);
  const overallScore =
    weightTotal > 0
      ? round2(
          parts.reduce((s, p) => s + p.score * p.weight, 0) / weightTotal
        )
      : null;

  const level = await determineLevel(supabase, technicianId, overallScore);

  await supabase
    .from("profiles")
    .update({
      system_score: systemScore,
      client_score: clientScore,
      quality_score: qualityScore,
      overall_score: overallScore,
      level,
      score_calculated_at: new Date().toISOString(),
    })
    .eq("id", technicianId);

  return {
    system_score: systemScore,
    client_score: clientScore,
    quality_score: qualityScore,
    overall_score: overallScore,
    level,
  };
}
