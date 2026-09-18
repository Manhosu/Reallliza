import { describe, it, expect } from "vitest";
import {
  diasDoIntervalo,
  ehForaDoHorarioComercial,
  diaPermitido,
  DEFAULT_AVAILABILITY,
} from "./homologado-availability";

describe("diasDoIntervalo", () => {
  it("devolve um único dia quando dias=1", () => {
    expect(diasDoIntervalo("2026-09-19", 1)).toEqual(["2026-09-19"]);
  });

  it("devolve dias corridos consecutivos, sem pular fim de semana", () => {
    // 2026-09-19 é sábado
    expect(diasDoIntervalo("2026-09-19", 3)).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
  });

  it("atravessa virada de mês corretamente", () => {
    expect(diasDoIntervalo("2026-09-29", 4)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("trata dias<=0 como 1 dia", () => {
    expect(diasDoIntervalo("2026-09-19", 0)).toEqual(["2026-09-19"]);
  });
});

describe("ehForaDoHorarioComercial", () => {
  it("sem horário informado, nunca é noturno", () => {
    expect(ehForaDoHorarioComercial(null, "08:00", "18:00")).toBe(false);
  });

  it("dentro do horário comercial não é noturno", () => {
    expect(ehForaDoHorarioComercial("10:00", "08:00", "18:00")).toBe(false);
  });

  it("antes do início do horário comercial é noturno", () => {
    expect(ehForaDoHorarioComercial("06:30", "08:00", "18:00")).toBe(true);
  });

  it("no limite exato do fim do horário comercial já é noturno", () => {
    expect(ehForaDoHorarioComercial("18:00", "08:00", "18:00")).toBe(true);
  });

  it("depois do horário comercial é noturno", () => {
    expect(ehForaDoHorarioComercial("22:00", "08:00", "18:00")).toBe(true);
  });
});

describe("diaPermitido", () => {
  const feriados = new Set(["2026-12-25"]);

  it("com tudo habilitado, qualquer dia é permitido", () => {
    expect(diaPermitido("2026-09-20", DEFAULT_AVAILABILITY, feriados)).toBe(true); // domingo
    expect(diaPermitido("2026-09-19", DEFAULT_AVAILABILITY, feriados)).toBe(true); // sábado
    expect(diaPermitido("2026-12-25", DEFAULT_AVAILABILITY, feriados)).toBe(true); // feriado
  });

  it("domingo desativado bloqueia só domingo", () => {
    const s = { ...DEFAULT_AVAILABILITY, works_sunday: false };
    expect(diaPermitido("2026-09-20", s, feriados)).toBe(false); // domingo
    expect(diaPermitido("2026-09-19", s, feriados)).toBe(true); // sábado
  });

  it("sábado desativado bloqueia só sábado", () => {
    const s = { ...DEFAULT_AVAILABILITY, works_saturday: false };
    expect(diaPermitido("2026-09-19", s, feriados)).toBe(false); // sábado
    expect(diaPermitido("2026-09-21", s, feriados)).toBe(true); // segunda
  });

  it("feriado desativado bloqueia só a data do feriado", () => {
    const s = { ...DEFAULT_AVAILABILITY, works_holidays: false };
    expect(diaPermitido("2026-12-25", s, feriados)).toBe(false);
    expect(diaPermitido("2026-12-24", s, feriados)).toBe(true);
  });

  it("feriado que cai num sábado com só domingo desativado continua permitido", () => {
    // Feriado num sábado, só "works_sunday" desativado — não deve bloquear.
    const feriadoNoSabado = new Set(["2026-09-19"]);
    const s = { ...DEFAULT_AVAILABILITY, works_sunday: false };
    expect(diaPermitido("2026-09-19", s, feriadoNoSabado)).toBe(true);
  });
});
