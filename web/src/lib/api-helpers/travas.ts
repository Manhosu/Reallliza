/**
 * Travas que não são chave estrangeira.
 *
 * O diagnóstico genérico (`dependentes_de`) responde "o que aponta para este
 * registro". Ele não sabe responder "este registro está num estado que não
 * permite sair" — uma manutenção em andamento, um pedido com unidade
 * reservada. Essas regras vivem aqui.
 *
 * Elas moram num arquivo só porque DOIS lugares precisam da mesma resposta: a
 * rota de exclusão, que recusa, e o pré-check `/admin/dependencias`, que
 * informa antes de a pessoa digitar o nome e clicar. Escrever a regra nos dois
 * seria escrever duas vezes, e a cópia da tela envelheceria em silêncio — é
 * exatamente assim que a rota antiga da OS passou a ignorar quatro tabelas.
 *
 * Aqui só entra o que BLOQUEIA. Aviso ("isto vai perder o vínculo") é outra
 * coisa e sai do próprio diagnóstico.
 */

export interface Trava {
  /** Campos que precisam ser lidos para avaliar. */
  select: string;
  /** Devolve o impedimento em português, ou nada. */
  avaliar: (registro: Record<string, unknown>) => string | null;
}

const PEDIDO_SEM_RESERVA = new Set(["pending", "rejected", "cancelled", "released"]);

export const TRAVAS: Record<string, Trava> = {
  /**
   * Abrir uma manutenção coloca a ferramenta em `maintenance`; quem devolve o
   * status é o encerramento dela. Apagar no meio do caminho apaga a única
   * coisa capaz de tirar a ferramenta desse estado — e não há tela nenhuma que
   * edite `tool_inventory.status` à mão. A ferramenta ficaria presa em
   * manutenção para sempre, sem sequer poder ser mandada para manutenção de
   * novo, porque a lista de disponíveis não a incluiria.
   *
   * O sinal de encerrada é `actual_return_at`, e não a coluna `status`. Essa
   * coluna existe, é NOT NULL e nasce em `awaiting_evaluation` — mas nenhuma
   * rota deste sistema a escreve: encerrar grava `actual_return_at`, `outcome`
   * e o custo final, e é aí que a ferramenta volta para o estoque. Olhar para
   * `status` bloquearia 100% das manutenções, inclusive as que a tela mostra
   * com o selo "Voltou" — a trava diria "encerre primeiro" sobre algo já
   * encerrado, que é pior do que não ter trava.
   */
  tool_maintenance: {
    select: "actual_return_at",
    avaliar: (r) =>
      r.actual_return_at
        ? null
        : "Não dá para excluir uma manutenção em andamento: a ferramenta está marcada como em manutenção e é o encerramento dela que devolve a ferramenta ao estoque. Encerre a manutenção primeiro — depois ela pode ser excluída.",
  },

  /**
   * Aprovar um pedido reserva unidades. Quem desfaz isso é rejeitar ou
   * cancelar, que devolve as unidades para `available`.
   *
   * Apagar o pedido não desfaz: `tool_units.reserved_for_request_id` é SET
   * NULL, então o vínculo some, mas o status continua `reserved` — e a
   * consulta de unidades disponíveis exige `available`. A unidade sumiria do
   * estoque sem estar com ninguém, e nada na interface a traria de volta.
   */
  tool_requests: {
    select: "status",
    avaliar: (r) =>
      PEDIDO_SEM_RESERVA.has(String(r.status ?? ""))
        ? null
        : "Não dá para excluir um pedido com unidades reservadas: elas ficariam marcadas como reservadas para um pedido que não existe mais e sumiriam do estoque. Cancele o pedido primeiro — o cancelamento devolve as unidades — e depois exclua.",
  },

  /**
   * Unidade em custódia o banco já barra — `tool_custody.unit_id` é RESTRICT.
   * Unidade RESERVADA, não: ainda não existe custódia, e
   * `tool_requests.unit_id` é SET NULL.
   *
   * O estrago aparece longe daqui: o pedido continua aprovado, agora sem
   * unidade, e a entrega falha com "Nenhuma unidade reservada para este
   * pedido" — mensagem impossível de ligar a uma exclusão feita dias antes em
   * outra tela.
   */
  tool_units: {
    select: "status, reserved_for_request_id",
    avaliar: (r) =>
      r.status === "reserved" || r.reserved_for_request_id
        ? "Não dá para excluir uma unidade reservada: há um pedido contando com ela, e a entrega desse pedido falharia sem explicação. Cancele ou conclua o pedido primeiro."
        : null,
  },
};
