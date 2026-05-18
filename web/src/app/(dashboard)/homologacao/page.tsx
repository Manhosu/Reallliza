"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserCheck, Check, X, Clock, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { homologationApi } from "@/lib/api";
import type {
  HomologationRequest,
  HomologationStatus,
} from "@/lib/api/homologation";

const STATUS_INFO: Record<
  HomologationStatus,
  { label: string; cls: string }
> = {
  pending: {
    label: "Pendente",
    cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  },
  under_review: {
    label: "Em análise",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  approved: {
    label: "Aprovado",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  rejected: {
    label: "Reprovado",
    cls: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function HomologacaoPage() {
  const [requests, setRequests] = useState<HomologationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [onlyPending, setOnlyPending] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await homologationApi.list();
      setRequests(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar solicitações"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, status: "approved" | "rejected") {
    setProcessing(id);
    try {
      await homologationApi.decide(id, status);
      toast.success(
        status === "approved"
          ? "Profissional homologado"
          : "Solicitação reprovada"
      );
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao processar"));
    } finally {
      setProcessing(null);
    }
  }

  const pendingCount = requests.filter(
    (r) => r.status === "pending" || r.status === "under_review"
  ).length;

  const visible = onlyPending
    ? requests.filter(
        (r) => r.status === "pending" || r.status === "under_review"
      )
    : requests;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Homologação de Profissionais
        </h1>
        <p className="text-muted-foreground">
          Análise dos cadastros de profissionais autônomos —{" "}
          {pendingCount} pendente(s).
        </p>
      </motion.div>

      <Card>
        <CardContent className="flex items-center justify-end gap-2 p-3">
          <button
            onClick={() => setOnlyPending(true)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              onlyPending
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Clock className="h-3.5 w-3.5" /> Pendentes
          </button>
          <button
            onClick={() => setOnlyPending(false)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
              !onlyPending
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            Todas
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
            icon={<UserCheck className="h-6 w-6" />}
            title={
              onlyPending
                ? "Nenhuma solicitação pendente"
                : "Nenhuma solicitação"
            }
            description="Os cadastros de profissionais autônomos aparecem aqui para análise."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {visible.map((r, idx) => {
              const st = STATUS_INFO[r.status] ?? STATUS_INFO.pending;
              const decidable =
                r.status === "pending" || r.status === "under_review";
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                >
                  <Card>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {(r.profile?.full_name ?? "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {r.profile?.full_name ?? "—"}
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
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          {r.profile?.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {r.profile.email}
                            </span>
                          )}
                          {r.profile?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {r.profile.phone}
                            </span>
                          )}
                        </div>
                        {r.profile?.specialties &&
                          r.profile.specialties.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Especialidades:{" "}
                              {r.profile.specialties.join(", ")}
                            </p>
                          )}
                      </div>
                      {decidable && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={processing === r.id}
                            onClick={() => decide(r.id, "approved")}
                          >
                            <Check className="h-3.5 w-3.5 text-green-600" />{" "}
                            Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={processing === r.id}
                            onClick={() => decide(r.id, "rejected")}
                          >
                            <X className="h-3.5 w-3.5 text-destructive" />{" "}
                            Reprovar
                          </Button>
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
    </div>
  );
}
