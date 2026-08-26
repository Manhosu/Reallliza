"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

interface VerificationResult {
  valid: boolean;
  order_number?: number;
  title?: string;
  client_name?: string;
  completed_at?: string;
  issued_at?: string;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function RelatorioVerificationPage() {
  const params = useParams<{ code: string }>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/relatorio/${params.code}`)
      .then((r) => r.json())
      .then((data) => setResult(data))
      .catch(() => setResult({ valid: false }))
      .finally(() => setLoading(false));
  }, [params.code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <div className="mb-6 flex justify-center">
          <span className="text-3xl font-bold">
            <span className="text-yellow-400">R</span>
            <span className="text-white">EALIZA</span>
          </span>
        </div>

        {loading ? (
          <div className="py-10">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
          </div>
        ) : result?.valid ? (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                <CheckCircle2 className="h-9 w-9 text-green-500" />
              </div>
            </div>
            <h1 className="text-lg font-bold text-white">Documento verificado</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Este é um Relatório Técnico de Execução e Termo de Garantia
              autêntico, emitido pela plataforma Realiza OS.
            </p>

            <div className="mt-6 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Ordem de Serviço
                </p>
                <p className="text-sm font-semibold text-white">
                  #{result.order_number} — {result.title}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Cliente
                </p>
                <p className="text-sm font-semibold text-white">{result.client_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Concluída em
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {fmtDate(result.completed_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Emitido em
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {fmtDate(result.issued_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              Código verificado diretamente na base da Realiza OS.
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
                <XCircle className="h-9 w-9 text-red-500" />
              </div>
            </div>
            <h1 className="text-lg font-bold text-white">Documento não encontrado</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Este código de verificação não corresponde a nenhum relatório
              emitido. Confira se o link ou QR Code foi copiado corretamente.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
