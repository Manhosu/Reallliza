/**
 * Calculadora do orcamento Reallliza (Fase 2 — Loja Parceira).
 *
 * Spec novosajustes.md:
 *  - Servicos: somatorio (commercial_price × quantidade) e (estimated_time_hours × quantidade)
 *  - Deslocamento: distance_km (Google Maps Distance Matrix / fallback Haversine
 *    a partir do CEP/lat-lng do cliente) × company_settings.price_per_km
 *  - Estadia: 1 a cada 8h se cliente em estado != base, valor por estado em state_stay_rates
 *  - Horario especial: +25% sobre subtotal_services se data/hora em
 *    public_holidays / weekend / fora do business_hour_start..end. NAO incide
 *    sobre deslocamento, estadia, nem propostas pra homologados.
 *  - Modalidade homologados: usa o valor que a loja informou, sem deslocamento/
 *    estadia/horario especial. Aplica platform_fee_pct pra calcular payout_amount.
 */

import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { geocodeAddress } from "./geocode";

export interface CompanySettings {
  base_lat: number | null;
  base_lng: number | null;
  base_state: string | null;
  price_per_km: number;
  special_hour_multiplier: number;
  platform_fee_pct: number;
  business_hour_start: string; // HH:MM:SS
  business_hour_end: string;
  /** Raio (km) de cobertura sem deslocamento dentro da UF base. */
  coverage_radius_km: number | null;
  /** Tempo maximo (h) de servico sem estadia dentro da UF base. */
  max_service_hours_no_stay: number | null;
}

export interface StateStayRate {
  state: string;
  daily_rate: number;
}

export interface QuoteCalcInputItem {
  service_id: string;
  quantity: number;
  /** Snapshot, pra n consultar `services` no mesmo request */
  commercial_price: number;
  estimated_time_hours: number;
  unit?: string;
}

export interface QuoteCalcInput {
  modality: "reallliza" | "homologados";
  items: QuoteCalcInputItem[];
  service_address_zip?: string | null;
  service_address_city?: string | null;
  service_address_state?: string | null;
  service_address_street?: string | null;
  service_date?: string | null; // YYYY-MM-DD
  service_time?: string | null; // HH:MM
  /** Modalidade homologados: valor manual definido pela loja */
  manual_total_amount?: number | null;
}

export interface QuoteCalcResult {
  subtotal_services: number;
  total_hours: number;
  total_days: number;
  travel_distance_km: number;
  travel_cost: number;
  stay_count: number;
  stay_cost: number;
  is_special_hour: boolean;
  special_hour_extra: number;
  total_amount: number;
  platform_fee_pct: number;
  platform_fee_amount: number;
  payout_amount: number;
  /** Avisos nao-bloqueantes que a UI pode exibir. */
  warnings: string[];
}

/**
 * Carrega company_settings (singleton). Lanca se nao existir.
 */
export async function loadCompanySettings(): Promise<CompanySettings> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select(
      "base_lat, base_lng, base_state, price_per_km, special_hour_multiplier, platform_fee_pct, business_hour_start, business_hour_end, coverage_radius_km, max_service_hours_no_stay"
    )
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error("company_settings nao configurado. Acesse /configuracoes-globais.");
  }
  return data as CompanySettings;
}

async function loadStayRate(state: string): Promise<number> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("state_stay_rates")
    .select("daily_rate")
    .eq("state", state.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  return Number((data as { daily_rate?: number } | null)?.daily_rate ?? 0);
}

