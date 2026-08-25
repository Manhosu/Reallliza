import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

interface HomologationRow extends Record<string, unknown> {
  id: string;
  profile?: { full_name?: string } | { full_name?: string }[] | null;
}

/**
 * DELETE /api/homologation/{id}/purge
 *
 * Remove a solicitação da fila — mesmo motivo do purge de
 * company-signup: limpar cadastro de teste sem apagar a conta que a
 * aprovação já provisionou (`profiles.is_homologated` fica como está).
 */
export const DELETE = criarRotaDeExclusao<HomologationRow>({
  tabela: "homologation_requests",
  select: "id, profile:profiles!profile_id(full_name)",
  oQue: (r) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    return `a solicitação de "${p?.full_name ?? "profissional"}"`;
  },
  acao: "homologation_request.deleted",
});
