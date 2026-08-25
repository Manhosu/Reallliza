import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/company-signup/{id}/purge
 *
 * Remove o registro da fila (pending/approved/rejected) — pedido da
 * Jéssica pra limpar cadastros de teste. Só apaga a solicitação em si:
 * se ela já tinha sido aprovada, o `partners`/`feed_sponsors`/`profiles`
 * provisionados continuam existindo (não são filhos desta tabela, então
 * não cascateiam) — limpar a empresa/conta de teste em si é outra ação,
 * coberta pela limpeza geral de dados de teste, não por este botão.
 */
export const DELETE = criarRotaDeExclusao<{ company_name?: string }>({
  tabela: "company_signup_requests",
  select: "id, company_name",
  oQue: (r) => `o cadastro de "${r.company_name}"`,
  acao: "company_signup_request.deleted",
});
