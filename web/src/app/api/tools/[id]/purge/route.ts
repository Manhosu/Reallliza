import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { excluirComDiagnostico } from "@/lib/api-helpers/exclusao";

/**
 * DELETE /api/tools/[id]/purge
 *
 * Exclui a ferramenta, ou explica o que a segura.
 *
 * A rota nasceu em julho (D6, pedido da Jéssica) e nunca foi ligada a
 * nenhuma tela — foi o "não aparece o botão de excluir" que ela relatou
 * agora. E, se tivesse sido ligada como estava, não teria funcionado: o
 * comentário original prometia "cascata em tool_custody histórico +
 * tool_requests", mas a migration 058 endureceu essas chaves para RESTRICT
 * de propósito, e a exclusão passou a falhar por chave estrangeira em
 * qualquer ferramenta com histórico — ou seja, em todas as nove.
 *
 * O que mudou desde então: `tool_events` passou a cascatear (o registro de
 * que a ferramenta foi cadastrada não pode ser o que impede de apagá-la), e
 * a checagem do que bloqueia é feita antes, com a explicação pronta.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;

    const supabase = getAdminClient();
    const { data: t } = await supabase
      .from("tool_inventory")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!t) throw new AuthError(404, "Ferramenta nao encontrada");

    // Custódia em aberto tem mensagem própria: é acionável — basta devolver.
    // As demais travas caem no diagnóstico genérico abaixo.
    const { count: emMaos } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .eq("tool_id", id)
      .is("checked_in_at", null);
    if (emMaos && emMaos > 0) {
      throw new AuthError(
        409,
        "Esta ferramenta está em mãos de alguém. Registre a devolução antes de excluir."
      );
    }

    const { levouJunto } = await excluirComDiagnostico(supabase, {
      tabela: "tool_inventory",
      id,
      oQue: `a ferramenta "${(t as { name: string }).name}"`,
    });

    logAudit({
      userId: user.id,
      action: "tool.purged",
      entityType: "tool",
      entityId: id,
      newData: { name: (t as { name: string }).name },
    });
    return jsonResponse({ success: true, id, levou_junto: levouJunto });
  } catch (error) {
    return errorResponse(error);
  }
}
