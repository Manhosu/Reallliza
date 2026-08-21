import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";

/**
 * Resolução de "dono" para o papel `sponsor` — mesmo padrão já usado pra
 * Partner (`partners.user_id` → `partners.id` → filtrar recurso), só que
 * `feed_sponsor_users` é N:N (uma pessoa pode gerenciar mais de uma marca),
 * então pega o primeiro vínculo em vez de exigir exatamente um.
 *
 * `checkRole` só confere que o papel está na allowlist — quem decide QUAL
 * patrocinador aquele usuário pode tocar é sempre esta função, nunca o que
 * o cliente manda no body. Um sponsor_id vindo do request nunca é confiado.
 */
export async function resolverSponsorDoUsuario(
  supabase: SupabaseClient,
  userId: string
): Promise<{ sponsor_id: string; role: "viewer" | "editor" | "admin" }> {
  const { data } = await supabase
    .from("feed_sponsor_users")
    .select("sponsor_id, role")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!data) {
    throw new AuthError(403, "Seu usuário não está vinculado a nenhum patrocinador.");
  }
  return data;
}

/** Confere se um post pertence ao sponsor — direto ou via a campanha dele. */
export async function postPertenceAoSponsor(
  supabase: SupabaseClient,
  postId: string,
  sponsorId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("feed_posts")
    .select("sponsor_id, campaign:feed_campaigns(sponsor_id)")
    .eq("id", postId)
    .maybeSingle();
  if (!data) return false;

  const registro = data as { sponsor_id?: string | null; campaign?: { sponsor_id?: string } | null };
  const dono = registro.campaign?.sponsor_id ?? registro.sponsor_id;
  return dono === sponsorId;
}
