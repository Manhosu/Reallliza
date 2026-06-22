"use client";

import { Clock } from "lucide-react";

export default function SolicitacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Solicitações</h1>
        <p className="text-muted-foreground">
          Acompanhe todas as suas solicitações com filtros por status.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Em breve — Fase 3</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta tela mostrará suas solicitações com filtros (aguardando pagamento/aceite,
          agendada, em execução, concluída, cancelada, garantia aberta).
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Enquanto isso, acompanhe pelos menus <strong>Orçamentos</strong> e{" "}
          <strong>Ordens de Serviço</strong>.
        </p>
      </div>
    </div>
  );
}
