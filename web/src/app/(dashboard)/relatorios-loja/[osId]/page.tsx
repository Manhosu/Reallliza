"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Download, MapPin, User, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExecutionReportSection } from "@/components/os/ExecutionReportSection";
import { apiClient } from "@/lib/api/client";

interface OsBasic {
  id: string;
  order_number: number | null;
  title: string | null;
  status: string;
  client_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  started_at: string | null;
  completed_at: string | null;
  technician?: { full_name: string | null } | null;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function RelatorioLojaDetailPage({
  params,
}: {
  params: Promise<{ osId: string }>;
}) {
  const { osId } = use(params);
  const [os, setOs] = useState<OsBasic | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get<OsBasic>(`/service-orders/${osId}`)
      .then((data) => {
        if (!cancelled) setOs(data);
      })
      .catch(() => {
        if (!cancelled) setOs(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [osId]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/relatorios-loja"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Relatórios
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              {isLoading
                ? "Carregando..."
                : os
                  ? `OS #${os.order_number ?? "—"}`
                  : "OS não encontrada"}
            </h1>
            <p className="text-muted-foreground">
              {os?.title ?? "Relatório de execução completo"}
            </p>
          </div>
          {os && (
            <a
              href={`/api/service-orders/${osId}/report`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              Baixar PDF
            </a>
          )}
        </div>
      </motion.div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : os ? (
        <>
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cliente
                </p>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {os.client_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Executor
                </p>
                <p className="text-sm font-medium">
                  {os.technician?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Endereço
                </p>
                <p className="flex items-start gap-1.5 text-sm">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {[os.address_street, os.address_city, os.address_state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Início
                </p>
                <p className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDateTime(os.started_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Conclusão
                </p>
                <p className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDateTime(os.completed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <p className="text-sm font-medium">{os.status}</p>
              </div>
            </CardContent>
          </Card>

          {/* Componente Fase 1 reutilizado: KPIs + timeline + pausas */}
          <ExecutionReportSection osId={osId} />
        </>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Não foi possível carregar essa OS.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
