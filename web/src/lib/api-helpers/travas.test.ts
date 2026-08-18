import { describe, expect, it } from "vitest";
import { TRAVAS } from "./travas";

/**
 * As travas de estado.
 *
 * Cada uma existe por um estrago concreto que só aparece longe do lugar onde
 * foi causado — uma ferramenta presa em manutenção para sempre, uma unidade
 * que some do estoque sem estar com ninguém, um pedido que falha na entrega
 * dias depois. Nenhum desses vira erro na hora da exclusão, então nada denuncia
 * se um estado for esquecido da lista.
 *
 * Os testes cobrem a tabela inteira de estados, e não só um caso feliz: o
 * defeito típico aqui é acrescentar um estado novo no fluxo e esquecer de
 * classificá-lo.
 */

function avaliar(tabela: string, registro: Record<string, unknown>) {
  return TRAVAS[tabela].avaliar(registro);
}

describe("tool_maintenance — manutenção em andamento não sai", () => {
  it("recusa enquanto a ferramenta não voltou", () => {
    const m = avaliar("tool_maintenance", { actual_return_at: null });
    expect(m).toBeTruthy();
    expect(m).toContain("encerramento");
  });

  it("libera depois que a ferramenta voltou", () => {
    expect(
      avaliar("tool_maintenance", { actual_return_at: "2026-08-17T12:00:00Z" })
    ).toBeNull();
  });

  it("ignora a coluna status, que ninguém escreve", () => {
    // `status` é NOT NULL e nasce em `awaiting_evaluation`, mas nenhuma rota a
    // atualiza — encerrar grava `actual_return_at`. Uma trava que olhasse para
    // `status` recusaria 100% das manutenções, inclusive as que a tela mostra
    // com o selo "Voltou": diria "encerre primeiro" sobre algo já encerrado.
    // Este teste falha se alguém voltar a decidir por `status`.
    expect(
      avaliar("tool_maintenance", {
        status: "awaiting_evaluation",
        actual_return_at: "2026-08-17T12:00:00Z",
      })
    ).toBeNull();
  });

  it("recusa quando o campo nem veio", () => {
    // Errar para o lado de recusar é reversível; errar para o lado de apagar
    // deixa a ferramenta presa em manutenção sem tela que a liberte.
    expect(avaliar("tool_maintenance", {})).toBeTruthy();
  });
});

describe("tool_requests — pedido com unidade reservada não sai", () => {
  const COM_RESERVA = ["approved", "separating", "awaiting_pickup", "delivered"];
  const SEM_RESERVA = ["pending", "rejected", "cancelled", "released"];

  it.each(COM_RESERVA)("recusa quando está em %s", (status) => {
    const m = avaliar("tool_requests", { status });
    expect(m).toBeTruthy();
    expect(m).toContain("Cancele o pedido primeiro");
  });

  it.each(SEM_RESERVA)("libera quando está em %s", (status) => {
    expect(avaliar("tool_requests", { status })).toBeNull();
  });

  it("recusa quando o status é desconhecido", () => {
    expect(avaliar("tool_requests", { status: "em_transito" })).toBeTruthy();
  });
});

describe("tool_units — unidade reservada não sai", () => {
  it("recusa unidade com status reserved", () => {
    expect(avaliar("tool_units", { status: "reserved" })).toBeTruthy();
  });

  it("recusa unidade que aponta para um pedido, qualquer que seja o status", () => {
    // O vínculo é o que importa: a chave é SET NULL, então apagar a unidade
    // limparia o `reserved_for_request_id` do pedido sem devolver nada, e a
    // entrega falharia depois com "nenhuma unidade reservada".
    expect(
      avaliar("tool_units", { status: "available", reserved_for_request_id: "req-1" })
    ).toBeTruthy();
  });

  it("libera unidade disponível e solta", () => {
    expect(
      avaliar("tool_units", { status: "available", reserved_for_request_id: null })
    ).toBeNull();
  });

  it("libera unidade danificada e solta", () => {
    // Custódia o banco já barra por conta própria (RESTRICT); aqui só cuidamos
    // do que ele deixaria passar.
    expect(
      avaliar("tool_units", { status: "damaged", reserved_for_request_id: null })
    ).toBeNull();
  });
});

describe("as travas cobrem exatamente as tabelas esperadas", () => {
  it("não ganhou nem perdeu tabela sem alguém notar", () => {
    // Trava nova sem teste passa despercebida; trava removida por engano
    // também. Esta lista é o lembrete.
    expect(Object.keys(TRAVAS).sort()).toEqual([
      "tool_maintenance",
      "tool_requests",
      "tool_units",
    ]);
  });

  it("toda trava declara os campos que precisa ler", () => {
    // Uma trava que esquece o `select` avalia `undefined` e libera tudo, em
    // silêncio — o pior modo de falha possível para uma trava.
    for (const [tabela, t] of Object.entries(TRAVAS)) {
      expect(t.select.trim().length, `${tabela} sem select`).toBeGreaterThan(0);
    }
  });
});
