"use client";

/**
 * Portal do Patrocinador.
 *
 * A tela única de quem loga como `sponsor`: lista as próprias publicações
 * (a Karol pensa em "campanha" e "publicação" como a mesma coisa — aqui
 * também) e deixa criar uma nova, sem nenhum botão de administração (aprovar,
 * reprovar, confirmar pagamento manual) — isso é sempre ação do admin.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Megaphone, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { feedApi } from "@/lib/api";
import { feedGestaoApi } from "@/lib/api/feed";
import type { Campanha, FeedPost } from "@/lib/api/feed";
import { EditorDoPatrocinador } from "@/components/feed/editor-do-patrocinador";

const SITUACAO_PAGAMENTO: Record<string, { rotulo: string; cor: string }> = {
  pending: { rotulo: "Aguardando pagamento", cor: "bg-amber-500/15 text-amber-600" },
  paid:    { rotulo: "Pago",                 cor: "bg-emerald-500/15 text-emerald-600" },
  waived:  { rotulo: "Isento",               cor: "bg-blue-500/15 text-blue-600" },
};
const SITUACAO_APROVACAO: Record<string, { rotulo: string; cor: string }> = {
  pending:  { rotulo: "Aguardando aprovação", cor: "bg-amber-500/15 text-amber-600" },
  approved: { rotulo: "Aprovada",             cor: "bg-emerald-500/15 text-emerald-600" },
  rejected: { rotulo: "Reprovada",            cor: "bg-red-500/15 text-red-600" },
};
const SITUACAO_POST: Record<string, { rotulo: string; cor: string }> = {
  draft:     { rotulo: "Rascunho",  cor: "bg-muted text-muted-foreground" },
  scheduled: { rotulo: "Agendada",  cor: "bg-blue-500/15 text-blue-600" },
  published: { rotulo: "No ar",     cor: "bg-emerald-500/15 text-emerald-600" },
  paused:    { rotulo: "Pausada",   cor: "bg-amber-500/15 text-amber-600" },
  archived:  { rotulo: "Arquivada", cor: "bg-red-500/15 text-red-600" },
};

const reais = (centavos: number | null) =>
  centavos === null ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PortalDoPatrocinador() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editorAberto, setEditorAberto] = useState(false);
  const [postEmEdicao, setPostEmEdicao] = useState<FeedPost | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await feedGestaoApi.campanhas();
      setCampanhas(r.campanhas);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNova() {
    setPostEmEdicao(null);
    setEditorAberto(true);
  }

  async function abrirEdicao(postId: string) {
    try {
      const post = await feedApi.getById(postId);
      setPostEmEdicao(post);
      setEditorAberto(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a publicação");
    }
  }

  async function excluirRascunho(postId: string) {
    if (!confirm("Excluir este rascunho? Esta ação não pode ser desfeita.")) return;
    try {
      await feedApi.remove(postId);
      toast.success("Rascunho excluído");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meu Feed</h1>
          <p className="text-sm text-muted-foreground">
            Suas publicações patrocinadas — crie, pague por PIX e acompanhe a aprovação.
          </p>
        </div>
        <button
          onClick={abrirNova}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nova publicação
        </button>
      </header>

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{erro}</span>
        </div>
      )}

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : campanhas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma publicação ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Clique em &quot;Nova publicação&quot; para anexar mídia, escrever o texto e configurar a
              abrangência da sua divulgação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campanhas.map((c) => {
            const post = c.posts?.[0];
            const podeEditar = !post || post.status === "draft";
            return (
              <Card key={c.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{c.name}</h3>
                      {post && (
                        <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SITUACAO_POST[post.status]?.cor)}>
                          {SITUACAO_POST[post.status]?.rotulo}
                        </span>
                      )}
                      <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SITUACAO_PAGAMENTO[c.payment_status]?.cor)}>
                        {SITUACAO_PAGAMENTO[c.payment_status]?.rotulo}
                      </span>
                      <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SITUACAO_APROVACAO[c.approval_status]?.cor)}>
                        {SITUACAO_APROVACAO[c.approval_status]?.rotulo}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.coverage_type === "regional" ? `Regional — ${c.coverage_value}` : "Nacional"} ·{" "}
                      {c.duration_days} dia(s) · {reais(c.total_price_cents)}
                    </p>
                    {c.approval_status === "rejected" && c.rejection_reason && (
                      <p className="mt-1 text-xs text-destructive">Motivo da reprovação: {c.rejection_reason}</p>
                    )}
                  </div>
                  {post && podeEditar && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void abrirEdicao(post.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      {c.payment_status === "pending" && (
                        <button
                          onClick={() => void excluirRascunho(post.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditorDoPatrocinador
        aberto={editorAberto}
        post={postEmEdicao}
        onFechar={() => setEditorAberto(false)}
        onSalvo={() => void carregar()}
      />
    </div>
  );
}
