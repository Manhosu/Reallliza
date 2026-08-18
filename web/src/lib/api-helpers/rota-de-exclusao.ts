import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { excluirComDiagnostico } from "@/lib/api-helpers/exclusao";
import { TRAVAS } from "@/lib/api-helpers/travas";

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
  /**
   * O que precisa acontecer DEPOIS que o registro saiu.
   *
   * Existe por um caso concreto: a avaliação de qualidade é uma das fontes da
   * nota do profissional, e criar uma chama `recalculateTechnicianScore`.
   * Apagar não chamava nada — a nota continuava calculada em cima de uma
   * avaliação que não existe mais, e nada na tela indicava isso. Número errado
   * que ninguém consegue explicar é pior do que número ausente.
   *
   * Falha aqui não desfaz a exclusão (o registro já saiu) — é registrada e a
   * resposta segue. Um recálculo que falhou se corrige na próxima avaliação;
   * um 500 depois do DELETE faria a tela dizer que não excluiu algo que
   * excluiu.
   */
  aposExcluir?: (
    supabase: SupabaseClient,
    registro: T
  ) => Promise<void>;
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

      // Os campos da trava compartilhada entram no select sozinhos: exigir que
      // cada rota se lembre de pedi-los seria uma falha silenciosa — a trava
      // avaliaria `undefined` e deixaria passar.
      const campos = [opcoes.select, TRAVAS[opcoes.tabela]?.select]
        .filter(Boolean)
        .join(", ");

      const { data: registro } = await supabase
        .from(opcoes.tabela)
        .select(campos)
        .eq("id", id)
        .maybeSingle();

      if (!registro) throw new AuthError(404, "Registro não encontrado");

      const linha = registro as unknown as T;

      // A trava compartilhada primeiro: é a mesma que o pré-check consultou
      // para avisar antes de a pessoa digitar o nome.
      const compartilhada = TRAVAS[opcoes.tabela]?.avaliar(
        linha as Record<string, unknown>
      );
      if (compartilhada) throw new AuthError(409, compartilhada);

      const trava = opcoes.travaPropria?.(linha);
      if (trava) throw new AuthError(409, trava);

      const { levouJunto } = await excluirComDiagnostico(supabase, {
        tabela: opcoes.tabela,
        id,
        oQue: opcoes.oQue(linha),
      });

      if (opcoes.aposExcluir) {
        try {
          await opcoes.aposExcluir(supabase, linha);
        } catch (e) {
          console.error(
            `[${opcoes.acao}] o registro ${id} saiu, mas o pós-exclusão falhou:`,
            e
          );
        }
      }

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
