"use client";

/**
 * Tela cheia mostrada no lugar do dashboard quando `profile.status !== 'active'`.
 *
 * Existe porque `authenticateRequest` agora bloqueia contas `pending`
 * (cadastro de empresa em análise) e `inactive` (desativada ou reprovada) em
 * TODA rota da API — sem esta tela, a pessoa veria a sidebar carregar e
 * depois cada card da tela quebrar com erro de permissão, um por um.
 *
 * A consulta ao motivo da recusa é feita DIRETO pelo client do navegador
 * (não pela nossa API, que já bloqueia esta conta) — só funciona porque
 * `company_signup_requests` tem uma policy de RLS que deixa o próprio
 * solicitante ler a própria linha (migration 080).
 */

import { useEffect, useState } from "react";
import { Building2, Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types";

interface Props {
  user: Profile;
  onSignOut: () => void;
}

export function AccountReviewGate({ user, onSignOut }: Props) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [ehCadastroDeEmpresa, setEhCadastroDeEmpresa] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();
    supabase
      .from("company_signup_requests")
      .select("status, rejection_reason")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado || !data) return;
        setEhCadastroDeEmpresa(true);
        if (data.status === "rejected") setMotivo(data.rejection_reason);
      });
    return () => {
      cancelado = true;
    };
  }, [user.id]);

  const pendente = user.status === "pending";

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border p-8 text-center">
        <div
          className={
            pendente
              ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive"
          }
        >
          {pendente ? <Clock className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
        </div>

        <h1 className="text-xl font-semibold">
          {pendente ? "Seu cadastro está em análise" : "Cadastro não aprovado"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {pendente ? (
            <>
              Recebemos seu cadastro e nossa equipe está analisando as informações.
              Você vai receber um aviso assim que a análise terminar.
            </>
          ) : ehCadastroDeEmpresa ? (
            <>
              Seu cadastro não foi aprovado pela Reallliza de acordo com as diretrizes da
              plataforma.
              {motivo && (
                <span className="mt-2 block rounded-lg bg-muted p-3 text-left text-xs">
                  <strong>Motivo:</strong> {motivo}
                </span>
              )}
            </>
          ) : (
            <>Sua conta foi desativada. Entre em contato com um administrador.</>
          )}
        </p>

        {ehCadastroDeEmpresa && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Cadastro de empresa
          </p>
        )}

        <Button variant="outline" className="w-full" onClick={onSignOut}>
          Sair
        </Button>
      </div>
    </div>
  );
}
