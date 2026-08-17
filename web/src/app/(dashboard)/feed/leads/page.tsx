"use client";

/**
 * Pedidos e moderação.
 *
 * Duas filas de trabalho na mesma tela: o que chegou de pedido e o que foi
 * denunciado. Nenhuma das duas é grande o bastante para merecer um menu
 * próprio, e as duas são "coisas esperando decisão de alguém".
 *
 * O pedido é o que o patrocinador compra — clique não se cobra. Por isso a
 * situação de cada um é editável aqui e a conversão sai daqui, não de uma
 * planilha paralela.
 */

import { useCallback, useEffect, useState } from "react";
import { FileDown, Inbox, ShieldAlert, Check, X, Eye, EyeOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { feedGestaoApi, type Lead } from "@/lib/api/feed";
import { cn } from "@/lib/utils";

const SITUACOES: Record<string, { rotulo: string; cor: string }> = {
  novo:        { rotulo: "Novo",         cor: "bg-blue-500/15 text-blue-600" },
  em_contato:  { rotulo: "Em contato",   cor: "bg-amber-500/15 text-amber-600" },
  qualificado: { rotulo: "Qualificado",  cor: "bg-violet-500/15 text-violet-600" },
  convertido:  { rotulo: "Convertido",   cor: "bg-emerald-500/15 text-emerald-600" },
  descartado:  { rotulo: "Descartado",   cor: "bg-muted text-muted-foreground" },
};

const TIPOS: Record<string, string> = {
  contato: "Contato", amostra: "Amostra", orcamento: "Orçamento",
  revendedor: "Revendedor", cupom: "Cupom", treinamento: "Treinamento", outro: "Outro",
};

const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function PedidosEModeracao() {
  const [aba, setAba] = useState<"pedidos" | "moderacao">("pedidos");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [resumo, setResumo] = useState<{ total: number; por_situacao: Record<string, number>; taxa_conversao: number } | null>(null);
  const [fila, setFila] = useState<{ comentario: Record<string, unknown>; denuncias: Record<string, unknown>[]; motivos: string[] }[]>([]);
  const [filaResumo, setFilaResumo] = useState<{ abertas: number; resolvidas: number } | null>(null);
  const [filtro, setFiltro] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [l, m] = await Promise.all([
        feedGestaoApi.leads(filtro ? { status: filtro } : undefined),
        feedGestaoApi.moderacao(),
      ]);
      setLeads(l.leads);
      setResumo(l.resumo);
      setFila(m.fila);
      setFilaResumo(m.resumo);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudarSituacao = async (lead: Lead, novo: string) => {
    try {
      await feedGestaoApi.atualizarLead(lead.id, { status: novo });
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao atualizar");
    }
  };

  const moderar = async (commentId: string, acao: "esconder" | "remover" | "liberar") => {
    try {
      await feedGestaoApi.moderar(commentId, acao);
      setAviso(
        acao === "liberar"
          ? "Comentário liberado e denúncia arquivada."
          : "Comentário retirado do feed."
      );
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao moderar");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos e moderação</h1>
          <p className="text-sm text-muted-foreground">
            O que chegou pelos botões de ação e o que foi denunciado no feed.
          </p>
        </div>
        <a
          href={feedGestaoApi.urlRelatorio("leads")}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <FileDown className="h-4 w-4" /> Baixar pedidos
        </a>
      </header>

      {aviso && (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex rounded-md border w-fit">
        <button
          onClick={() => setAba("pedidos")}
          className={cn(
            "flex items-center gap-2 rounded-l-md px-4 py-2 text-sm",
            aba === "pedidos" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <Inbox className="h-4 w-4" /> Pedidos
          {resumo && resumo.total > 0 && (
            <span className="rounded bg-background/20 px-1.5 text-xs">{resumo.total}</span>
          )}
        </button>
        <button
          onClick={() => setAba("moderacao")}
          className={cn(
            "flex items-center gap-2 rounded-r-md px-4 py-2 text-sm",
            aba === "moderacao" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <ShieldAlert className="h-4 w-4" /> Moderação
          {filaResumo && filaResumo.abertas > 0 && (
            <span className="rounded bg-destructive px-1.5 text-xs text-destructive-foreground">
              {filaResumo.abertas}
            </span>
          )}
        </button>
      </div>

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : aba === "pedidos" ? (
        <>
          {resumo && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-md border bg-card p-3">
                <div className="text-lg font-semibold tabular-nums">{resumo.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              {Object.entries(SITUACOES).map(([chave, s]) => (
                <button
                  key={chave}
                  onClick={() => setFiltro(filtro === chave ? "" : chave)}
                  className={cn(
                    "rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted",
                    filtro === chave && "border-primary"
                  )}
                >
                  <div className="text-lg font-semibold tabular-nums">
                    {resumo.por_situacao[chave] ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.rotulo}</div>
                </button>
              ))}
            </div>
          )}

          {leads.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Nenhum pedido ainda</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Publicações com botão &quot;Solicitar Contato&quot; ou &quot;Solicitar Amostra&quot;
                  geram pedidos aqui, com nome e telefone de quem pediu.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => {
                const s = SITUACOES[l.status] ?? SITUACOES.novo;
                return (
                  <Card key={l.id}>
                    <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{l.name}</span>
                          <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", s.cor)}>
                            {s.rotulo}
                          </span>
                          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">
                            {TIPOS[l.kind] ?? l.kind}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[l.phone, l.email, l.city_name && `${l.city_name}/${l.uf}`]
                            .filter(Boolean)
                            .join(" · ") || "Sem contato informado"}
                        </p>
                        {l.message && <p className="mt-1 text-sm">{l.message}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dataBr(l.created_at)}
                          {l.post?.title && ` · ${l.post.title}`}
                          {l.sponsor?.name && ` · ${l.sponsor.name}`}
                        </p>
                      </div>
                      <select
                        value={l.status}
                        onChange={(e) => void mudarSituacao(l, e.target.value)}
                        className="rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {Object.entries(SITUACOES).map(([chave, s2]) => (
                          <option key={chave} value={chave}>{s2.rotulo}</option>
                        ))}
                      </select>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : fila.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nada na fila</p>
            <p className="text-sm text-muted-foreground">
              Nenhum comentário denunciado esperando decisão.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {fila.map((item) => {
            const c = item.comentario as {
              id: string; content: string; created_at: string;
              author?: { full_name?: string } | null;
            };
            return (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{c.author?.full_name ?? "Autor desconhecido"}</span>
                    <span className="rounded bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                      {item.denuncias.length} denúncia(s)
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {item.motivos.join(", ")}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <blockquote className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-3 py-2 text-sm">
                    {c.content}
                  </blockquote>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void moderar(c.id, "liberar")}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" /> Manter no feed
                    </button>
                    <button
                      onClick={() => void moderar(c.id, "esconder")}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <EyeOff className="h-3.5 w-3.5" /> Esconder
                    </button>
                    <button
                      onClick={() => void moderar(c.id, "remover")}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
