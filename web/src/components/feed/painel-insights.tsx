"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { feedApi } from "@/lib/api";
import type { FeedInsights } from "@/lib/api/feed";
import { cn } from "@/lib/utils";
import { ComentariosDoPost } from "./comentarios";

/**
 * Painel de desempenho de UMA publicação.
 *
 * Karol 28/08: no Portal do Patrocinador, os números só apareciam somados
 * de todas as publicações — pra ver o resultado de uma só, tinha que ir
 * pro Feed do admin catar entre as demais. Extraído do que já existia em
 * `feed/page.tsx` (uso do admin) pra virar o mesmo painel nos dois lugares,
 * só que agora o "Comentários" expande a lista de verdade em vez de ser só
 * um número — reaproveita `ComentariosDoPost`, que já existia e já é
 * usada solta (leitor.tsx), sem mudar nada nela.
 */
export function PainelInsights({
  postId,
  title,
  onFechar,
}: {
  postId: string;
  title: string;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<FeedInsights | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [comentariosAbertos, setComentariosAbertos] = useState(false);

  useEffect(() => {
    feedApi
      .insights(postId)
      .then(setDados)
      .catch(() => toast.error("Não foi possível carregar o desempenho"))
      .finally(() => setCarregando(false));
  }, [postId]);

  const t = dados?.totais;

  return (
    <Dialog open onClose={onFechar} size="lg">
      <DialogHeader>
        <DialogTitle>Desempenho — {title}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-5 pt-4">
        {carregando ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        ) : !t ? (
          <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
              {(
                [
                  ["Impressões", t.impressoes, false],
                  ["Alcance único", t.alcance_unico, false],
                  ["Visualizações", t.visualizacoes, false],
                  ["Cliques", t.cliques, false],
                  ["Reações", t.reacoes, false],
                  ["Comentários", t.comentarios, true],
                  ["Compartilhamentos", t.compartilhamentos, false],
                  ["Salvamentos", t.salvamentos, false],
                ] as const
              ).map(([rotulo, valor, expandivel]) => (
                <button
                  key={rotulo}
                  type="button"
                  disabled={!expandivel}
                  onClick={() => expandivel && setComentariosAbertos((v) => !v)}
                  className={cn(
                    "bg-background p-3 text-left transition-colors",
                    expandivel && "cursor-pointer hover:bg-muted/50"
                  )}
                >
                  <p className="text-xl font-semibold tabular-nums">{valor}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {rotulo}
                    {expandivel && (comentariosAbertos ? " ▲" : " ▼")}
                  </p>
                </button>
              ))}
            </div>

            {comentariosAbertos && (
              <div className="overflow-hidden rounded-xl border">
                <ComentariosDoPost
                  postId={postId}
                  aoComentar={() =>
                    setDados((d) =>
                      d ? { ...d, totais: { ...d.totais, comentarios: d.totais.comentarios + 1 } } : d
                    )
                  }
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3">
                <p className="text-lg font-semibold tabular-nums">{t.ctr_impressao}%</p>
                <p className="text-[11px] text-muted-foreground">
                  Taxa de clique <span className="block">sobre impressões</span>
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-lg font-semibold tabular-nums">{t.ctr_alcance}%</p>
                <p className="text-[11px] text-muted-foreground">
                  Taxa de clique <span className="block">sobre alcance</span>
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-lg font-semibold tabular-nums">{t.taxa_engajamento}%</p>
                <p className="text-[11px] text-muted-foreground">
                  Engajamento <span className="block">sobre alcance</span>
                </p>
              </div>
            </div>

            {t.video.inicios > 0 && (
              <div className="space-y-2 rounded-xl border p-3">
                <p className="text-sm font-medium">Vídeo</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(
                    [
                      ["25%", t.video.q25],
                      ["50%", t.video.q50],
                      ["75%", t.video.q75],
                      ["100%", t.video.completos],
                    ] as const
                  ).map(([r, v]) => (
                    <div key={r}>
                      <p className="text-base font-semibold tabular-nums">
                        {t.video.inicios > 0 ? Math.round((v / t.video.inicios) * 100) : 0}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">assistiu {r}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(dados.recortes).map(([tipo, linhas]) => (
              <div key={tipo} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tipo === "uf" ? "Por estado" : tipo === "level" ? "Por nível" : tipo === "role" ? "Por perfil" : "Por plataforma"}
                </p>
                <div className="space-y-1">
                  {linhas.slice(0, 6).map((l) => (
                    <div key={l.valor} className="flex items-center justify-between text-sm">
                      <span>{l.valor}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {l.impressoes} impressões · {l.cliques} cliques
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </DialogContent>
      <DialogFooter className="border-t">
        <Button variant="outline" onClick={onFechar}>Fechar</Button>
      </DialogFooter>
    </Dialog>
  );
}