async function isHoliday(date: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("date", date)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

function parseTimeToMinutes(hms: string): number {
  const [h, m] = hms.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function isWeekend(yyyy_mm_dd: string): boolean {
  // Constrói Date local; JS getDay: 0=Dom, 6=Sab
  const [y, m, d] = yyyy_mm_dd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Determina se a data/hora cai em "horario especial" — fora do expediente,
 * fim de semana ou feriado.
 */
export async function checkSpecialHour(
  date: string,
  time: string | null,
  settings: CompanySettings
): Promise<boolean> {
  if (await isHoliday(date)) return true;
  if (isWeekend(date)) return true;
  if (!time) return false;

  const minutes = parseTimeToMinutes(time);
  const start = parseTimeToMinutes(settings.business_hour_start);
  const end = parseTimeToMinutes(settings.business_hour_end);

  return minutes < start || minutes >= end;
}

/**
 * Centro geografico aproximado de cada UF brasileira.
 * Fallback quando o endereco especifico do cliente nao geocodifica
 * (Jessica 16/07 — orcamentos fora do estado base saindo com quilometragem
 * zerada silenciosamente).
 */
const UF_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -8.77, lng: -70.55 },
  AL: { lat: -9.62, lng: -36.82 },
  AP: { lat: 1.41, lng: -51.77 },
  AM: { lat: -3.47, lng: -65.1 },
  BA: { lat: -12.96, lng: -38.51 },
  CE: { lat: -3.71, lng: -38.54 },
  DF: { lat: -15.83, lng: -47.86 },
  ES: { lat: -19.19, lng: -40.34 },
  GO: { lat: -16.64, lng: -49.31 },
  MA: { lat: -2.55, lng: -44.3 },
  MT: { lat: -12.64, lng: -55.42 },
  MS: { lat: -20.51, lng: -54.54 },
  MG: { lat: -18.1, lng: -44.38 },
  PA: { lat: -3.79, lng: -52.48 },
  PB: { lat: -7.06, lng: -35.55 },
  PR: { lat: -24.89, lng: -51.55 },
  PE: { lat: -8.28, lng: -35.07 },
  PI: { lat: -8.28, lng: -43.68 },
  RJ: { lat: -22.84, lng: -43.15 },
  RN: { lat: -5.4, lng: -36.95 },
  RS: { lat: -30.01, lng: -51.22 },
  RO: { lat: -11.22, lng: -62.8 },
  RR: { lat: 1.99, lng: -61.33 },
  SC: { lat: -27.33, lng: -49.44 },
  SP: { lat: -23.55, lng: -46.64 },
  SE: { lat: -10.9, lng: -37.07 },
  TO: { lat: -10.25, lng: -48.32 },
};

/**
 * Distancia Haversine em km — fallback se Google Maps falha ou nao temos lat/lng.
 */
export function haversineKm(
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

/**
 * Calcula distancia via Google Distance Matrix; se falhar, faz Haversine.
 */
async function computeTravelDistance(
  baseLat: number,
  baseLng: number,
  destLat: number,
  destLng: number
): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return haversineKm(baseLat, baseLng, destLat, destLng);
  }
  const params = new URLSearchParams({
    origins: `${baseLat},${baseLng}`,
    destinations: `${destLat},${destLng}`,
    key: apiKey,
    mode: "driving",
    language: "pt-BR",
    region: "br",
  });
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
    );
    if (!res.ok) return haversineKm(baseLat, baseLng, destLat, destLng);
    const data = (await res.json()) as {
      rows?: Array<{
        elements?: Array<{ status?: string; distance?: { value?: number } }>;
      }>;
    };
    const meters = data.rows?.[0]?.elements?.[0]?.distance?.value;
    if (typeof meters === "number") return meters / 1000;
  } catch {
    /* fallback */
  }
  return haversineKm(baseLat, baseLng, destLat, destLng);
}

/**
 * Calcula o orcamento. Modalidade reallliza = preco automatico;
 * homologados = `manual_total_amount` + repasse com taxa plataforma.
 */
