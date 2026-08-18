"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, Clock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { quotesApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
import type { Quote, QuoteStatus } from "@/lib/api/quotes";
import { HardDeleteDialog } from "@/components/admin/hard-delete-dialog";
import { useExclusao } from "@/hooks/use-exclusao";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_INFO: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  awaiting_payment: {
    label: "Aguardando pagamento",
    cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  },
  paid: {
    label: "Pago",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  converted: {
    label: "Em execução",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  cancelled: {
    label: "Cancelado",
    cls: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

export default function OrcamentosPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const user = useAuthStore((s) => s.user);
  // `/quotes/{id}/purge` só aceita admin. Parceiro vendo a lixeira clicaria e
  // levaria 403 — a pessoa conclui que o sistema quebrou, não que não pode.
  const isAdmin = user?.role === UserRole.ADMIN;

  // O número é o que a pessoa lê no card ("Orçamento #42"); pedir o UUID para
  // confirmar seria pedir para ela abrir o console.
  const excl = useExclusao<Quote>("quotes", (q) => `#${q.quote_number}`);
  const propsExclusao = excl.props("orçamento");

  /**
   * A OS que este orçamento gerou não aparece no diagnóstico.
   *
   * `quotes.service_order_id` é chave de SAÍDA (orçamento → OS), e o
   * diagnóstico genérico só lê o que aponta PARA o registro. Resultado: a OS
   * gerada é invisível ali. Na prática quase sempre há um pagamento segurando
   * o orçamento, mas quando não há, ele sai em silêncio e a OS viva fica sem o
   * registro comercial de origem.
   *
   * É aviso, não bloqueio: a OS continua existindo e funcionando, só perde a
   * referência de onde veio. Quem exclui precisa saber disso antes de digitar
   * o número.
   */
  const gerouOs = !!excl.alvo?.service_order_id;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setQuotes(await quotesApi.list());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Orçamentos
          </h1>
          <p className="text-muted-foreground">
            Monte um orçamento a partir do catálogo, pague e a OS é gerada
            automaticamente.
          </p>
        </div>
        <Link href="/orcamentos/novo">
          <Button>
            <Plus className="h-4 w-4" /> Novo Orçamento
          </Button>
        </Link>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-12 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Nenhum orçamento"
            description="Crie um orçamento escolhendo serviços do catálogo."
            action={
              <Link href="/orcamentos/novo">
                <Button>
                  <Plus className="h-4 w-4" /> Novo Orçamento
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {quotes.map((q, idx) => {
              const st = STATUS_INFO[q.status] ?? STATUS_INFO.draft;
              return (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                >
                  {/* O card inteiro era um <Link>. Como o botão Editar não pode
                      ficar aninhado dentro de âncora, o link virou overlay. */}
                  <Card hover className="relative">
                    <CardContent className="flex flex-wrap items-center gap-4 p-4">
                      <Link
                        href={`/orcamentos/${q.id}`}
                        className="absolute inset-0 z-0"
                        aria-label={`Abrir orçamento ${q.quote_number}`}
                      />
                      <div className="pointer-events-none flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="pointer-events-none min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            Orçamento #{q.quote_number}
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              st.cls
                            )}
                          >
                            {st.label}
                          </span>
                        </div>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(q.created_at).toLocaleDateString("pt-BR")}
                          {" · "}
                          {q.client_name}
                        </p>
                      </div>
                      <p className="pointer-events-none text-base font-semibold">
                        {formatBRL(q.total_amount)}
                      </p>
                      {/* Só antes de pago (Jessica 12/08). Depois disso o
                          orçamento é o registro que originou a OS. */}
                      {(q.status === "draft" || q.status === "awaiting_payment") && (
                        <Link
                          href={`/orcamentos/novo?id=${q.id}`}
                          className="relative z-10"
                        >
                          <Button size="sm" variant="outline">
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Editar
                          </Button>
                        </Link>
                      )}
                      {/* `relative z-10` pelo mesmo motivo do Editar: sem isso
                          o overlay do link engole o clique e abre o orçamento. */}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="relative z-10"
                          onClick={() => void excl.abrir(q)}
                          title="Excluir permanentemente"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <HardDeleteDialog
        {...propsExclusao}
        // "#42" não diz de quem é nem de quanto é. Cliente e valor são o que
        // a pessoa usa para reconhecer o orçamento — e são o que ela acabou
        // de ler no card antes de clicar na lixeira.
        entityHint={
          excl.alvo
            ? `${excl.alvo.client_name} · ${formatBRL(excl.alvo.total_amount)}`
            : undefined
        }
        // O aviso da OS gerada vai depois do que veio do servidor: bloqueio de
        // pagamento é o que decide se dá para excluir, então lê primeiro.
        dependencies={[
          ...propsExclusao.dependencies,
          ...(gerouOs
            ? [
                {
                  label:
                    "OS gerada por este orçamento — fica sem o registro de origem",
                  count: 1,
                  action: "set_null" as const,
                },
              ]
            : []),
        ]}
        onConfirm={async () => {
          if (!excl.alvo) return;
          await apiClient.delete(`/quotes/${excl.alvo.id}/purge`);
          load();
        }}
      />
    </div>
  );
}
