"use client";

import { Users } from "lucide-react";

export default function ClientesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Clientes</h1>
        <p className="text-muted-foreground">
          Sua carteira de clientes com histórico de OSs.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Em breve — Fase 3</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CRM básico: listagem de clientes, dados de contato, histórico de
          orçamentos e OSs, e botão para abrir nova solicitação pré-preenchida.
        </p>
      </div>
    </div>
  );
}