export async function calculateQuote(
  input: QuoteCalcInput
): Promise<QuoteCalcResult> {
  const warnings: string[] = [];
  const settings = await loadCompanySettings();

  // Servicos
  let subtotal_services = 0;
  let total_hours = 0;
  for (const it of input.items) {
    subtotal_services += it.commercial_price * it.quantity;
    total_hours += it.estimated_time_hours * it.quantity;
  }
  subtotal_services = Math.round(subtotal_services * 100) / 100;
  total_hours = Math.round(total_hours * 100) / 100;
  // Dias uteis (8h por dia) — arredondado pra cima
  const total_days = total_hours > 0 ? Math.ceil(total_hours / 8) : 0;

  // Modalidade homologados — calculo simples
  if (input.modality === "homologados") {
    const total_amount =
      typeof input.manual_total_amount === "number" && input.manual_total_amount > 0
        ? input.manual_total_amount
        : subtotal_services;
    const platform_fee_amount =
      Math.round(((total_amount * settings.platform_fee_pct) / 100) * 100) / 100;
    const payout_amount =
      Math.round((total_amount - platform_fee_amount) * 100) / 100;

    return {
      subtotal_services,
      total_hours,
      total_days,
      travel_distance_km: 0,
      travel_cost: 0,
      stay_count: 0,
      stay_cost: 0,
      is_special_hour: false,
      special_hour_extra: 0,
      total_amount,
      platform_fee_pct: settings.platform_fee_pct,
      platform_fee_amount,
      payout_amount,
      warnings,
    };
  }

  // Modalidade reallliza — calculo completo
  let travel_distance_km = 0;
  let travel_cost = 0;

  // Determina se cliente esta na mesma UF da base (drive da regra Jessica 24/06)
  const sameStateAsBase =
    !!settings.base_state &&
    !!input.service_address_state &&
    input.service_address_state.toUpperCase() === settings.base_state.toUpperCase();

  // Cobertura operacional (Jessica 24/06):
  //   - coverage_radius_km > 0: dentro da UF base, ate esse raio nao cobra deslocamento
  //   - max_service_hours_no_stay > 0: dentro da UF base, so cobra estadia se
  //     distancia > raio E total_hours > tempo_max
  // Valores 0/null desativam a respectiva regra (comportamento antigo).
  const coverageRadius = Number(settings.coverage_radius_km ?? 0) || 0;
  const maxHoursNoStay = Number(settings.max_service_hours_no_stay ?? 0) || 0;

  if (
    settings.base_lat != null &&
    settings.base_lng != null &&
    (input.service_address_zip ||
      input.service_address_city ||
      input.service_address_street ||
      input.service_address_state)
  ) {
    let dest = await geocodeAddress({
      zip: input.service_address_zip,
      street: input.service_address_street,
      city: input.service_address_city,
      state: input.service_address_state,
    });

    // Jessica 16/07: se geocode falhou mas temos UF, cai no centro geografico
    // da UF (fallback estatico). Evita orcamento sair com deslocamento zerado
    // sem que ninguem perceba.
    if (!dest && input.service_address_state) {
      const uf = input.service_address_state.toUpperCase();
      const centroid = UF_CENTROIDS[uf];
      if (centroid) {
        dest = { ...centroid, source: "uf_centroid" as const };
        warnings.push(
          `Nao foi possivel geocodificar o endereco exato — usando centro geografico de ${uf} como referencia.`
        );
      }
    }

    if (dest) {
      travel_distance_km = await computeTravelDistance(
        settings.base_lat,
        settings.base_lng,
        dest.lat,
        dest.lng
      );

      // Regra de cobertura: dentro da UF base + dentro do raio -> sem deslocamento
      const withinCoverageRadius =
        sameStateAsBase &&
        coverageRadius > 0 &&
        travel_distance_km <= coverageRadius;

      if (withinCoverageRadius) {
        travel_cost = 0;
        warnings.push(
          `Atendimento a ${travel_distance_km.toFixed(1)} km — dentro do raio de cobertura de ${coverageRadius} km na UF base. Deslocamento nao cobrado.`
        );
      } else {
        travel_cost =
          Math.round(travel_distance_km * settings.price_per_km * 100) / 100;
      }
    } else {
      warnings.push(
        "Nao foi possivel geocodificar o endereco do cliente — deslocamento ficou zerado."
      );
    }
  } else if (
    settings.base_lat == null ||
    settings.base_lng == null
  ) {
    warnings.push(
      "Endereco base da Reallliza sem lat/lng — deslocamento ficou zerado. Configure em /configuracoes-globais."
    );
  }

  // Estadia
  let stay_count = 0;
  let stay_cost = 0;

  if (sameStateAsBase) {
    // Dentro da UF base: so cobra estadia se distancia > raio E tempo > tempo_max
    // (as duas condicoes precisam ser verdadeiras). Regra desativada se
    // qualquer dos parametros for 0.
    const overRadius = coverageRadius > 0 && travel_distance_km > coverageRadius;
    const overTime = maxHoursNoStay > 0 && total_hours > maxHoursNoStay;
    if (overRadius && overTime) {
      stay_count = Math.ceil(total_hours / 8);
      const daily = await loadStayRate(input.service_address_state as string);
      if (daily > 0) {
        stay_cost = Math.round(stay_count * daily * 100) / 100;
      } else {
        warnings.push(
          `Estadia aplicavel (${travel_distance_km.toFixed(1)} km > ${coverageRadius} km, ${total_hours}h > ${maxHoursNoStay}h) mas valor da UF ${input.service_address_state} nao cadastrado. Configure em /tabela-estadias.`
        );
      }
    }
  } else if (
    settings.base_state &&
    input.service_address_state
  ) {
    // Fora da UF base: comportamento antigo (1 diaria a cada 8h)
    stay_count = total_hours > 0 ? Math.ceil(total_hours / 8) : 0;
    if (stay_count > 0) {
      const daily = await loadStayRate(input.service_address_state);
      if (daily > 0) {
        stay_cost = Math.round(stay_count * daily * 100) / 100;
      } else {
        warnings.push(
          `Valor de estadia nao cadastrado para ${input.service_address_state}. Configure em /tabela-estadias.`
        );
      }
    }
  }

  // Horario especial: +25% (multiplier - 1) sobre subtotal_services
  let is_special_hour = false;
  let special_hour_extra = 0;
  if (input.service_date) {
    is_special_hour = await checkSpecialHour(
      input.service_date,
      input.service_time ?? null,
      settings
    );
    if (is_special_hour) {
      special_hour_extra =
        Math.round(
          subtotal_services * (settings.special_hour_multiplier - 1) * 100
        ) / 100;
    }
  }

  const total_amount =
    Math.round((subtotal_services + travel_cost + stay_cost + special_hour_extra) * 100) / 100;

  // Modalidade reallliza: sem repasse — valor inteiro fica com a Reallliza
  return {
    subtotal_services,
    total_hours,
    total_days,
    travel_distance_km: Math.round(travel_distance_km * 100) / 100,
    travel_cost,
    stay_count,
    stay_cost,
    is_special_hour,
    special_hour_extra,
    total_amount,
    platform_fee_pct: 0,
    platform_fee_amount: 0,
    payout_amount: 0,
    warnings,
  };
}
