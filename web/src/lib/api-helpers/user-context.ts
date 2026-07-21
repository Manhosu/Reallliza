import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enriquecimento do user autenticado com flags derivadas do profile
 * (professional_type, is_homologated). Usado no server pra decidir
 * redaction ou filtros que dependem de "homologado".
 *
 * Jessica 20/07: homologados nao podem ver valor unitario dos itens da
 * OS, so o valor da proposta aceita.
 */
export async function isUserHomologado(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("professional_type, is_homologated")
    .eq("id", userId)
    .maybeSingle();
  const p = data as {
    professional_type?: string | null;
    is_homologated?: boolean | null;
  } | null;
  return (
    p?.professional_type === "external" || p?.is_homologated === true
  );
}
