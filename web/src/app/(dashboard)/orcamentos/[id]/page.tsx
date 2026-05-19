"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  CreditCard,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { quotesApi } from "@/lib/api";
import type { Quote, QuoteStatus } from "@/lib/api/quotes";

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

export default function OrcamentoDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setQuote(await quotesApi.getById(id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePay() {
    setProcessing(true);
    try {
      const res = await quotesApi.pay(id);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      toast.success(
        "Pagamento registrado. Aguardando confirmação da Reallliza."
      );
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao pagar");
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirm() {
    setProcessing(true);
    try {
      await quotesApi.confirmPayment(id);
      toast.success("Pagamento confirmado — OS gerada");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar");
    } finally {
      setProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!quote) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Orçamento não encontrado.
        </CardContent>
      </Card>
    );
  }

  const st = STATUS_INFO[quote.status] ?? STATUS_INFO.draft;
  const isAdmin = user?.role === "admin";
  const canPay = quote.status === "draft" || quote.status === "awaiting_payment";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <Link
          href="/orcamentos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Orçamentos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Orçamento #{quote.quote_number}
          </h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              st.cls
            )}
          >
            {st.label}
          </span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Cliente */}
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-semibold">Cliente</h2>
              <p className="text-sm">{quote.client_name}</p>
              {quote.client_phone && (
                <p className="text-sm text-muted-foreground">
                  {quote.client_phone}
                </p>
              )}
              {(quote.address_street || quote.address_city) && (
                <p className="text-sm text-muted-foreground">
                  {[
                    quote.address_street,
                    quote.address_city,
                    quote.address_state,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {quote.notes && (
                <p className="text-sm text-muted-foreground">{quote.notes}</p>
              )}
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-semibold">Itens</h2>
              <div className="space-y-1.5">
                {(quote.items || []).map((it) => (
                  <div
                    key={it.id}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {it.quantity}× {it.service_name}
                    </span>
                    <span>{formatBRL(it.unit_price * it.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatBRL(quote.total_amount)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pagamento */}
        <div>
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-semibold">Pagamento</h2>

              {canPay && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ao pagar, a Ordem de Serviço é gerada e entra na fila de
                    execução.
                  </p>
                  <Button
                    onClick={handlePay}
                    isLoading={processing}
                    className="w-full"
                  >
                    <CreditCard className="h-4 w-4" /> Pagar e gerar OS
                  </Button>
                  {isAdmin && quote.status === "awaiting_payment" && (
                    <Button
                      onClick={handleConfirm}
                      isLoading={processing}
                      variant="outline"
                      className="w-full"
                    >
                      Confirmar pagamento manualmente
                    </Button>
                  )}
                </>
              )}

              {quote.status === "paid" && (
                <div className="flex items-start gap-2 rounded-xl bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  Pagamento confirmado — a OS está sendo gerada.
                </div>
              )}

              {quote.status === "converted" && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-xl bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Orçamento pago — Ordem de Serviço gerada.
                  </div>
                  {quote.service_order_id && isAdmin && (
                    <Link href={`/os/${quote.service_order_id}`}>
                      <Button variant="outline" className="w-full">
                        <FileText className="h-4 w-4" /> Ver Ordem de Serviço
                      </Button>
                    </Link>
                  )}
                </div>
              )}

              {quote.status === "cancelled" && (
                <p className="text-sm text-muted-foreground">
                  Orçamento cancelado.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
