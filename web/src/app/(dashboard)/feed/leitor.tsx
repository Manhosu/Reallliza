"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ThumbsUp, Heart, Trophy, Lightbulb, HandHeart,
  MessageCircle, Bookmark, Share2, Pin, Megaphone, FileText, Play,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { feedApi } from "@/lib/api";
import type { FeedPost, FeedCta } from "@/lib/api/feed";
import { EnqueteDoFeed, PedidoDoFeed } from "@/components/feed/enquete-e-pedido";
import { ComentariosDoPost } from "@/components/feed/comentarios";
import { rastreador } from "@/lib/feed/rastreador";
import { normalizarUrlDeBotao } from "@/lib/feed/anexos";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Feed para quem consome, não para quem publica.
 *
 * A mesma rota `/feed` está no menu dos três papéis, mas a Central de
 * Conteúdo é console de administração — o técnico via os filtros de rascunho
 * e um botão "Nova publicação" que o servidor recusaria. Aqui ele vê o que
 * de fato importa: o conteúdo.
 */

const REACOES = [
  { tipo: "like", Icone: ThumbsUp, rotulo: "Curti" },
  { tipo: "love", Icone: Heart, rotulo: "Amei" },
  { tipo: "celebrate", Icone: Trophy, rotulo: "Parabéns" },
  { tipo: "insightful", Icone: Lightbulb, rotulo: "Aprendi" },
  { tipo: "support", Icone: HandHeart, rotulo: "Apoio" },
] as const;

function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Botões que abrem formulário em vez de navegar — igual ao aplicativo. */
const TIPOS_DE_PEDIDO: Record<string, string> = {
  solicitar_contato: "contato",
  solicitar_amostra: "amostra",
  encontrar_revendedor: "revendedor",
  participar_treinamento: "treinamento",
};

