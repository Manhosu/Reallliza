import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escopo de equipe do tecnico.
 *
 * Jessica 10/08: a conversao de orcamento pago atribui a OS a uma EQUIPE
 * (`service_orders.team_id`) e deixa `technician_id` NULL de proposito — a
 * migration 054 tornou o campo nullable justamente porque "a equipe distribui
 * internamente". So' que todas as leituras do app filtravam por
 * `technician_id = user.id`, entao a OS nao aparecia pra ninguem.
 *
 * Estas funcoes resolvem as equipes do usuario pra que as rotas consultadas
 * pelo app enxerguem tambem as OS/agendamentos da equipe dele.
 */

/** IDs das equipes das quais o usuario e' membro. Vazio se nao for de nenhuma. */
export async function getUserTeamIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("technician_id", userId);

  if (error) {
    // Falha aqui nao pode derrubar a listagem: degrada pro escopo individual.
    console.error(`getUserTeamIds(${userId}): ${error.message}`);
    return [];
  }
  return ((data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id);
}

/**
 * Filtro PostgREST `.or()` que cobre "minhas OS" + "OS das minhas equipes".
 *
 * Devolve `null` quando o usuario nao pertence a equipe alguma — nesse caso o
 * caller deve manter o `.eq("technician_id", userId)` de sempre, que e' mais
 * barato que um `or` de um termo so'.
 *
 * @param extraParts termos adicionais a incluir no OR (ex.: `partner_id.eq.X`)
 */
export function buildTeamScopeFilter(
  userId: string,
  teamIds: string[],
  extraParts: string[] = []
): string | null {
  const parts = [`technician_id.eq.${userId}`, ...extraParts];
  if (teamIds.length > 0) {
    parts.push(`team_id.in.(${teamIds.join(",")})`);
  }
  return parts.length > 1 ? parts.join(",") : null;
}

/**
 * O usuario pode ver/mexer nesta OS como tecnico?
 * Verdadeiro se ele e' o responsavel direto OU membro da equipe dona da OS.
 */
export async function canTechnicianAccessOs(
  supabase: SupabaseClient,
  userId: string,
  os: { technician_id?: string | null; team_id?: string | null }
): Promise<boolean> {
  if (os.technician_id && os.technician_id === userId) return true;
  if (!os.team_id) return false;

  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("technician_id", userId)
    .eq("team_id", os.team_id)
    .maybeSingle();

  if (error) {
    console.error(`canTechnicianAccessOs(${userId}, ${os.team_id}): ${error.message}`);
    return false;
  }
  return !!data;
}

/** IDs dos membros de uma equipe — usado pro fanout de notificacao. */
export async function getTeamMemberIds(
  supabase: SupabaseClient,
  teamId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("technician_id")
    .eq("team_id", teamId);

  if (error) {
    console.error(`getTeamMemberIds(${teamId}): ${error.message}`);
    return [];
  }
  return ((data ?? []) as Array<{ technician_id: string }>).map(
    (r) => r.technician_id
  );
}
