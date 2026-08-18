import type { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { excluirComDiagnostico } from "@/lib/api-helpers/exclusao";

/**
 * Construtor de rota de exclusão.
 *
 * Onze cadastros do sistema não tinham exclusão nenhuma — nem física nem
 * lógica. Escrever onze rotas à mão produziria onze cópias da mesma lógica,
 * que é exatamente como a rota da OS envelheceu: ela listava dependentes à
 * mão e nunca foi atualizada quando migrations novas acrescentaram outros.
 *
 * Aqui a lógica mora num lugar só. Cada rota fica com o que é próprio dela:
 * a tabela, quem pode excluir, e como o registro se chama na mensagem de
 * erro — porque "não dá para excluir o orçamento #42" é útil e "não dá para
 * excluir o registro" não é.
 */

interface Opcoes<T> {
  /** Tabela no banco. Precisa estar em CADASTROS_CONSULTAVEIS. */
  tabela: string;
  /** Campos a ler antes de excluir — para a mensagem e para a auditoria. */
  select: string;
  /** Como o registro é chamado na mensagem. Recebe a linha lida. */
  oQue: (registro: T) => string;
  /** Quem pode excluir. Padrão: só administrador. */
  papeis?: string[];
  /** Ação registrada na auditoria, ex.: "quote.deleted". */
  acao: string;
  /**
   * Trava extra, própria daquele cadastro, avaliada antes do diagnóstico
   * genérico. Devolve a mensagem do impedimento, ou nada.
   *
   * Serve para o caso em que a regra não é chave estrangeira: um agendamento
   * que já aconteceu, uma proposta já aceita. Chave estrangeira o diagnóstico
   * genérico já cobre.
   */
  travaPropria?: (registro: T) => string | null;
}

export function criarRotaDeExclusao<T extends Record<string, unknown>>(
  opcoes: Opcoes<T>
) {
  return async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    try {
      const user = await authenticateRequest(request);
      checkRole(user, opcoes.papeis ?? ["admin"]);

      const { id } = await params;
      const supabase = getAdminClient();

      const { data: registro } = await supabase
        .from(opcoes.tabela)
        .select(opcoes.select)
        .eq("id", id)
        .maybeSingle();

      if (!registro) throw new AuthError(404, "Registro não encontrado");

      const linha = registro as unknown as T;

      const trava = opcoes.travaPropria?.(linha);
      if (trava) throw new AuthError(409, trava);

      const { levouJunto } = await excluirComDiagnostico(supabase, {
        tabela: opcoes.tabela,
        id,
        oQue: opcoes.oQue(linha),
      });

      logAudit({
        userId: user.id,
        action: opcoes.acao,
        entityType: opcoes.tabela,
        entityId: id,
        oldData: linha as Record<string, unknown>,
      });

      return jsonResponse({ success: true, id, levou_junto: levouJunto });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
