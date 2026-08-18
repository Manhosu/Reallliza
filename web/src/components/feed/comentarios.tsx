"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { feedApi } from "@/lib/api";
import type { FeedComentario } from "@/lib/api/feed";

function Comentario({ c }: { c: FeedComentario }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {(c.user?.full_name ?? "?").charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">{c.user?.full_name ?? "Usuário"}</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(c.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{c.content}</p>
      </div>
    </div>
  );
}

/**
 * Comentar pelo site.
 *
 * O leitor dizia "Comentar no app" — um convite para não fazer nada, já que
 * quem lê o Feed no computador não vai pegar o celular para responder. A rota
 * `/feed/:id/comments` existe desde que o Feed foi escrito, com GET, POST,
 * validação de tamanho, checagem de público e notificação para o autor. Só
 * faltava a tela.
 *
 * Os comentários são carregados na abertura, não junto do post: uma lista com
 * vinte publicações traria vinte listas de comentários que quase ninguém abre.
 */
export function ComentariosDoPost({
  postId,
  aoComentar,
}: {
  postId: string;
  /** Avisa o feed para o contador da barra subir sem recarregar tudo. */
  aoComentar: () => void;
}) {
  const [itens, setItens] = useState<FeedComentario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await feedApi.comentarios(postId);
      setItens(r.data);
    } catch {
      toast.error("Não foi possível carregar os comentários");
    } finally {
      setCarregando(false);
    }
  }, [postId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O foco vai para o campo assim que o painel abre: quem clicou em "Comentar"
  // quer escrever, não procurar onde escrever.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    try {
      const novo = await feedApi.comentar(postId, conteudo);
      // Acrescenta no fim porque a lista vem em ordem cronológica — o
      // comentário novo é o mais recente.
      setItens((atuais) => [...atuais, novo]);
      setTexto("");
      aoComentar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível comentar");
    } finally {
      setEnviando(false);
    }
  }

  // O banco permite um nível de resposta (`parent_comment_id`, com gatilho que
  // impede aninhar mais fundo) e o aplicativo já usa. Desenhar tudo achatado
  // faria a resposta parecer um comentário solto e trocaria o sentido da
  // conversa — alguém respondendo "não concordo" vira alguém discordando do
  // post. Responder pela web ainda não dá; ver, dá.
  const raizes = itens.filter((c) => !c.parent_comment_id);
  const respostas = new Map<string, FeedComentario[]>();
  for (const c of itens) {
    if (!c.parent_comment_id) continue;
    const lista = respostas.get(c.parent_comment_id) ?? [];
    lista.push(c);
    respostas.set(c.parent_comment_id, lista);
  }

  return (
    <div className="border-t bg-muted/20 px-4 py-3">
      {carregando ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : itens.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Nenhum comentário ainda. Seja o primeiro.
        </p>
      ) : (
        <ul className="mb-3 space-y-3">
          {raizes.map((c) => (
            <li key={c.id}>
              <Comentario c={c} />
              {(respostas.get(c.id) ?? []).length > 0 && (
                <ul className="mt-2 space-y-2 border-l pl-3 ml-3.5">
                  {(respostas.get(c.id) ?? []).map((r) => (
                    <li key={r.id}>
                      <Comentario c={r} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          // O limite é o mesmo que a rota impõe. Deixar o navegador cortar
          // evita o caminho em que a pessoa escreve muito e perde o texto num
          // 400 do servidor.
          maxLength={2000}
          rows={2}
          placeholder="Escreva um comentário…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
          }}
          className="min-h-[2.5rem] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button
          size="sm"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          aria-label="Enviar comentário"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Ctrl + Enter envia.</p>
    </div>
  );
}
