import { getAdminClient } from "@/lib/api-helpers/supabase-admin";

/**
 * Consulta a cobertura de UF (plataforma vs Reallliza).
 * Cache in-memory de 60s pra evitar hit no banco a cada request de quote.
 *
 * `platform` -> se a plataforma opera nessa UF (lojas + homologados)
 * `reallliza` -> se a Reallliza atende direto (modalidade 'reallliza')
 */

type Scope = "platform" | "reallliza";

const CACHE_TTL_MS = 60_000;
let cache: {
  loadedAt: number;
  platform: Set<string>;
  reallliza: Set<string>;
} | null = null;

async function loadCache() {
  const supabase = getAdminClient();
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase.from("platform_states").select("state, is_active"),
    supabase.from("reallliza_service_states").select("state, is_active"),
  ]);
  const platform = new Set(
    ((p ?? []) as Array<{ state: string; is_active: boolean }>)
      .filter((x) => x.is_active)
      .map((x) => x.state.toUpperCase())
  );
  const reallliza = new Set(
    ((r ?? []) as Array<{ state: string; is_active: boolean }>)
      .filter((x) => x.is_active)
      .map((x) => x.state.toUpperCase())
  );
  cache = { loadedAt: Date.now(), platform, reallliza };
}

async function getCache() {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
  return cache!;
}

export async function isStateAvailable(
  state: string | null | undefined,
  scope: Scope
): Promise<boolean> {
  if (!state) return false;
  const uf = state.toUpperCase();
  const c = await getCache();
  return scope === "platform" ? c.platform.has(uf) : c.reallliza.has(uf);
}

export async function getAvailability(
  state: string | null | undefined
): Promise<{ platform_available: boolean; reallliza_available: boolean }> {
  if (!state) {
    return { platform_available: false, reallliza_available: false };
  }
  const uf = state.toUpperCase();
  const c = await getCache();
  return {
    platform_available: c.platform.has(uf),
    reallliza_available: c.reallliza.has(uf),
  };
}

/** Chamado pelos endpoints PATCH pra invalidar o cache imediatamente. */
export function invalidateUfScopeCache() {
  cache = null;
}
