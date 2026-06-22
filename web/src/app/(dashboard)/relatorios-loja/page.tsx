"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { quotesApi } from "@/lib/api";
import type { Quote } from "@/lib/api/quotes";

interface QuoteWithOs extends Quote {
  service_order_status?: string | null;
  service_order?: { status: string } | null;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

const COMPLETED_STATUSES = ["completed", "approved", "invoiced"];

export default function RelatoriosLojaPage() {
  const [quotes, setQuotes] = useState<QuoteWithOs[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = (await quotesApi.list()) as QuoteWithOs[];
      const completed = data.filter((q) => {
        const os = q.service_order_status ?? q.service_order?.status;
        return q.service_order_id && os && COMPLETED_STATUSES.includes(os);
      });
      setQuotes(completed);
    } catch (err) {
      console.error("Failed to load quotes:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = quotes.filter((q) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      q.client_name?.toLowerCase().includes(term) ||
      String(q.quote_number).includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Relatórios
        </h1>
        <p className="text-muted-foreground">
          Relatórios completos das OSs concluídas — timeline, etapas, fotos,
          assinaturas e avaliação.
        </p>
      </motion.div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número ou cliente..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="Nenhum relatório disponível"
          description="Os relatórios aparecem aqui quando uma OS é concluída."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        #{q.quote_number}
                      </span>
                      <span className="text-sm text-muted-foreground">·</span>
                      <span className="truncate text-sm font-medium">
                        {q.client_name}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Concluída em {formatDate(q.paid_at)}</span>
                      <span>·</span>
                      <span>{formatBRL(q.total_amount)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {q.service_order_id && (
                      <>
                        <Link
                          href={`/relatorios-loja/${q.service_order_id}`}
                          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          Ver detalhes
                        </Link>
                        <a
                          href={`/api/service-orders/${q.service_order_id}/report`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <ExternalLink className="h-3 w-3" />
                          PDF
                        </a>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
