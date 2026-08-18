import { describe, expect, it } from "vitest";
import { compilarRegra, RegraInvalida, type RegraAudiencia } from "./audience";

/**
 * O compilador de audiência é o lugar do sistema onde um erro é mais silencioso.
 *
 * Se ele deixar um valor entrar no texto do SQL, vira injeção — e a regra
 * continua funcionando para os casos comuns, então nada denuncia. Se ele
 * compilar um operador errado, a campanha vai para o público errado e a única
 * pista é um número de alcance que ninguém confere.
 *
 * Estes testes existem para o dia em que alguém acrescentar um operador.
 */

/** Todo valor precisa estar em `params`, nunca no texto. */
function nadaVazouParaOSql(sql: string, valores: string[]) {
  for (const v of valores) {
    expect(sql, `"${v}" apareceu no texto do SQL em vez de ir como parâmetro`).not.toContain(v);
  }
}

describe("compilarRegra — valores nunca entram no SQL", () => {
  it("manda o valor de eq como parâmetro", () => {
    const { sql, params } = compilarRegra({ field: "uf", op: "eq", value: "SP" });
    nadaVazouParaOSql(sql, ["SP"]);
    expect(params).toEqual(["SP"]);
  });

  it("resiste a valor com aspas e ponto e vírgula", () => {
    const veneno = "'; DROP TABLE profiles; --";
    const { sql, params } = compilarRegra({ field: "uf", op: "eq", value: veneno });
    nadaVazouParaOSql(sql, ["DROP TABLE", veneno]);
    expect(params).toEqual([veneno]);
  });

  it("manda lista de in como parâmetro único", () => {
    const { sql, params } = compilarRegra({
      field: "level",
      op: "in",
      values: ["ouro", "prata"],
    });
    nadaVazouParaOSql(sql, ["ouro", "prata"]);
    expect(params).toEqual([["ouro", "prata"]]);
  });

  it("numera os parâmetros na ordem em que aparecem", () => {
    const { params } = compilarRegra({
      op: "and",
      rules: [
        { field: "uf", op: "eq", value: "MG" },
        { field: "overall_score", op: "gte", value: 80 },
      ],
    });
    expect(params).toEqual(["MG", 80]);
  });
});

describe("compilarRegra — o que a gramática recusa", () => {
  it("recusa campo que não está no mapa", () => {
    expect(() =>
      compilarRegra({ field: "senha", op: "eq", value: "x" })
    ).toThrow(RegraInvalida);
  });

  it("recusa operador inexistente", () => {
    expect(() =>
      compilarRegra({ field: "uf", op: "parecido_com" as never, value: "SP" })
    ).toThrow(RegraInvalida);
  });

  it("recusa comparação numérica em campo de texto", () => {
    expect(() => compilarRegra({ field: "uf", op: "gt", value: 3 })).toThrow(RegraInvalida);
  });

  it("recusa valor não numérico em campo numérico", () => {
    expect(() =>
      compilarRegra({ field: "overall_score", op: "gte", value: "muito bom" })
    ).toThrow(RegraInvalida);
  });

  it("recusa contains_any em campo que não é lista", () => {
    expect(() =>
      compilarRegra({ field: "uf", op: "contains_any", values: ["a"] })
    ).toThrow(RegraInvalida);
  });

  it("recusa regra aninhada além do limite", () => {
    // Quatro níveis: and > and > and > critério.
    const fundo: RegraAudiencia = {
      op: "and",
      rules: [
        {
          op: "and",
          rules: [
            { op: "and", rules: [{ field: "uf", op: "eq", value: "SP" }] },
          ],
        },
      ],
    };
    expect(() => compilarRegra(fundo)).toThrow(RegraInvalida);
  });
});

describe("compilarRegra — os casos de borda que decidem quem recebe", () => {
  it("in com lista vazia não casa com ninguém", () => {
    expect(compilarRegra({ field: "level", op: "in", values: [] }).sql).toBe("false");
  });

  it("not_in com lista vazia casa com todo mundo", () => {
    expect(compilarRegra({ field: "level", op: "not_in", values: [] }).sql).toBe("true");
  });

  it("contains_any com lista vazia não casa com ninguém", () => {
    // Diferente do not_in: não faz sentido "tem interseção com nada" ser todos.
    expect(
      compilarRegra({ field: "specialty_id", op: "contains_any", values: [] }).sql
    ).toBe("false");
  });

  it("and sem nenhum critério é todo mundo", () => {
    expect(compilarRegra({ op: "and", rules: [] }).sql).toBe("true");
  });

  it("contains_any usa interseção e contains_all usa continência", () => {
    const any = compilarRegra({ field: "specialty_id", op: "contains_any", values: ["a"] }).sql;
    const all = compilarRegra({ field: "specialty_id", op: "contains_all", values: ["a"] }).sql;
    expect(any).toContain("&&");
    expect(all).toContain("@>");
  });

  it("eq em booleano distingue nulo de falso", () => {
    // `= false` não casaria com NULL; IS NOT DISTINCT FROM casa.
    const { sql } = compilarRegra({ field: "is_homologated", op: "eq", value: false });
    expect(sql).toContain("IS NOT DISTINCT FROM");
  });

  it("neq alcança quem tem o campo nulo", () => {
    // `<> 'x'` some com as linhas nulas; IS DISTINCT FROM as mantém.
    const { sql } = compilarRegra({ field: "uf", op: "neq", value: "SP" });
    expect(sql).toContain("IS DISTINCT FROM");
  });

  it("not nega o conjunto inteiro, não cada parte", () => {
    const { sql } = compilarRegra({
      op: "not",
      rules: [
        { field: "uf", op: "eq", value: "SP" },
        { field: "level", op: "eq", value: "ouro" },
      ],
    });
    expect(sql.startsWith("NOT (")).toBe(true);
    expect(sql).toContain(" AND ");
  });

  it("or separa as partes com OR", () => {
    const { sql } = compilarRegra({
      op: "or",
      rules: [
        { field: "uf", op: "eq", value: "SP" },
        { field: "uf", op: "eq", value: "RJ" },
      ],
    });
    expect(sql).toContain(" OR ");
  });
});
