import { describe, expect, it } from "vitest";
import { pendingRequiredSteps } from "./payout";

/**
 * pendingRequiredSteps decide se um repasse pode ser liberado. O defeito
 * óbvio aqui seria inverter o default de `is_required` — se ausência de
 * metadata passasse a significar "não obrigatória", o release-payout
 * liberaria repasses com etapas reais ainda pendentes.
 */

describe("pendingRequiredSteps", () => {
  it("nenhuma pendência quando todas as etapas terminaram", () => {
    expect(
      pendingRequiredSteps([
        { status: "completed" },
        { status: "skipped" },
      ])
    ).toEqual([]);
  });

  it("etapa sem metadata conta como obrigatória (default true)", () => {
    const pendentes = pendingRequiredSteps([{ status: "in_progress" }]);
    expect(pendentes).toHaveLength(1);
  });

  it("etapa com is_required:false nunca bloqueia, mesmo pendente", () => {
    expect(
      pendingRequiredSteps([
        { status: "pending", metadata: { is_required: false } },
      ])
    ).toEqual([]);
  });

  it("etapa obrigatória e pendente bloqueia", () => {
    const pendentes = pendingRequiredSteps([
      { status: "pending", metadata: { is_required: true } },
    ]);
    expect(pendentes).toHaveLength(1);
  });

  it("skipped conta como terminada mesmo sendo obrigatória", () => {
    expect(
      pendingRequiredSteps([
        { status: "skipped", metadata: { is_required: true } },
      ])
    ).toEqual([]);
  });

  it("mistura: só a etapa obrigatória e não-terminada aparece", () => {
    const pendentes = pendingRequiredSteps([
      { status: "completed", metadata: { is_required: true } },
      { status: "pending", metadata: { is_required: false } },
      { status: "in_progress", metadata: { is_required: true } },
    ]);
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0].status).toBe("in_progress");
  });
});