export function FeedLeitor() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const [comentandoEm, setComentandoEm] = useState<string | null>(null);
  const [pedido, setPedido] = useState<{ post: FeedPost; cta: FeedCta; tipo: string } | null>(null);
  const perfil = useAuthStore((e) => e.user);

  const carregar = useCallback(async () => {
    try {
      const r = await feedApi.list({ limit: 20 });
      setPosts(r.data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar o feed");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    rastreador.iniciar();
    rastreador.novaSessao();
    carregar();
    return () => rastreador.parar();
  }, [carregar]);

  // Impressão de tudo que entrou na lista. O aplicativo usa visibilidade real
  // do cartão; aqui a lista é curta e cabe na tela, então a carga já conta —
  // e o rastreador deduplica por sessão de qualquer forma.
  useEffect(() => {
    for (const p of posts) rastreador.registrar("impression", p.id);
  }, [posts]);

  function aplicarLocal(id: string, patch: Partial<FeedPost>) {
    setPosts((a) => a.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function reagir(p: FeedPost, tipo: string | null) {
    setAbertoEm(null);
    const antes = { my_reaction: p.my_reaction, like_count: p.like_count };
    const desfaz = p.my_reaction === tipo || tipo === null;
    aplicarLocal(p.id, {
      my_reaction: desfaz ? null : tipo,
      like_count: p.like_count + (desfaz ? -1 : p.my_reaction ? 0 : 1),
    });
    try {
      const r = await feedApi.react(p.id, tipo);
      aplicarLocal(p.id, { my_reaction: r.my_reaction, like_count: r.like_count });
    } catch {
      aplicarLocal(p.id, antes);
    }
  }

  async function salvar(p: FeedPost) {
    const antes = { saved_by_me: p.saved_by_me, save_count: p.save_count };
    aplicarLocal(p.id, {
      saved_by_me: !p.saved_by_me,
      save_count: p.save_count + (p.saved_by_me ? -1 : 1),
    });
    try {
      const r = await feedApi.save(p.id);
      aplicarLocal(p.id, { saved_by_me: r.saved, save_count: r.save_count });
    } catch {
      aplicarLocal(p.id, antes);
    }
  }

  if (carregando) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="h-56 animate-pulse rounded bg-muted" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-muted-foreground">
          Comunicados, conteúdo técnico e novidades da Reallliza.
        </p>
      </div>

      {posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="Nada por aqui ainda"
            description="Comunicados, treinamentos e novidades aparecem nesta tela."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {posts.map((p, i) => {
            const capa = p.media?.[0];
            const reacaoAtual = REACOES.find((r) => r.tipo === p.my_reaction);
            const IconeAtual = reacaoAtual?.Icone ?? ThumbsUp;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3) }}
              >
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    {/* Numa peça patrocinada a marca É a informação. O
                        logotipo vinha na consulta e era descartado em favor
                        da primeira letra num círculo cinza. */}
                    {p.sponsor?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.sponsor.logo_url}
                        alt={`Logotipo de ${p.sponsor.name}`}
                        className="h-9 w-9 shrink-0 rounded-full border object-contain"
                        style={p.sponsor.primary_color ? { borderColor: p.sponsor.primary_color } : undefined}
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {(p.sponsor?.name ?? p.author?.full_name ?? "R").slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.sponsor?.name ?? p.author?.full_name ?? "Reallliza"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tempoRelativo(p.published_at ?? p.created_at)}
                        {p.category && ` · ${p.category.name}`}
                      </p>
                    </div>
                    {p.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                  </div>

                  {p.is_sponsored && (
                    <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Patrocinado
                    </p>
                  )}

                  {capa?.kind === "image" && capa.public_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capa.public_url} alt={capa.alt_text ?? ""} className="w-full object-cover" />
                  )}
                  {capa?.kind === "video" && capa.public_url && (
                    <video src={capa.public_url} controls poster={capa.thumbnail_url ?? undefined} className="w-full bg-black" />
                  )}
                  {capa?.kind === "document" && (
                    <a
                      href={capa.public_url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 border-y bg-muted/40 p-4 text-sm hover:bg-muted"
                    >
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="flex-1 truncate">{capa.file_name ?? "Documento"}</span>
                      <span className="text-xs text-muted-foreground">abrir</span>
                    </a>
                  )}
                  {(p.media?.length ?? 0) > 1 && (
                    <p className="px-4 pt-2 text-xs text-muted-foreground">
                      <Play className="mr-1 inline h-3 w-3" />
                      {p.media!.length} itens — veja todos no aplicativo
                    </p>
                  )}

                  <CardContent className="space-y-2 p-4">
                    <p className="font-semibold">{p.title}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.content}</p>
                  </CardContent>

                  {/* O botão passou a respeitar o TIPO. Antes tudo virava um
                      link para `target_url`, e os tipos que geram pedido —
                      contato, amostra, revendedor, treinamento — não têm link
                      nenhum: viravam `href="#"`, um botão que não faz nada. */}
                  {(p.ctas?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-4">
                      {p.ctas!.map((c) => {
                        const geraPedido = TIPOS_DE_PEDIDO[c.cta_type];
                        if (geraPedido) {
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                rastreador.registrar("click", p.id, { cta_id: c.id });
                                setPedido({ post: p, cta: c, tipo: geraPedido });
                              }}
                              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                            >
                              {c.label}
                            </button>
                          );
                        }
                        if (c.cta_type === "utilizar_cupom" && c.coupon_code) {
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                rastreador.registrar("click", p.id, { cta_id: c.id });
                                void navigator.clipboard?.writeText(c.coupon_code!);
                                toast.success(`Cupom ${c.coupon_code} copiado`);
                              }}
                              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                            >
                              {c.label}
                            </button>
                          );
                        }
                        // Karol 27/08: target_url sem esquema (ex.: "wa.me/551199999999",
                        // "www.site.com.br") virava link relativo do próprio site em vez
                        // de abrir o destino — normaliza antes de usar como href.
                        const destino = c.target_url
                          ? normalizarUrlDeBotao(c.target_url)
                          : c.target_route;
                        if (!destino) return null;
                        return (
                          <a
                            key={c.id}
                            href={destino}
                            target={c.target_url ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            onClick={() => {
                              rastreador.registrar("click", p.id, { cta_id: c.id });
                              if (c.target_url) rastreador.registrar("link_open", p.id, { cta_id: c.id });
                            }}
                            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                          >
                            {c.label}
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {p.poll && (
                    <EnqueteDoFeed
                      enquete={p.poll}
                      meusVotos={p.my_poll_votes ?? []}
                      aoVotar={(opcoes) => {
                        // Sem registrar evento aqui: a rota de voto já grava
                        // o `poll_vote`. Registrar dos dois lados contava o
                        // mesmo voto duas vezes na métrica.
                        setPosts((atuais) =>
                          atuais.map((x) => (x.id === p.id ? { ...x, my_poll_votes: opcoes } : x))
                        );
                      }}
                    />
                  )}

                  {abertoEm === p.id && (
                    <div className="mx-4 mb-2 flex justify-around rounded-xl border bg-muted/40 py-2">
                      {REACOES.map(({ tipo, Icone, rotulo }) => (
                        <button
                          key={tipo}
                          onClick={() => reagir(p, tipo)}
                          className="flex flex-col items-center gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <Icone className={cn("h-5 w-5", p.my_reaction === tipo && "text-primary")} />
                          {rotulo}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-5 border-t px-4 py-3 text-sm">
                    {p.reactions_enabled && (
                      <button
                        onClick={() => reagir(p, p.my_reaction ? null : "like")}
                        onContextMenu={(e) => { e.preventDefault(); setAbertoEm(abertoEm === p.id ? null : p.id); }}
                        className={cn(
                          "flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground",
                          p.my_reaction && "text-primary"
                        )}
                      >
                        <IconeAtual className="h-4 w-4" />
                        {p.like_count > 0 ? p.like_count : "Reagir"}
                      </button>
                    )}
                    {p.comments_enabled && (
                      <button
                        onClick={() => setComentandoEm(comentandoEm === p.id ? null : p.id)}
                        className={cn(
                          "flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground",
                          comentandoEm === p.id && "text-primary"
                        )}
                      >
                        <MessageCircle className="h-4 w-4" />
                        {p.comment_count > 0 ? p.comment_count : "Comentar"}
                      </button>
                    )}
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Share2 className="h-4 w-4" />
                      {p.share_count > 0 ? p.share_count : ""}
                    </span>
                    <button
                      onClick={() => salvar(p)}
                      aria-label={p.saved_by_me ? "Remover dos salvos" : "Salvar"}
                      className={cn(
                        "ml-auto text-muted-foreground transition hover:text-foreground",
                        p.saved_by_me && "text-primary"
                      )}
                    >
                      <Bookmark className={cn("h-4 w-4", p.saved_by_me && "fill-current")} />
                    </button>
                  </div>

                  {comentandoEm === p.id && (
                    <ComentariosDoPost
                      postId={p.id}
                      aoComentar={() =>
                        setPosts((atuais) =>
                          atuais.map((x) =>
                            x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x
                          )
                        )
                      }
                    />
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {pedido && (
        <PedidoDoFeed
          postId={pedido.post.id}
          ctaId={pedido.cta.id}
          tipo={pedido.tipo}
          tituloDaPublicacao={pedido.post.title}
          perfil={{ nome: perfil?.full_name ?? null, email: perfil?.email ?? null, telefone: null }}
          aoFechar={() => setPedido(null)}
        />
      )}
    </div>
  );
}
