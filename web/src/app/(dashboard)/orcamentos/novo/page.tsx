"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Minus, Plus, ArrowLeft, AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { servicesApi, quotesApi } from "@/lib/api";
import type { Service } from "@/lib/api/services";
import { ApiError } from "@/lib/api/client";
import { assertFreshSession } from "@/lib/api/session-guard";

const DRAFT_KEY = "orcamento-novo-draft-v1";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NovoOrcamentoPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServices(await servicesApi.list());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar serviços");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // BUG-001: restaura rascunho do orçamento (sessão expirada não perde dados).
  useEffect(() => {
    if (draftRestored) return;
    setDraftRestored(true);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        clientName?: string;
        clientPhone?: string;
        clientEmail?: string;
        addressStreet?: string;
        addressCity?: string;
        addressState?: string;
        addressZip?: string;
        notes?: string;
        quantities?: Record<string, number>;
      };
      if (d.clientName) setClientName(d.clientName);
      if (d.clientPhone) setClientPhone(d.clientPhone);
      if (d.clientEmail) setClientEmail(d.clientEmail);
      if (d.addressStreet) setAddressStreet(d.addressStreet);
      if (d.addressCity) setAddressCity(d.addressCity);
      if (d.addressState) setAddressState(d.addressState);
      if (d.addressZip) setAddressZip(d.addressZip);
      if (d.notes) setNotes(d.notes);
      if (d.quantities) setQuantities(d.quantities);
      toast.info("Rascunho restaurado", {
        description: "Continue de onde parou e clique em Gerar orçamento.",
        action: {
          label: "Limpar",
          onClick: () => localStorage.removeItem(DRAFT_KEY),
        },
      });
    } catch {
      /* rascunho corrompido — ignora */
    }
  }, [draftRestored]);

  function setQty(serviceId: string, qty: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[serviceId];
      else next[serviceId] = qty;
      return next;
    });
  }

  const selected = useMemo(
    () =>
      services
        .filter((s) => (quantities[s.id] ?? 0) > 0)
        .map((s) => ({
          service: s,
          quantity: quantities[s.id],
          subtotal: (s.commercial_price || 0) * quantities[s.id],
        })),
    [services, quantities]
  );

  const total = selected.reduce((s, i) => s + i.subtotal, 0);

  async function handleSubmit() {
    setError(null);
    if (!clientName.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (selected.length === 0) {
      setError("Selecione ao menos um serviço.");
      return;
    }
    setSaving(true);

    // BUG-001: salva rascunho antes do POST.
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          clientName, clientPhone, clientEmail,
          addressStreet, addressCity, addressState, addressZip,
          notes, quantities,
          savedAt: new Date().toISOString(),
        })
      );
    } catch { /* localStorage indisponível */ }

    const sessionCheck = await assertFreshSession();
    if (!sessionCheck.ok) {
      setSaving(false);
      toast.error("Sua sessão expirou. Faça login novamente.", {
        description: "Seu rascunho foi salvo — ele aparece quando você voltar.",
        duration: 8000,
      });
      router.push(`/login?redirectTo=${encodeURIComponent("/orcamentos/novo")}`);
      return;
    }

    try {
      const quote = await quotesApi.create({
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        client_email: clientEmail.trim() || undefined,
        address_street: addressStreet.trim() || undefined,
        address_city: addressCity.trim() || undefined,
        address_state: addressState.trim() || undefined,
        address_zip: addressZip.trim() || undefined,
        notes: notes.trim() || undefined,
        items: selected.map((i) => ({
          service_id: i.service.id,
          quantity: i.quantity,
        })),
      });
      toast.success("Orçamento criado");
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push(`/orcamentos/${quote.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Sua sessão expirou. Faça login novamente.", {
          description: "Seu rascunho foi salvo — ele aparece quando você voltar.",
          duration: 8000,
        });
        router.push(`/login?redirectTo=${encodeURIComponent("/orcamentos/novo")}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Erro ao criar orçamento");
    } finally {
      setSaving(false);
    }
  }

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
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Novo Orçamento
        </h1>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Catálogo */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-semibold">Serviços</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhum serviço no catálogo. Peça ao administrador para
                cadastrar serviços.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {services.map((s) => {
                const qty = quantities[s.id] ?? 0;
                return (
                  <Card key={s.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBRL(s.commercial_price || 0)} / {s.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => setQty(s.id, qty - 1)}
                          disabled={qty <= 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {qty}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => setQty(s.id, qty + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumo + cliente */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Dados do cliente</h2>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome do cliente"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Telefone"
                />
                <Input
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="E-mail"
                />
              </div>
              <Input
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="Endereço"
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="Cidade"
                  className="col-span-2"
                />
                <Input
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  placeholder="UF"
                />
              </div>
              <Input
                value={addressZip}
                onChange={(e) => setAddressZip(e.target.value)}
                placeholder="CEP"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Observações (opcional)"
                className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Resumo</h2>
              {selected.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum serviço selecionado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selected.map((i) => (
                    <div
                      key={i.service.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {i.quantity}× {i.service.name}
                      </span>
                      <span>{formatBRL(i.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                isLoading={saving}
                className="w-full"
              >
                Gerar orçamento
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
