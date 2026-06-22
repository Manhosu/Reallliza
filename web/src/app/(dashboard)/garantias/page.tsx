"use client";

import { ShieldCheck } from "lucide-react";

export default function GarantiasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Garantias</h1>
        <p className="text-muted-foreground">
          Abertura e acompanhamento de garantias vinculadas a OSs concluídas.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Em breve — Fase 3</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Formulário para abrir solicitação de garantia vinculada a uma OS
          concluída (descrição, fotos, vídeos, observações).
        </p>
      </div>
    </div>
  );
}
