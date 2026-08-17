import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";

/**
 * Contrato único de exclusão.
 *
 * A Jéssica relatou que a OS "apresenta erro" ao excluir. O erro era violação
 * de chave estrangeira virando um 500 com a mensagem "Falha ao excluir OS" —
 * nada que dissesse o que estava segurando o registro. Em produção, 39 das 41
 * OS estão nessa situação: o botão quase nunca funciona, e quando não
 * funciona não explica.
 *
 * A regra aqui é simples: **antes de tentar apagar, descobrir o que impede, e
 * responder isso em português.** Nenhuma tela deve mais mostrar erro técnico
 * de banco.
 *
 * A descoberta é genérica — vem de `dependentes_de`, que lê o catálogo do
 * Postgres. Isso importa porque a rota antiga da OS listava os dependentes à
 * mão, com a lista escrita na migration 016, e nunca foi atualizada quando as
 * migrations seguintes acrescentaram outros. Lista escrita à mão envelhece
 * sem avisar.
 */

export interface Dependente {
  tabela: string;
  coluna: string;
  acao: "cascade" | "set_null" | "set_default" | "block";
  quantidade: number;
}

export interface Bloqueio {
  /** Como o usuário chama isso — "fatura emitida", não "invoices". */
  rotulo: string;
  quantidade: number;
  /** Por que este registro protege o outro. */
  motivo: string;
}

/**
 * Nome de tabela → como a pessoa que usa o sistema chama aquilo.
 *
 * Só precisa entrada para o que BLOQUEIA: o que cascateia some junto e não
 * interessa a quem está excluindo.
 */
const ROTULOS: Record<string, { singular: string; plural: string; motivo: string }> = {
  quotes: {
    singular: "orçamento",
    plural: "orçamentos",
    motivo: "o orçamento que originou este registro precisa continuar existindo para o histórico comercial fechar",
  },
  invoices: {
    singular: "fatura emitida",
    plural: "faturas emitidas",
    motivo: "documento fiscal não pode ser apagado junto",
  },
  warranties: {
    singular: "garantia aberta",
    plural: "garantias abertas",
    motivo: "a garantia se refere a este serviço e perderia o vínculo",
  },
  tool_custody: {
    singular: "custódia registrada",
    plural: "custódias registradas",
    motivo: "alguém já teve esta ferramenta em mãos",
  },
  tool_units: {
    singular: "unidade cadastrada",
    plural: "unidades cadastradas",
    motivo: "há unidades físicas vinculadas a este item",
  },
  tool_maintenance: {
    singular: "manutenção registrada",
    plural: "manutenções registradas",
    motivo: "o histórico de manutenção precisa ser preservado",
  },
  tool_retirements: {
    singular: "baixa registrada",
    plural: "baixas registradas",
    motivo: "baixa é registro definitivo de patrimônio",
  },
  service_order_items: {
    singular: "item de ordem de serviço",
    plural: "itens de ordem de serviço",
    motivo: "há ordens de serviço usando este cadastro",
  },
  service_orders: {
    singular: "ordem de serviço",
    plural: "ordens de serviço",
    motivo: "há ordens de serviço vinculadas",
  },
  feed_posts: {
    singular: "publicação",
    plural: "publicações",
    motivo: "há publicações vinculadas",
  },
  feed_campaigns: {
    singular: "campanha",
    plural: "campanhas",
    motivo: "há campanhas vinculadas",
  },
  payments: {
    singular: "pagamento",
    plural: "pagamentos",
    motivo: "movimentação financeira não pode ser apagada",
  },
  schedules: {
    singular: "agendamento",
    plural: "agendamentos",
    motivo: "há compromissos na agenda vinculados",
  },

  // As de baixo cascateiam. Só aparecem na lista de "vai junto", mas
  // aparecem — e "tool events" na tela não diz nada a ninguém.
  tool_events: {
    singular: "registro de histórico",
    plural: "registros de histórico",
    motivo: "some junto",
  },
  os_status_history: {
    singular: "mudança de situação",
    plural: "mudanças de situação",
    motivo: "some junto",
  },
  os_step_executions: {
    singular: "etapa executada",
    plural: "etapas executadas",
    motivo: "some junto",
  },
  photos: { singular: "foto", plural: "fotos", motivo: "some junto" },
  checklists: { singular: "checklist", plural: "checklists", motivo: "some junto" },
  os_messages: { singular: "mensagem", plural: "mensagens", motivo: "some junto" },
  team_members: { singular: "integrante", plural: "integrantes", motivo: "some junto" },
  feed_post_media: { singular: "mídia", plural: "mídias", motivo: "some junto" },
  feed_post_ctas: { singular: "botão de ação", plural: "botões de ação", motivo: "some junto" },
  technician_specialty_scores: {
    singular: "nota de especialidade",
    plural: "notas de especialidade",
    motivo: "some junto",
  },
};

