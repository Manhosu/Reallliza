import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";

/**
 * Cálculo de preço de campanha do Feed.
 *
 * O valor nunca é confiado quando vem do cliente — é sempre recomputado
 * aqui a partir da cobertura e da duração, contra as regras que o admin
 * configurou. `calcularPrecoCampanha` é pura (recebe as regras já
 * carregadas) para ser testável sem mock de banco; `resolverPrecoCampanha`
 * busca as regras ativas e delega para ela.
 */

export type TipoDeAbrangencia = "nacional" | "regional";
export type EscopoRegional = "uf" | "regiao";

export interface EntradaDePreco {
  coverage_type: TipoDeAbrangencia;
  coverage_scope?: EscopoRegional | null;
  coverage_value?: string | null;
  duration_days: number;
}

export interface RegraDePreco {
  id: string;
  scope_type: TipoDeAbrangencia;
  scope_kind: EscopoRegional | null;
  scope_value: string | null;
  price_per_day_cents: number;
  min_days: number;
  is_active: boolean;
}

export interface ResultadoDePreco {
  pricing_rule_id: string;
  price_per_day_cents: number;
  total_cents: number;
  days: number;
}

function regraCasaComACobertura(regra: RegraDePreco, entrada: EntradaDePreco): boolean {
  if (!regra.is_active || regra.scope_type !== entrada.coverage_type) return false;
  if (entrada.coverage_type === "nacional") return true;
  // Regional: prioriza a regra específica (mesma UF/região); a genérica
  // (scope_kind nulo) serve de fallback quando não há uma sob medida.
  return regra.scope_kind === entrada.coverage_scope && regra.scope_value === entrada.coverage_value;
}

function regraGenericaRegional(regra: RegraDePreco): boolean {
  return regra.is_active && regra.scope_type === "regional" && regra.scope_kind === null;
}

export function calcularPrecoCampanha(
  entrada: EntradaDePreco,
  regras: RegraDePreco[]
): ResultadoDePreco {
  if (!Number.isInteger(entrada.duration_days) || entrada.duration_days <= 0) {
    throw new AuthError(400, "Informe por quantos dias a publicação vai ficar no ar.");
  }
  if (entrada.coverage_type === "regional" && (!entrada.coverage_scope || !entrada.coverage_value)) {
    throw new AuthError(400, "Escolha a UF ou a região da divulgação regional.");
  }

  const regra =
    regras.find((r) => regraCasaComACobertura(r, entrada)) ??
    (entrada.coverage_type === "regional" ? regras.find(regraGenericaRegional) : undefined);

  if (!regra) {
    throw new AuthError(
      400,
      "Não há preço configurado para essa abrangência. Configure em Configurações Globais → Preços do Feed."
    );
  }
  if (entrada.duration_days < regra.min_days) {
    throw new AuthError(400, `Essa abrangência exige no mínimo ${regra.min_days} dia(s).`);
  }

  return {
    pricing_rule_id: regra.id,
    price_per_day_cents: regra.price_per_day_cents,
    total_cents: regra.price_per_day_cents * entrada.duration_days,
    days: entrada.duration_days,
  };
}

export async function resolverPrecoCampanha(
  supabase: SupabaseClient,
  entrada: EntradaDePreco
): Promise<ResultadoDePreco> {
  const { data, error } = await supabase
    .from("feed_pricing_rules")
    .select("id, scope_type, scope_kind, scope_value, price_per_day_cents, min_days, is_active")
    .eq("is_active", true);

  if (error) throw new AuthError(500, "Falha ao carregar os preços do Feed.");
  return calcularPrecoCampanha(entrada, (data ?? []) as RegraDePreco[]);
}

export interface EstadoDeLiberacao {
  payment_status: string;
  approval_status: string;
}

/**
 * Portão: nenhuma campanha vai ao ar sem pagamento confirmado (ou isenção
 * de conta-casa) e aprovação editorial. Chamado tanto no PATCH de status da
 * campanha quanto em `POST /feed/[id]/publish` — a garantia real está no
 * publish, porque é ali que o conteúdo de fato aparece pra alguém.
 */
export function garantirCampanhaLiberada(campanha: EstadoDeLiberacao): void {
  if (campanha.payment_status === "pending") {
    throw new AuthError(402, "Esta campanha ainda não teve o pagamento confirmado.");
  }
  if (campanha.approval_status !== "approved") {
    throw new AuthError(409, "Esta campanha ainda não foi aprovada.");
  }
}

/** Confere que a UF/região escolhida existe de verdade, contra `br_ufs`. */
export async function validarValorDeCobertura(
  supabase: SupabaseClient,
  scope: EscopoRegional,
  value: string
): Promise<void> {
  if (scope === "uf") {
    const { data } = await supabase.from("br_ufs").select("uf").eq("uf", value).maybeSingle();
    if (!data) throw new AuthError(400, `UF "${value}" não reconhecida.`);
    return;
  }
  const { data } = await supabase.from("br_ufs").select("uf").eq("region", value).limit(1).maybeSingle();
  if (!data) throw new AuthError(400, `Região "${value}" não reconhecida.`);
}
