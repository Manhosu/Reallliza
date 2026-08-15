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
import type { FeedPost } from "@/lib/api/feed";

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

export function FeedLeitor() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);

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
    carregar();
  }, [carregar]);

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
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {(p.sponsor?.name ?? p.author?.full_name ?? "R").slice(0, 1)}
                    </div>
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

                  {(p.ctas?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-4">
                      {p.ctas!.map((c) => (
                        <a
                          key={c.id}
                          href={c.target_url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                        >
                          {c.label}
                        </a>
                      ))}
                    </div>
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
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <MessageCircle className="h-4 w-4" />
                        {p.comment_count > 0 ? p.comment_count : "Comentar no app"}
                      </span>
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
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
