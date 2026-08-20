import { describe, expect, it } from "vitest";
import { calcularPrecoCampanha, type RegraDePreco } from "./pricing";

/**
 * O cálculo de preço é o único lugar que decide quanto uma loja/fabricante
 * paga por uma campanha. Um erro aqui é dinheiro errado cobrado ou uma
 * campanha que vai ao ar de graça sem ninguém perceber.
 */

const NACIONAL: RegraDePreco = {
  id: "regra-nacional",
  scope_type: "nacional",
  scope_kind: null,
  scope_value: null,
  price_per_day_cents: 5000,
  min_days: 1,
  is_active: true,
};

const REGIONAL_GENERICA: RegraDePreco = {
  id: "regra-regional",
  scope_type: "regional",
  scope_kind: null,
  scope_value: null,
  price_per_day_cents: 2000,
  min_days: 3,
  is_active: true,
};

const REGIONAL_SP: RegraDePreco = {
  id: "regra-sp",
  scope_type: "regional",
  scope_kind: "uf",
  scope_value: "SP",
  price_per_day_cents: 3500,
  min_days: 1,
  is_active: true,
};

describe("calcularPrecoCampanha", () => {
  it("multiplica preço por dia pela duração, na regra nacional", () => {
    const r = calcularPrecoCampanha(
      { coverage_type: "nacional", duration_days: 7 },
      [NACIONAL]
    );
    expect(r.total_cents).toBe(5000 * 7);
    expect(r.pricing_rule_id).toBe("regra-nacional");
    expect(r.days).toBe(7);
  });

  it("usa a regra específica da UF quando existe, em vez da genérica", () => {
    const r = calcularPrecoCampanha(
      { coverage_type: "regional", coverage_scope: "uf", coverage_value: "SP", duration_days: 5 },
      [REGIONAL_GENERICA, REGIONAL_SP]
    );
    expect(r.pricing_rule_id).toBe("regra-sp");
    expect(r.total_cents).toBe(3500 * 5);
  });

  it("cai para a regra regional genérica quando não há uma específica pra UF", () => {
    const r = calcularPrecoCampanha(
      { coverage_type: "regional", coverage_scope: "uf", coverage_value: "MG", duration_days: 4 },
      [REGIONAL_GENERICA, REGIONAL_SP]
    );
    expect(r.pricing_rule_id).toBe("regra-regional");
    expect(r.total_cents).toBe(2000 * 4);
  });

  it("recusa duração abaixo do mínimo da regra", () => {
    expect(() =>
      calcularPrecoCampanha(
        { coverage_type: "regional", coverage_scope: "uf", coverage_value: "RJ", duration_days: 2 },
        [REGIONAL_GENERICA]
      )
    ).toThrow(/mínimo/);
  });

  it("recusa regional sem UF/região informada", () => {
    expect(() =>
      calcularPrecoCampanha({ coverage_type: "regional", duration_days: 5 }, [REGIONAL_GENERICA])
    ).toThrow(/UF ou a região/);
  });

  it("recusa duração zero, negativa ou fracionária", () => {
    for (const dias of [0, -1, 2.5]) {
      expect(() =>
        calcularPrecoCampanha({ coverage_type: "nacional", duration_days: dias }, [NACIONAL])
      ).toThrow(/dias/);
    }
  });

  it("recusa quando não há nenhuma regra ativa pra abrangência", () => {
    expect(() =>
      calcularPrecoCampanha({ coverage_type: "nacional", duration_days: 5 }, [REGIONAL_GENERICA])
    ).toThrow(/Não há preço configurado/);
  });

  it("ignora regra inativa", () => {
    const inativa = { ...NACIONAL, is_active: false };
    expect(() =>
      calcularPrecoCampanha({ coverage_type: "nacional", duration_days: 5 }, [inativa])
    ).toThrow(/Não há preço configurado/);
  });
});
