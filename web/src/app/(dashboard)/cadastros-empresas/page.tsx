"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Check, X, Clock, Mail, Phone, Store, Factory, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { companySignupApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
import { useExclusao } from "@/hooks/use-exclusao";
import { HardDeleteDialog } from "@/components/admin/hard-delete-dialog";
import type { CompanySignupRequest, CompanySignupStatus } from "@/lib/api/company-signup";

const STATUS_INFO: Record<CompanySignupStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  approved: { label: "Aprovado", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  rejected: { label: "Reprovado", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

const TIPO_INFO = {
  loja: { label: "Loja", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Store },
  fabricante: { label: "Fabricante", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400", icon: Factory },
};

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function CadastrosDeEmpresasPage() {
  const [requests, setRequests] = useState<CompanySignupRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [onlyPending, setOnlyPending] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [reprovando, setReprovando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const excl = useExclusao<CompanySignupRequest>("company_signup_requests", (r) => r.company_name);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await companySignupApi.list();
      setRequests(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar cadastros"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function aprovar(id: string) {
    setProcessing(id);
    try {
      await companySignupApi.decide(id, "approved");
      toast.success("Cadastro aprovado — acesso liberado automaticamente");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao aprovar"));
    } finally {
      setProcessing(null);
    }
  }

  async function reprovar(id: string) {
    setProcessing(id);
    try {
      await companySignupApi.decide(id, "rejected", motivo.trim() || undefined);
      toast.success("Cadastro reprovado");
      setReprovando(null);
      setMotivo("");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao reprovar"));
    } finally {
      setProcessing(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const visible = onlyPending ? requests.filter((r) => r.status === "pending") : requests;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Cadastros de Empresas</h1>
        <p className="text-muted-foreground">
          Lojas e fabricantes que se cadastraram sozinhos — {pendingCount} pendente(s).
        </p>
      </motion.div>

      <Card>
        <CardContent className="flex items-center justify-end gap-2 p-3">
          <button
            onClick={() => setOnlyPending(true)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              onlyPending ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Clock className="h-3.5 w-3.5" /> Pendentes
          </button>
          <button
            onClick={() => setOnlyPending(false)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              !onlyPending ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            Todos
          </button>
        </CardContent>
      </Card>

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
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={onlyPending ? "Nenhum cadastro pendente" : "Nenhum cadastro"}
            description="Cadastros de loja e fabricante feitos pela própria empresa aparecem aqui para análise."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {visible.map((r, idx) => {
              const st = STATUS_INFO[r.status] ?? STATUS_INFO.pending;
              const tipo = TIPO_INFO[r.company_type];
              const TipoIcon = tipo.icon;
              const decidable = r.status === "pending";
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                >
                  <Card>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <TipoIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{r.company_name}</p>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tipo.cls)}>
                              {tipo.label}
                            </span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>
                              {st.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>CNPJ {formatarCnpj(r.cnpj)}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(r.created_at).toLocaleDateString("pt-BR")}
                            </span>
                            {r.profile?.full_name && <span>Responsável: {r.profile.full_name}</span>}
                            {r.profile?.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {r.profile.email}
                              </span>
                            )}
                            {r.profile?.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {r.profile.phone}
                              </span>
                            )}
                            {(r.city_name || r.uf) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[r.city_name, r.uf].filter(Boolean).join(" — ")}
                              </span>
                            )}
                          </div>
                          {r.status === "rejected" && r.rejection_reason && (
                            <p className="mt-1 text-xs text-destructive">
                              Motivo da recusa: {r.rejection_reason}
                            </p>
                          )}
                        </div>
                        {decidable && reprovando !== r.id && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={processing === r.id}
                              onClick={() => aprovar(r.id)}
                            >
                              <Check className="h-3.5 w-3.5 text-green-600" /> Aprovar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={processing === r.id}
                              onClick={() => setReprovando(r.id)}
                            >
                              <X className="h-3.5 w-3.5 text-destructive" /> Reprovar
                            </Button>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void excl.abrir(r)}
                          title="Excluir permanentemente"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {reprovando === r.id && (
                        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                          <textarea
                            className="w-full rounded-md border border-input bg-background p-2 text-xs"
                            rows={2}
                            placeholder="Motivo da recusa (opcional)"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={processing === r.id}
                              onClick={() => reprovar(r.id)}
                            >
                              Confirmar recusa
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReprovando(null);
                                setMotivo("");
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
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
        {...excl.props("cadastro de empresa")}
        onConfirm={async () => {
          if (!excl.alvo) return;
          await apiClient.delete(`/company-signup/${excl.alvo.id}/purge`);
          load();
        }}
      />
    </div>
  );
}
