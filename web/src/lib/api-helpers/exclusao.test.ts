import { describe, expect, it, vi } from "vitest";
import { diagnosticar, excluirComDiagnostico, recusarExclusao } from "./exclusao";

/**
 * O contrato de exclusão.
 *
 * A regra que este arquivo protege: **dinheiro e certificado nunca somem por
 * efeito colateral de outra exclusão.** Ela vive numa lista de nomes de tabela
 * dentro de `exclusao.ts`, e listas de nome são exatamente o que apodrece — a
 * chave `payments.quote_id` é CASCADE no banco, então quem apagar a linha
 * `payments` da lista faz o sistema voltar a apagar pagamento em silêncio, sem
 * nenhum sintoma até o dia do fechamento.
 *
 * Os testes falam com um cliente Supabase falso: só o `rpc` importa, porque é
 * de lá que vem o diagnóstico.
 */

type Dep = { tabela: string; coluna: string; acao: string; quantidade: number };

function clienteCom(dependentes: Dep[], erroAoApagar?: string) {
  const apagou = vi.fn();
  const cliente = {
    rpc: vi.fn().mockResolvedValue({ data: dependentes, error: null }),
    from: () => ({
      delete: () => ({
        eq: (_c: string, id: string) => {
          apagou(id);
          return Promise.resolve({
            error: erroAoApagar ? { message: erroAoApagar } : null,
          });
        },
      }),
    }),
  };
  // O helper só usa `rpc` e `from().delete().eq()`; o resto do SupabaseClient
  // não entra no caminho.
  return { cliente: cliente as never, apagou };
}

const dep = (tabela: string, acao: string, quantidade = 1): Dep => ({
  tabela,
  coluna: "x_id",
  acao,
  quantidade,
});

describe("diagnosticar — como cada dependente é classificado", () => {
  it("chave que bloqueia impede a exclusão", async () => {
    const { cliente } = clienteCom([dep("invoices", "block", 2)]);
    const d = await diagnosticar(cliente, "service_orders", "id-1");
    expect(d.podeExcluir).toBe(false);
    expect(d.bloqueios).toHaveLength(1);
  });

  it("cascata não impede, mas é anunciada", async () => {
    const { cliente } = clienteCom([dep("photos", "cascade", 8)]);
    const d = await diagnosticar(cliente, "service_orders", "id-1");
    expect(d.podeExcluir).toBe(true);
    expect(d.levaJunto).toHaveLength(1);
    expect(d.levaJunto[0].quantidade).toBe(8);
  });

  it("set_null não impede, mas aparece como desvínculo", async () => {
    // Esta categoria não existia: `set_null` não caía nem em bloqueio nem em
    // cascata e simplesmente não chegava à tela. Excluir um modelo de checklist
    // deixava categorias de serviço sem modelo padrão, sem nenhum aviso.
    const { cliente } = clienteCom([dep("service_categories", "set_null", 3)]);
    const d = await diagnosticar(cliente, "checklist_templates", "id-1");
    expect(d.podeExcluir).toBe(true);
    expect(d.desvincula).toHaveLength(1);
    expect(d.levaJunto).toHaveLength(0);
    expect(d.bloqueios).toHaveLength(0);
  });

  it("sem dependente nenhum, pode excluir", async () => {
    const { cliente } = clienteCom([]);
    const d = await diagnosticar(cliente, "tool_inventory", "id-1");
    expect(d.podeExcluir).toBe(true);
    expect([...d.bloqueios, ...d.levaJunto, ...d.desvincula]).toHaveLength(0);
  });
});

