"use client";

/**
 * Portal do Patrocinador.
 *
 * A tela única de quem loga como `sponsor`: lista as próprias publicações
 * (a Karol pensa em "campanha" e "publicação" como a mesma coisa — aqui
 * também) e deixa criar uma nova, sem nenhum botão de administração (aprovar,
 * reprovar, confirmar pagamento manual) — isso é sempre ação do admin.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Megaphone, Pencil, Trash2, AlertTriangle,
  Eye, MousePointerClick, Users, Target, TrendingUp, Video,
  Heart, MessageCircle, Share2, Bookmark, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { feedApi } from "@/lib/api";
import { feedGestaoApi } from "@/lib/api/feed";
import type { Campanha, FeedPost, PainelFeed } from "@/lib/api/feed";
import { EditorDoPatrocinador } from "@/components/feed/editor-do-patrocinador";
import { PainelInsights } from "@/components/feed/painel-insights";

const JANELAS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

const numero = (n: number) => (n >= 1000 ? n.toLocaleString("pt-BR") : String(n ?? 0));

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
  // Karol 28/08: "apertar na publicação e aparecer os resultados só dessa
  // publicação" — post.id já vem embutido em cada campanha (feedGestaoApi.
  // campanhas()), então abrir isto é só um clique, sem busca nova.
  const [verDesempenhoDe, setVerDesempenhoDe] = useState<{ id: string; title: string } | null>(null);

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

  // Métricas das próprias publicações — reaproveita o mesmo cálculo do
  // Painel do Feed (admin); o backend já recorta pelo patrocinador do
  // próprio login, então aqui só pede sem passar sponsor_id nenhum.
  const [dias, setDias] = useState(30);
  const [painel, setPainel] = useState<PainelFeed | null>(null);
  const [carregandoPainel, setCarregandoPainel] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregandoPainel(true);
    feedGestaoApi
      .painel(dias)
      .then((p) => vivo && setPainel(p))
      .catch(() => vivo && setPainel(null))
      .finally(() => vivo && setCarregandoPainel(false));
    return () => {
      vivo = false;
    };
  }, [dias]);

  const serie = useMemo(() => {
    if (!painel) return [];
    return Object.entries(painel.evolucao_diaria)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, v]) => ({
        dia: new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        ...v,
      }));
  }, [painel]);

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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Desempenho das suas publicações</h2>
          <div className="flex rounded-md border text-xs">
            {JANELAS.map((j) => (
              <button
                key={j.dias}
                onClick={() => setDias(j.dias)}
                className={cn(
                  "px-2.5 py-1.5 first:rounded-l-md last:rounded-r-md",
                  dias === j.dias ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {j.rotulo}
              </button>
            ))}
          </div>
        </div>

        {carregandoPainel || !painel ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : painel.totais.publicacoes === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Assim que sua publicação for aprovada e entrar no ar, os números aparecem aqui.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador icone={Eye} rotulo="Impressões" valor={painel.totais.impressoes}
                nota={`${numero(painel.totais.visualizacoes)} visualizações`} />
              <Indicador icone={MousePointerClick} rotulo="Cliques" valor={painel.totais.cliques}
                nota={`CTR de ${painel.totais.ctr}%`} />
              <Indicador icone={Target} rotulo="Pedidos recebidos" valor={painel.totais.leads} destaque />
              <Indicador icone={Users} rotulo="Pessoas alcançadas" valor={painel.totais.usuarios_alcancados} />
              <Indicador icone={TrendingUp} rotulo="Taxa de engajamento" valor={painel.totais.taxa_engajamento} sufixo="%" />
              <Indicador icone={Video} rotulo="Publicações no ar" valor={painel.totais.publicacoes_no_ar}
                nota={`${numero(painel.totais.publicacoes)} no total`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Miudo icone={Heart} rotulo="Curtidas" valor={painel.totais.curtidas} />
              <Miudo icone={MessageCircle} rotulo="Comentários" valor={painel.totais.comentarios} />
              <Miudo icone={Share2} rotulo="Compartilhamentos" valor={painel.totais.compartilhamentos} />
              <Miudo icone={Bookmark} rotulo="Salvamentos" valor={painel.totais.salvamentos} />
            </div>

            {serie.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolução no período</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={serie}>
                      <defs>
                        <linearGradient id="gImpressoes" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="dia" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                      <Area type="monotone" dataKey="impressoes" name="Impressões"
                        stroke="var(--primary)" fill="url(#gImpressoes)" strokeWidth={2} />
                      <Area type="monotone" dataKey="cliques" name="Cliques"
                        stroke="#2C7A55" fill="transparent" strokeWidth={2} />
                      <Area type="monotone" dataKey="leads" name="Pedidos"
                        stroke="#B87A16" fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

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
                  <div className="flex gap-2">
                    {post?.status === "published" && (
                      <button
                        onClick={() => setVerDesempenhoDe({ id: post.id, title: post.title })}
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <BarChart3 className="h-3.5 w-3.5" /> Ver desempenho
                      </button>
                    )}
                    {post && podeEditar && (
                      <>
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
                      </>
                    )}
                  </div>
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

      {verDesempenhoDe && (
        <PainelInsights
          postId={verDesempenhoDe.id}
          title={verDesempenhoDe.title}
          onFechar={() => setVerDesempenhoDe(null)}
        />
      )}
    </div>
  );
}

function Indicador({
  icone: Icone, rotulo, valor, nota, sufixo, destaque,
}: {
  icone: React.ElementType; rotulo: string; valor: number;
  nota?: string; sufixo?: string; destaque?: boolean;
}) {
  return (
    <Card className={cn(destaque && "border-primary/40")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</span>
          <Icone className={cn("h-4 w-4", destaque ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {numero(valor ?? 0)}
          {sufixo && <span className="text-base font-normal text-muted-foreground">{sufixo}</span>}
        </div>
        {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

function Miudo({ icone: Icone, rotulo, valor }: { icone: React.ElementType; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Icone className="h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-lg font-semibold tabular-nums leading-none">{numero(valor ?? 0)}</div>
        <div className="text-xs text-muted-foreground">{rotulo}</div>
      </div>
    </div>
  );
}
