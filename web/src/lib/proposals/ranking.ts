/**
 * Ranqueamento estilo Uber para propostas em broadcast.
 *
 * Score composto:
 *   0.4 * proximity + 0.3 * rating_avg + 0.2 * specialty_match + 0.1 * recent_activity
 *
 * Cada componente é normalizado para [0..1] antes do peso.
 *
 * - proximity: 1.0 = na obra (0km); 0.0 = >= 200km. Distância via Google
 *   Distance Matrix; fallback Haversine se a API key não estiver configurada
 *   ou o request falhar.
 * - rating_avg: média (quality+punctuality+communication)/3 dividido por 5;
 *   quem não tem avaliação recebe 3.5/5 = 0.7 (neutro).
 * - specialty_match: 1.0 se há match exato com service_type/categoria do
 *   serviço; 0.5 caso contrário. Se nenhum candidato tem `specialties`, o
 *   peso é redistribuído proporcionalmente entre os outros componentes.
 * - recent_activity: baseada em last_sign_in_at (auth.users) — fallback em
 *   updated_at do profile. 1.0 = últimos 7d, 0.5 = últimos 30d, 0 = mais.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

export interface CandidateProfile {
  id: string;
  full_name: string | null;
  operating_region: string | null;
  specialties: string[] | null;
  geo_lat: number | null;
  geo_lng: number | null;
  last_sign_in_at: string | null;
  updated_at: string | null;
}

export interface ScoredCandidate {
  id: string;
  full_name: string | null;
  proximity: number;
  rating: number;
  specialty: number;
  recency: number;
  score: number;
  distance_km: number | null;
}

interface RankInput {
  candidates: CandidateProfile[];
  obraLat: number | null;
  obraLng: number | null;
  serviceType?: string | null;
  ratingsByUser: Map<string, number>; // valor já em escala 0..5
}

/** Distância Haversine em km. */
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function distancesViaGoogle(
  obraLat: number,
  obraLng: number,
  candidates: CandidateProfile[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const withGeo = candidates.filter((c) => c.geo_lat != null && c.geo_lng != null);
  if (withGeo.length === 0 || !GOOGLE_MAPS_API_KEY) return map;

  // Distance Matrix permite até 25 destinos por request.
  const chunks: CandidateProfile[][] = [];
  for (let i = 0; i < withGeo.length; i += 25) {
    chunks.push(withGeo.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const destinations = chunk
      .map((c) => `${c.geo_lat},${c.geo_lng}`)
      .join("|");
    const params = new URLSearchParams({
      origins: `${obraLat},${obraLng}`,
      destinations,
      key: GOOGLE_MAPS_API_KEY,
      mode: "driving",
      language: "pt-BR",
      region: "br",
    });
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        status?: string;
        rows?: Array<{
          elements?: Array<{ status?: string; distance?: { value?: number } }>;
        }>;
      };
      if (data.status !== "OK") continue;
      const elements = data.rows?.[0]?.elements || [];
      chunk.forEach((c, idx) => {
        const el = elements[idx];
        if (el?.status === "OK" && el.distance?.value != null) {
          map.set(c.id, el.distance.value / 1000);
        }
      });
    } catch (err) {
      console.warn("[ranking] distance matrix err:", err);
    }
  }

  return map;
}

function normalizeProximity(distanceKm: number | null): number {
  if (distanceKm == null) return 0.5; // neutro quando desconhecido
  if (distanceKm <= 0) return 1;
  if (distanceKm >= 200) return 0;
  return 1 - distanceKm / 200;
}

function recencyScore(c: CandidateProfile): number {
  const ts = c.last_sign_in_at || c.updated_at;
  if (!ts) return 0;
  const ageDays = (Date.now() - new Date(ts).getTime()) / 86400000;
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.5;
  return 0;
}

function specialtyScore(c: CandidateProfile, serviceType?: string | null): number {
  if (!serviceType) return 0.75; // sem service_type => neutro alto (não penaliza)
  const list = c.specialties || [];
  if (list.length === 0) return 0.5;
  const target = serviceType.toLowerCase().trim();
  const match = list.some((s) => s.toLowerCase().trim() === target);
  return match ? 1 : 0.5;
}

export async function rankCandidates(
  input: RankInput
): Promise<ScoredCandidate[]> {
  const { candidates, obraLat, obraLng, serviceType, ratingsByUser } = input;

  // Distâncias
  let distances = new Map<string, number>();
  if (obraLat != null && obraLng != null) {
    distances = await distancesViaGoogle(obraLat, obraLng, candidates);
    // Fallback Haversine para qualquer candidato sem distância via Google
    for (const c of candidates) {
      if (
        !distances.has(c.id) &&
        c.geo_lat != null &&
        c.geo_lng != null
      ) {
        distances.set(c.id, haversine(obraLat, obraLng, c.geo_lat, c.geo_lng));
      }
    }
  }

  // Verifica se algum candidato tem specialties — se ninguém tem, redistribui peso
  const anyHasSpecialty = candidates.some(
    (c) => (c.specialties?.length || 0) > 0
  );

  // Pesos base e redistribuição
  const W = anyHasSpecialty
    ? { prox: 0.4, rate: 0.3, spec: 0.2, rec: 0.1 }
    : { prox: 0.5, rate: 0.375, spec: 0, rec: 0.125 };

  const scored: ScoredCandidate[] = candidates.map((c) => {
    const distanceKm = distances.get(c.id) ?? null;
    const proximity = normalizeProximity(distanceKm);
    const ratingAbs = ratingsByUser.get(c.id) ?? 3.5;
    const rating = Math.max(0, Math.min(1, ratingAbs / 5));
    const specialty = specialtyScore(c, serviceType);
    const recency = recencyScore(c);

    const score =
      W.prox * proximity +
      W.rate * rating +
      W.spec * specialty +
      W.rec * recency;

    return {
      id: c.id,
      full_name: c.full_name,
      proximity,
      rating,
      specialty,
      recency,
      score,
      distance_km: distanceKm,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Carrega média de avaliações dos candidatos em uma única query. */
export async function loadRatingsAverages(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;

  const { data, error } = await supabase
    .from("customer_ratings")
    .select("technician_user_id, quality, punctuality, communication")
    .in("technician_user_id", userIds);

  if (error || !data) return map;

  const buckets = new Map<string, { sum: number; count: number }>();
  for (const r of data as Array<{
    technician_user_id: string;
    quality: number;
    punctuality: number;
    communication: number;
  }>) {
    const avg = (r.quality + r.punctuality + r.communication) / 3;
    const cur = buckets.get(r.technician_user_id) || { sum: 0, count: 0 };
    cur.sum += avg;
    cur.count += 1;
    buckets.set(r.technician_user_id, cur);
  }
  for (const [uid, { sum, count }] of buckets) {
    map.set(uid, count > 0 ? sum / count : 3.5);
  }
  return map;
}