function descrever(d: Dependente): Bloqueio {
  const r = ROTULOS[d.tabela];
  if (!r) {
    // Tabela sem rótulo: melhor um nome cru do que esconder o bloqueio.
    return {
      rotulo: d.tabela.replace(/_/g, " "),
      quantidade: d.quantidade,
      motivo: "há registros vinculados",
    };
  }
  return {
    rotulo: d.quantidade === 1 ? r.singular : r.plural,
    quantidade: d.quantidade,
    motivo: r.motivo,
  };
}

/** O que aponta para este registro, com a ação de cada chave. */
export async function lerDependentes(
  supabase: SupabaseClient,
  tabela: string,
  id: string
): Promise<Dependente[]> {
  const { data, error } = await supabase.rpc("dependentes_de", {
    p_tabela: tabela,
    p_id: id,
  });
  if (error) throw new Error(`Falha ao verificar dependências: ${error.message}`);
  return (data ?? []) as Dependente[];
}

export interface Diagnostico {
  podeExcluir: boolean;
  bloqueios: Bloqueio[];
  /** O que some junto, para o diálogo avisar antes. */
  levaJunto: Bloqueio[];
}

export async function diagnosticar(
  supabase: SupabaseClient,
  tabela: string,
  id: string
): Promise<Diagnostico> {
  const dependentes = await lerDependentes(supabase, tabela, id);
  const bloqueios = dependentes.filter((d) => d.acao === "block").map(descrever);
  const levaJunto = dependentes.filter((d) => d.acao === "cascade").map(descrever);
  return { podeExcluir: bloqueios.length === 0, bloqueios, levaJunto };
}

/**
 * Recusa a exclusão com 409 e a explicação pronta.
 *
 * 409 e não 500: o pedido é válido, o estado é que não permite. E a mensagem
 * termina sempre oferecendo a saída — desativar — porque quem está tentando
 * excluir precisa de alguma forma de tirar o registro da frente.
 */
export function recusarExclusao(bloqueios: Bloqueio[], oQue: string): never {
  const lista = bloqueios
    .map((b) => `${b.quantidade} ${b.rotulo}`)
    .join(", ")
    .replace(/, ([^,]*)$/, " e $1");

  const porques = [...new Set(bloqueios.map((b) => b.motivo))].join("; ");

  // Concordância importa: a mensagem é lida por quem está no meio de um teste
  // e já está irritado por não conseguir apagar.
  const total = bloqueios.reduce((a, b) => a + b.quantidade, 0);
  const vinculo = total === 1 ? "vinculado" : "vinculados";

  throw new AuthError(
    409,
    `Não dá para excluir ${oQue}: há ${lista} ${vinculo}. ${
      porques.charAt(0).toUpperCase() + porques.slice(1)
    }. Você pode desativar em vez de excluir — o registro sai das listas e o histórico continua.`
  );
}

/**
 * Verifica e apaga, ou recusa explicando. É o caminho único.
 *
 * Devolve o que foi levado junto, para a tela poder dizer "excluído, e com ele
 * 8 registros de histórico" em vez de só "excluído".
 */
export async function excluirComDiagnostico(
  supabase: SupabaseClient,
  opcoes: { tabela: string; id: string; oQue: string }
): Promise<{ levouJunto: Bloqueio[] }> {
  const { podeExcluir, bloqueios, levaJunto } = await diagnosticar(
    supabase,
    opcoes.tabela,
    opcoes.id
  );

  if (!podeExcluir) recusarExclusao(bloqueios, opcoes.oQue);

  const { error } = await supabase.from(opcoes.tabela).delete().eq("id", opcoes.id);
  if (error) {
    // Chegou aqui apesar do diagnóstico: algo mudou entre a checagem e a
    // exclusão, ou há uma trava que não é chave estrangeira. Melhor dizer isso
    // do que repetir "falha ao excluir".
    throw new AuthError(
      409,
      `Não foi possível excluir ${opcoes.oQue}. O banco recusou: ${error.message}`
    );
  }

  return { levouJunto: levaJunto };
}
