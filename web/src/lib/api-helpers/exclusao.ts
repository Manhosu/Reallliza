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
  checklists: {
    singular: "checklist preenchido",
    plural: "checklists preenchidos",
    // Estava como "some junto", escrito supondo cascata. A chave
    // `checklists.template_id` não tem cláusula ON DELETE, então é NO ACTION —
    // bloqueia. O diálogo imprimia "3 checklists — some junto — impede
    // exclusão", que se contradiz na mesma linha.
    motivo: "o modelo precisa continuar existindo para o checklist já respondido fazer sentido",
  },
  os_messages: { singular: "mensagem", plural: "mensagens", motivo: "some junto" },
  team_members: { singular: "integrante", plural: "integrantes", motivo: "some junto" },
  feed_post_media: { singular: "mídia", plural: "mídias", motivo: "some junto" },
  feed_post_ctas: { singular: "botão de ação", plural: "botões de ação", motivo: "some junto" },
  technician_specialty_scores: {
    singular: "nota de especialidade",
    plural: "notas de especialidade",
    motivo: "some junto",
  },
  quote_items: { singular: "item do orçamento", plural: "itens do orçamento", motivo: "some junto" },
  service_order_payments: {
    singular: "pagamento da OS",
    plural: "pagamentos da OS",
    motivo: "movimentação financeira não pode ser apagada",
  },
  accounts_payable: {
    singular: "conta a pagar",
    plural: "contas a pagar",
    motivo: "movimentação financeira não pode ser apagada",
  },
  accounts_receivable: {
    singular: "conta a receber",
    plural: "contas a receber",
    motivo: "movimentação financeira não pode ser apagada",
  },
  certifications: {
    singular: "certificado emitido",
    plural: "certificados emitidos",
    motivo: "certificado é conquista de quem o recebeu, não pode sumir junto",
  },
  os_projects: { singular: "projeto anexado", plural: "projetos anexados", motivo: "some junto" },
  checklist_items: { singular: "item do checklist", plural: "itens do checklist", motivo: "some junto" },
  course_modules: { singular: "módulo", plural: "módulos", motivo: "há módulos neste curso" },
  course_enrollments: {
    singular: "matrícula",
    plural: "matrículas",
    motivo: "há profissionais matriculados",
  },
  step_template_items: { singular: "etapa", plural: "etapas", motivo: "some junto" },
  feed_poll_votes: { singular: "voto", plural: "votos", motivo: "some junto" },
  feed_leads: { singular: "pedido recebido", plural: "pedidos recebidos", motivo: "há pedidos de contato vinculados" },
  quality_evaluation_scores: {
    singular: "nota da avaliação",
    plural: "notas da avaliação",
    motivo: "some junto",
  },

  // As de baixo aparecem por causa da categoria "desvincula": não somem, mas
  // perdem a referência. Sem rótulo, a tela mostrava o nome da tabela em
  // inglês no meio de uma frase em português.
  service_categories: {
    singular: "categoria de serviço",
    plural: "categorias de serviço",
    motivo: "ficam sem modelo de checklist padrão",
  },
  tool_requests: {
    singular: "pedido de ferramenta",
    plural: "pedidos de ferramenta",
    motivo: "ficam sem a unidade que estava reservada",
  },
  technician_locations: {
    singular: "registro de localização",
    plural: "registros de localização",
    motivo: "perdem o vínculo com o atendimento",
  },
  customer_ratings: {
    singular: "avaliação do cliente",
    plural: "avaliações do cliente",
    motivo: "perdem o vínculo com o atendimento",
  },
  professional_ratings: {
    singular: "avaliação do profissional",
    plural: "avaliações do profissional",
    motivo: "perdem o vínculo com o atendimento",
  },
};

/**
 * O que nunca some junto, mesmo quando a chave estrangeira manda cascatear.
 *
 * Descobri isto conferindo o catálogo antes de publicar: `payments.quote_id` é
 * CASCADE. Sem esta lista, excluir um orçamento apagaria os pagamentos dele em
 * silêncio — e o diagnóstico ainda diria "pode excluir", porque cascata é
 * exatamente o que ele classifica como inofensivo.
 *
 * A regra do sistema é que dinheiro e certificado não somem por efeito
 * colateral de outra exclusão. Onde a chave estrangeira discorda, quem manda é
 * esta lista: o dependente vira bloqueio e a pessoa recebe a explicação.
 *
 * Corrigir as chaves no banco seria o conserto de fundo, mas mexer em
 * `payments` em produção é risco maior do que o problema. A trava aqui vale
 * para todas as rotas de exclusão, que é por onde tudo passa.
 */
const NUNCA_SOME_JUNTO = new Set([
  "payments",
  "service_order_payments",
  "invoices",
  "accounts_payable",
  "accounts_receivable",
  "certifications",
]);

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
  /**
   * O que não some, mas perde o vínculo.
   *
   * Esta categoria faltava, e o buraco era silencioso: `set_null` não caía nem
   * em bloqueio nem em cascata, então simplesmente não chegava à tela. Excluir
   * um modelo de checklist deixava as categorias de serviço que o usavam com
   * `checklist_template_id` nulo sem nenhum aviso; excluir uma unidade de
   * ferramenta deixava o pedido que a reservava apontando para o vazio.
   *
   * Não impede a exclusão — desvincular costuma ser aceitável — mas quem
   * decide precisa saber.
   */
  desvincula: Bloqueio[];
}

export async function diagnosticar(
  supabase: SupabaseClient,
  tabela: string,
  id: string
): Promise<Diagnostico> {
  const dependentes = await lerDependentes(supabase, tabela, id);
  const protegido = (d: Dependente) => NUNCA_SOME_JUNTO.has(d.tabela);

  const bloqueios = dependentes
    .filter((d) => d.acao === "block" || protegido(d))
    .map(descrever);
  const levaJunto = dependentes
    .filter((d) => d.acao === "cascade" && !protegido(d))
    .map(descrever);
  const desvincula = dependentes
    .filter((d) => (d.acao === "set_null" || d.acao === "set_default") && !protegido(d))
    .map(descrever);

  return { podeExcluir: bloqueios.length === 0, bloqueios, levaJunto, desvincula };
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

  // Sem particípio no fim: "1 custódia registrada vinculado" tem o gênero
  // errado, e acertar exigiria marcar gênero em cada rótulo. A frase funciona
  // igual sem ele — e a mensagem é lida por quem está no meio de um teste,
  // já irritado por não conseguir apagar.
  throw new AuthError(
    409,
    `Não dá para excluir ${oQue}: há ${lista}. ${
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
