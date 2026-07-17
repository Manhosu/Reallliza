/**
 * Geocoder simples — converte endereco brasileiro em lat/lng.
 *
 * Estrategia em cascata (primeira que retornar ganha):
 *  1. Google Geocoding API (GOOGLE_MAPS_API_KEY) — precisao alta
 *  2. AwesomeAPI CEP coords (free, sem chave) — precisao razoavel
 *  3. null (caller decide)
 */

export interface GeocodeInput {
  zip?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: "google" | "awesomeapi" | "uf_centroid";
}

function buildAddressString(input: GeocodeInput): string {
  const parts = [
    input.street,
    input.city,
    input.state,
    input.zip,
    "Brasil",
  ].filter(Boolean);
  return parts.join(", ");
}

async function geocodeViaGoogle(
  input: GeocodeInput
): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const address = buildAddressString(input);
  if (!address) return null;

  const params = new URLSearchParams({
    address,
    key: apiKey,
    region: "br",
    language: "pt-BR",
  });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
      return { lat: loc.lat, lng: loc.lng, source: "google" };
    }
  } catch {
    /* fallback */
  }
  return null;
}

async function geocodeViaAwesomeApi(
  zip: string
): Promise<GeocodeResult | null> {
  const digits = zip.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(
      `https://cep.awesomeapi.com.br/json/${digits}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: string; lng?: string };
    const lat = parseFloat(data.lat ?? "");
    const lng = parseFloat(data.lng ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng, source: "awesomeapi" };
    }
  } catch {
    /* fallback */
  }
  return null;
}

export async function geocodeAddress(
  input: GeocodeInput
): Promise<GeocodeResult | null> {
  const google = await geocodeViaGoogle(input);
  if (google) return google;
  if (input.zip) {
    return geocodeViaAwesomeApi(input.zip);
  }
  return null;
}
