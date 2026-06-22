"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  Search,
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  FileText,
  ClipboardList,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";

interface Client {
  key: string;
  name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  last_address: {
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  quotes_count: number;
  os_count: number;
  total_amount: number;
  last_activity_at: string;
  last_quote_id: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPhone(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

function formatDoc(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, "");
  if (d.length === 11)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<{ count: number; clients: Client[] }>(
        "/clientes"
      );
      setClients(data.clients);
    } catch (err) {
      console.error("Failed to load clients:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.document?.includes(term) ||
        c.phone?.includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  }, [clients, search]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Clientes
          </h1>
          <p className="text-muted-foreground">
            Sua carteira com histórico de orçamentos e OSs.
          </p>
        </div>
      </motion.div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={
            clients.length === 0
              ? "Nenhum cliente ainda"
              : "Nenhum resultado pra essa busca"
          }
          description={
            clients.length === 0
              ? "Os clientes vão aparecer aqui automaticamente conforme você gera orçamentos."
              : "Tente outro termo."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((c) => {
            const addr = c.last_address;
            const fullAddr = [
              [addr.street, addr.number].filter(Boolean).join(", "),
              addr.neighborhood,
              addr.city && addr.state ? `${addr.city}/${addr.state}` : addr.city,
            ]
              .filter(Boolean)
              .join(" • ");
            return (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{c.name}</h3>
                        {c.document && (
                          <p className="text-xs text-muted-foreground">
                            {formatDoc(c.document)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Última atividade
                        </p>
                        <p className="text-xs font-medium">
                          {formatDate(c.last_activity_at)}
                        </p>
                      </div>
                    </div>

                    {/* Contatos */}
                    <div className="space-y-1 text-xs">
                      {c.phone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {formatPhone(c.phone)}
                        </p>
                      )}
                      {c.whatsapp && c.whatsapp !== c.phone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <MessageCircle className="h-3 w-3" />
                          {formatPhone(c.whatsapp)}
                        </p>
                      )}
                      {c.email && (
                        <p className="flex items-center gap-1.5 truncate text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </p>
                      )}
                      {fullAddr && (
                        <p className="flex items-start gap-1.5 text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="break-words">{fullAddr}</span>
                        </p>
                      )}
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2 text-center">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Orçamentos
                        </p>
                        <p className="text-sm font-bold">{c.quotes_count}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          OSs
                        </p>
                        <p className="text-sm font-bold">{c.os_count}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Total
                        </p>
                        <p className="text-sm font-bold">
                          {formatBRL(c.total_amount)}
                        </p>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2">
                      <Link
                        href={`/orcamentos/${c.last_quote_id}`}
                        className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
                      >
                        <FileText className="mr-1 inline h-3 w-3" />
                        Último orçamento
                      </Link>
                      <Link
                        href={`/orcamentos/novo?prefill=${encodeURIComponent(c.key)}`}
                        className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Plus className="mr-1 inline h-3 w-3" />
                        Nova solicitação
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
