import { describe, expect, it } from "vitest";
import { classificar } from "./occupancy";

/**
 * classificar decide a cor de cada célula do mapa de disponibilidade.
 * Não existe capacidade explícita em lugar nenhum do sistema — o defeito
 * óbvio aqui seria uma equipe de 0 membros (sem cadastro completo) travar
 * em "livre" pra sempre, mesmo com agendamento real batido nela.
 */

describe("classificar (mapa de disponibilidade)", () => {
  it("zero agendamentos é sempre livre, mesmo sem capacidade", () => {
    expect(classificar(0, 5)).toBe("livre");
    expect(classificar(0, 0)).toBe("livre");
  });

  it("abaixo da capacidade da equipe é parcial", () => {
    expect(classificar(2, 5)).toBe("parcial");
  });

  it("na capacidade ou acima é total", () => {
    expect(classificar(5, 5)).toBe("total");
    expect(classificar(7, 5)).toBe("total");
  });

  it("técnico solo (capacidade 1) não tem estado parcial", () => {
    expect(classificar(1, 1)).toBe("total");
  });

  it("equipe sem membro cadastrado (capacidade 0) não trava em livre com agendamento real", () => {
    expect(classificar(1, 0)).toBe("total");
  });
});
