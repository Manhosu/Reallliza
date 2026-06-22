"use client";

import { FileText } from "lucide-react";

export default function RelatoriosLojaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatórios</h1>
        <p className="text-muted-foreground">
          Relatórios completos das OSs concluídas.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Em breve — Fase 3</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualização do relatório completo da OS: timeline, etapas, fotos
          iniciais/finais, descrições, assinaturas e avaliação. Com botão de
          exportar PDF.
        </p>
      </div>
    </div>
  );
}