describe("diagnosticar — o que nunca some junto", () => {
  it("pagamento em cascata vira bloqueio", async () => {
    // `payments.quote_id` é CASCADE no banco. Sem a trava, excluir um
    // orçamento apagaria os pagamentos dele e o diagnóstico ainda diria
    // "pode excluir", porque cascata é o que ele classifica como inofensivo.
    const { cliente } = clienteCom([dep("payments", "cascade", 1)]);
    const d = await diagnosticar(cliente, "quotes", "id-1");
    expect(d.podeExcluir).toBe(false);
    expect(d.levaJunto).toHaveLength(0);
  });

  it("pagamento da OS em cascata vira bloqueio", async () => {
    const { cliente } = clienteCom([dep("service_order_payments", "cascade", 2)]);
    const d = await diagnosticar(cliente, "service_orders", "id-1");
    expect(d.podeExcluir).toBe(false);
  });

  it("certificado emitido vira bloqueio mesmo desvinculando", async () => {
    const { cliente } = clienteCom([dep("certifications", "set_null", 1)]);
    const d = await diagnosticar(cliente, "courses", "id-1");
    expect(d.podeExcluir).toBe(false);
    expect(d.desvincula).toHaveLength(0);
  });

  it("fatura, contas a pagar e a receber também bloqueiam", async () => {
    for (const t of ["invoices", "accounts_payable", "accounts_receivable"]) {
      const { cliente } = clienteCom([dep(t, "cascade", 1)]);
      const d = await diagnosticar(cliente, "service_orders", "id-1");
      expect(d.podeExcluir, `${t} deveria bloquear`).toBe(false);
    }
  });
});

describe("a mensagem que a pessoa lê", () => {
  it("lista um bloqueio sem vírgula solta", () => {
    expect(() => recusarExclusao([{ rotulo: "fatura emitida", quantidade: 1, motivo: "documento fiscal não pode ser apagado" }], "esta OS"))
      .toThrowError(/há 1 fatura emitida\. Documento fiscal/);
  });

  it("junta dois bloqueios com “e”, não com vírgula", () => {
    let msg = "";
    try {
      recusarExclusao(
        [
          { rotulo: "orçamento", quantidade: 1, motivo: "histórico comercial" },
          { rotulo: "garantias abertas", quantidade: 2, motivo: "perderia o vínculo" },
        ],
        "esta OS"
      );
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("1 orçamento e 2 garantias abertas");
  });

  it("não repete o mesmo motivo duas vezes", () => {
    let msg = "";
    try {
      recusarExclusao(
        [
          { rotulo: "pagamento", quantidade: 1, motivo: "movimentação financeira não pode ser apagada" },
          { rotulo: "fatura emitida", quantidade: 1, motivo: "movimentação financeira não pode ser apagada" },
        ],
        "este orçamento"
      );
    } catch (e) {
      msg = (e as Error).message;
    }
    // Minúsculas na comparação porque o primeiro motivo da frase entra
    // capitalizado.
    const vezes = msg.toLowerCase().split("movimentação financeira").length - 1;
    expect(vezes).toBe(1);
  });

  it("sempre termina oferecendo desativar", () => {
    let msg = "";
    try {
      recusarExclusao([{ rotulo: "orçamento", quantidade: 1, motivo: "histórico" }], "esta OS");
    } catch (e) {
      msg = (e as Error).message;
    }
    // Quem está tentando excluir precisa de alguma forma de tirar o registro
    // da frente. Recusa sem saída é beco.
    expect(msg).toContain("desativar");
  });
});

describe("excluirComDiagnostico", () => {
  it("não chega a apagar quando há bloqueio", async () => {
    const { cliente, apagou } = clienteCom([dep("invoices", "block", 1)]);
    await expect(
      excluirComDiagnostico(cliente, { tabela: "service_orders", id: "id-1", oQue: "esta OS" })
    ).rejects.toThrow(/Não dá para excluir esta OS/);
    expect(apagou).not.toHaveBeenCalled();
  });

  it("apaga e devolve o que foi junto", async () => {
    const { cliente, apagou } = clienteCom([dep("photos", "cascade", 4)]);
    const r = await excluirComDiagnostico(cliente, {
      tabela: "service_orders",
      id: "id-1",
      oQue: "esta OS",
    });
    expect(apagou).toHaveBeenCalledWith("id-1");
    expect(r.levouJunto[0].quantidade).toBe(4);
  });

  it("traduz recusa do banco em 409 explicado, não em “falha ao excluir”", async () => {
    // Acontece quando algo muda entre a checagem e a exclusão, ou quando a
    // trava não é chave estrangeira.
    const { cliente } = clienteCom([], 'violates check constraint "x"');
    await expect(
      excluirComDiagnostico(cliente, { tabela: "quotes", id: "id-1", oQue: "o orçamento #42" })
    ).rejects.toThrow(/O banco recusou/);
  });
});
