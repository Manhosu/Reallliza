"use client";

import { Wallet } from "lucide-react";

export default function FinanceiroLojaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Financeiro</h1>
        <p className="text-muted-foreground">
          Pagamentos, custódia, repasses e comprovantes.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Em breve — Fase 3</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cards com Total pago no mês, Em custódia (modalidade Homologados),
          Liberados e Pendentes. Tabela de pagamentos com filtros e links pra
          comprovantes do Asaas.
        </p>
      </div>
    </div>
  );
}
