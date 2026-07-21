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
  Download,
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
          {/* Jessica 20/07: tela mostra o orçamento completo, igual ao PDF */}

          {/* Dados da Contratada + Contratante (lado a lado) */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-1 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Dados da Contratada
                </h2>
                <p className="pt-1 font-semibold">
                  {quote.company_settings?.legal_name ??
                    "Reallliza Revestimento Vinílico"}
                </p>
                {quote.company_settings?.cnpj && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {quote.company_settings.cnpj}
                  </p>
                )}
                {quote.company_settings?.base_address && (
                  <p className="text-xs text-muted-foreground">
                    {quote.company_settings.base_address}
                  </p>
                )}
                {quote.company_settings?.phone && (
                  <p className="text-xs text-muted-foreground">
                    {quote.company_settings.phone}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {quote.company_settings?.email ??
                    "comercial@reallliza.com.br"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Dados da Contratante
                </h2>
                <p className="pt-1 font-semibold">
                  {quote.partner?.company_name ?? "—"}
                </p>
                {quote.partner?.cnpj && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {quote.partner.cnpj}
                  </p>
                )}
                {quote.partner?.contact_phone && (
                  <p className="text-xs text-muted-foreground">
                    {quote.partner.contact_phone}
                  </p>
                )}
                {quote.partner?.contact_email && (
                  <p className="text-xs text-muted-foreground">
                    {quote.partner.contact_email}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tomador dos Serviços (Cliente Final) */}
          <Card>
            <CardContent className="space-y-1 p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                Dados do Tomador dos Serviços (Cliente Final)
              </h2>
              <p className="pt-1 font-semibold">{quote.client_name}</p>
              {quote.client_document && (
                <p className="text-xs text-muted-foreground">
                  CPF/CNPJ: {quote.client_document}
                </p>
              )}
              {(quote.address_street || quote.address_city) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    quote.address_street,
                    quote.address_number,
                    quote.address_neighborhood,
                    quote.address_city,
                    quote.address_state,
                    quote.address_zip,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {quote.client_phone && (
                <p className="text-xs text-muted-foreground">
                  Telefone: {quote.client_phone}
                </p>
              )}
              {quote.notes && (
                <p className="text-xs text-muted-foreground">
                  Obs: {quote.notes}
                </p>
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

              {/* Breakdown do calculo (Jessica 24/06): mostra sempre que
                  houver deslocamento, estadia ou horario especial > 0.
                  Copiado do preview da tela de novo orcamento pra ser
                  consistente com o que a loja viu na hora de gerar. */}
              {((quote.subtotal_services ?? 0) > 0 ||
                (quote.travel_cost ?? 0) > 0 ||
                (quote.stay_cost ?? 0) > 0 ||
                quote.is_special_hour) && (
                <div className="space-y-1 border-t pt-2 text-sm">
                  {(quote.subtotal_services ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal de serviços</span>
                      <span>{formatBRL(quote.subtotal_services ?? 0)}</span>
                    </div>
                  )}
                  {(quote.travel_cost ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        Deslocamento
                        {(quote.travel_distance_km ?? 0) > 0 && (
                          <span className="text-xs">
                            {" "}
                            ({(quote.travel_distance_km ?? 0).toFixed(1)} km · ida+volta)
                          </span>
                        )}
                      </span>
                      <span>{formatBRL(quote.travel_cost ?? 0)}</span>
                    </div>
                  )}
                  {(quote.stay_cost ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        Estadia
                        {(quote.stay_count ?? 0) > 0 && (
                          <span className="text-xs">
                            {" "}
                            ({quote.stay_count} {(quote.stay_count ?? 0) === 1 ? "diária" : "diárias"})
                          </span>
                        )}
                      </span>
                      <span>{formatBRL(quote.stay_cost ?? 0)}</span>
                    </div>
                  )}
                  {quote.is_special_hour && (quote.special_hour_extra ?? 0) > 0 && (
                    <div className="flex justify-between font-semibold text-amber-600 dark:text-amber-500">
                      <span>Horário especial (+25%)</span>
                      <span>{formatBRL(quote.special_hour_extra ?? 0)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatBRL(quote.total_amount)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Resumo da Contratação (4 caixas) — Jessica 20/07 */}
          {(quote.service_type ||
            quote.total_area_m2 ||
            quote.rooms ||
            quote.address_city) && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Resumo da Contratação
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Tipo de Serviço
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {quote.service_type ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Área Total
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {quote.total_area_m2
                        ? `${Number(quote.total_area_m2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Ambientes
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {quote.rooms ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Cidade
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {quote.address_city
                        ? `${quote.address_city}/${quote.address_state ?? "-"}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações da Execução + Observações Importantes */}
          {(quote.service_date ||
            quote.execution_start_date ||
            quote.total_days ||
            quote.material_description ||
            quote.important_notes) && (
            <div className="grid gap-4 md:grid-cols-2">
              {(quote.service_date ||
                quote.execution_start_date ||
                quote.total_days ||
                quote.material_description) && (
                <Card>
                  <CardContent className="space-y-2 p-5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                      Informações da Execução
                    </h2>
                    {(quote.execution_start_date || quote.service_date) && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Data prevista
                        </p>
                        <p className="text-sm">
                          {new Date(
                            (quote.execution_start_date ??
                              quote.service_date) + "T00:00:00"
                          ).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    )}
                    {quote.service_time && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Horário previsto
                        </p>
                        <p className="text-sm">
                          {String(quote.service_time).slice(0, 5)}
                        </p>
                      </div>
                    )}
                    {(quote.total_days ?? 0) > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Tempo estimado
                        </p>
                        <p className="text-sm">
                          {quote.total_days}{" "}
                          {Number(quote.total_days) === 1 ? "dia" : "dias"}
                        </p>
                      </div>
                    )}
                    {quote.material_description && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Material disponível no local
                        </p>
                        <p className="whitespace-pre-line text-sm">
                          {quote.material_description}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {quote.important_notes && (
                <Card>
                  <CardContent className="space-y-2 p-5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                      Observações Importantes
                    </h2>
                    <ul className="space-y-1 text-sm">
                      {String(quote.important_notes)
                        .split("\n")
                        .filter((l) => l.trim())
                        .map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Condições Gerais + Aceite */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Condições Gerais
                </h2>
                <ul className="space-y-1 text-sm">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      Este orçamento tem validade de 30 dias a partir da data
                      de emissão.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      Após aprovação, será emitida a ordem de serviço e
                      agendamento da execução.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      Pagamento conforme acordo comercial entre as partes.
                    </span>
                  </li>
                  {quote.general_notes && (
                    <li className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{quote.general_notes}</span>
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Aceite do Cliente
                </h2>
                <p className="pt-2 text-sm">____/____/______</p>
                <div className="mt-8 border-t border-muted-foreground/50 pt-1 text-center text-[10px] text-muted-foreground">
                  Assinatura e Carimbo
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pagamento + PDF */}
        <div className="space-y-4">
          {/* Botao Baixar PDF (Jessica 24/06) — visivel em qualquer status
              porque a loja pode querer o documento pra enviar ao cliente
              antes mesmo de pagar. */}
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-semibold">Documento</h2>
              <p className="text-xs text-muted-foreground">
                Baixe o orçamento em PDF para enviar ao cliente final ou
                arquivar.
              </p>
              <Button
                onClick={async () => {
                  try {
                    const { getAccessToken } = await import("@/lib/api/client");
                    const accessToken = await getAccessToken();
                    const res = await fetch(`/api/quotes/${id}/pdf`, {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (!res.ok) throw new Error("Erro ao gerar PDF");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    // Abre em nova aba (blob URL nao precisa de Authorization)
                    window.open(url, "_blank");
                    // Revoga depois de 1min pra liberar memoria
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Erro ao baixar PDF"
                    );
                  }
                }}
                className="w-full"
              >
                <Download className="h-4 w-4" />
                Baixar PDF do orçamento
              </Button>
            </CardContent>
          </Card>

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

          {/* Editar Proposta (Jessica 20/07) — so pra modalidade homologados
              e enquanto ninguem aceitou. */}
          {quote.modality === "homologados" &&
            (quote.status === "paid" || quote.status === "converted") && (
              <EditProposalCard
                quoteId={id}
                currentAmount={Number(quote.payout_amount ?? quote.total_amount ?? 0)}
                onEdited={load}
              />
            )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Editar Proposta (Jessica 20/07)
// ============================================================

function EditProposalCard({
  quoteId,
  currentAmount,
  onEdited,
}: {
  quoteId: string;
  currentAmount: number;
  onEdited: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newAmount, setNewAmount] = useState(String(currentAmount.toFixed(2)));
  const [submitting, setSubmitting] = useState(false);

  const parsedNew = Number(newAmount.replace(",", "."));
  const diff = Math.max(0, Math.round((parsedNew - currentAmount) * 100) / 100);

  async function handleSubmit() {
    const value = Number(newAmount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (value < currentAmount) {
      toast.error("Novo valor não pode ser menor que o atual");
      return;
    }
    setSubmitting(true);
    try {
      const { apiClient } = await import("@/lib/api/client");
      const res = await apiClient.post<{
        ok: boolean;
        checkout_url: string | null;
        needs_payment: boolean;
        new_amount: number;
        diff: number;
      }>(`/quotes/${quoteId}/edit-proposal`, { new_amount: value });
      if (res.checkout_url) {
        toast.success(
          "Redirecionando pro pagamento do valor adicional. Após confirmar, a proposta será republicada automaticamente."
        );
        window.location.href = res.checkout_url;
        return;
      }
      if (res.needs_payment) {
        toast.info(
          "Pagamento adicional registrado. Aguarde confirmação da Reallliza."
        );
      } else {
        toast.success("Proposta republicada aos homologados da região.");
      }
      setOpen(false);
      onEdited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao editar proposta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="font-semibold">Editar proposta</h2>
        <p className="text-xs text-muted-foreground">
          Ninguém aceitou ainda? Aumente o valor pra tornar a proposta mais
          atrativa. Você paga só a diferença antes da republicação.
        </p>
        {!open ? (
          <Button
            onClick={() => setOpen(true)}
            variant="outline"
            className="w-full"
          >
            Editar valor da proposta
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor atual</span>
                <span className="font-medium">
                  {currentAmount.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              {diff > 0 && (
                <div className="mt-1 flex justify-between text-primary">
                  <span>Diferença a pagar</span>
                  <span className="font-semibold">
                    {diff.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Novo valor da proposta
              </label>
              <input
                type="number"
                step="0.01"
                min={currentAmount}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                isLoading={submitting}
                className="flex-1"
              >
                {diff > 0 ? "Ir pro pagamento" : "Republicar"}
              </Button>
              <Button
                onClick={() => setOpen(false)}
                variant="outline"
                disabled={submitting}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
