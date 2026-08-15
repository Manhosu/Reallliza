"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pencil, Trash2, Send, PauseCircle, BarChart3, Copy,
  CalendarClock, Pin, Image as ImageIcon, Video, FileText, X,
  ArrowUp, ArrowDown, AlertCircle, Megaphone, Eye, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { feedApi } from "@/lib/api";
import type { FeedPost, FeedMeta, FeedMedia, FeedInsights } from "@/lib/api/feed";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";
import { FeedLeitor } from "./leitor";

/**
 * Central de Conteúdo do Feed.
 *
 * A tela anterior era um mural: título, texto e mídia solta. Aqui a
 * publicação tem ciclo de vida (rascunho → agendada → publicada → pausada →
 * arquivada), categoria, público-alvo, carrossel ordenável e desempenho.
 *
 * Publicar é botão separado de salvar, de propósito: publicar resolve a
 * audiência e pode disparar notificação para todo o público. Misturar com
 * "salvar" produz publicação acidental.
 */

const ESTADO: Record<string, { rotulo: string; cor: string }> = {
  draft:     { rotulo: "Rascunho",   cor: "bg-muted text-muted-foreground" },
  scheduled: { rotulo: "Agendada",   cor: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  published: { rotulo: "No ar",      cor: "bg-green-500/15 text-green-600 dark:text-green-400" },
  paused:    { rotulo: "Pausada",    cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  archived:  { rotulo: "Arquivada",  cor: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

function paraInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================================================
// Editor
// ============================================================

interface EditorProps {
  aberto: boolean;
  post: FeedPost | null;
  meta: FeedMeta | null;
  onFechar: () => void;
  onSalvo: () => void;
}

function Editor({ aberto, post, meta, onFechar, onSalvo }: EditorProps) {
  const editando = !!post;
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [audiencia, setAudiencia] = useState("");
  const [patrocinador, setPatrocinador] = useState("");
  const [agendarPara, setAgendarPara] = useState("");
  const [encerrarEm, setEncerrarEm] = useState("");
  const [fixarAte, setFixarAte] = useState("");
  const [notificar, setNotificar] = useState(false);
  const [comentarios, setComentarios] = useState(true);
  const [midias, setMidias] = useState<FeedMedia[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Id da publicação criada durante esta sessão do editor.
   *
   * Sem isto, anexar um arquivo num rascunho novo criava a publicação e o
   * editor continuava achando que não existia — o segundo anexo criaria uma
   * SEGUNDA publicação, e publicar criaria uma terceira.
   */
  const [idCriado, setIdCriado] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const idAtual = post?.id ?? idCriado;

  useEffect(() => {
    if (!aberto) return;
    setTitulo(post?.title ?? "");
    setConteudo(post?.content ?? "");
    setCategoria(post?.category_id ?? "");
    setAudiencia(post?.audience_rule_id ?? "");
    setPatrocinador(post?.sponsor_id ?? "");
    setAgendarPara(paraInputDateTime(post?.publish_at ?? null));
    setEncerrarEm(paraInputDateTime(post?.unpublish_at ?? null));
    setFixarAte(paraInputDateTime(post?.pinned_until ?? null));
    setNotificar(post?.notify_on_publish ?? false);
    setComentarios(post?.comments_enabled ?? true);
    setMidias(post?.media ?? []);
    setIdCriado(null);
    setErro(null);
  }, [aberto, post]);

  const catSelecionada = meta?.categorias.find((c) => c.id === categoria);
  const exigePatrocinador = !!catSelecionada?.requires_sponsor;

  function montarPayload() {
    return {
      title: titulo.trim(),
      content: conteudo.trim(),
      category_id: categoria || null,
      audience_rule_id: audiencia || null,
      sponsor_id: patrocinador || null,
      publish_at: agendarPara ? new Date(agendarPara).toISOString() : null,
      unpublish_at: encerrarEm ? new Date(encerrarEm).toISOString() : null,
      pinned_until: fixarAte ? new Date(fixarAte).toISOString() : null,
      notify_on_publish: notificar,
      comments_enabled: comentarios,
    };
  }

  function validar(): string | null {
    if (!titulo.trim()) return "Dê um título à publicação.";
    if (!conteudo.trim()) return "Escreva o conteúdo da publicação.";
    if (exigePatrocinador && !patrocinador) {
      return `A categoria "${catSelecionada?.name}" exige escolher um patrocinador.`;
    }
    return null;
  }

  /**
   * @param avisar quando falso, não recarrega a lista nem mostra aviso.
   *
   * Publicar chama esta função primeiro para obter o id. Se ela também
   * recarregasse a lista, duas cargas correriam em paralelo e a de "salvo
   * como rascunho" poderia chegar DEPOIS da de "publicado", devolvendo a
   * tela ao estado antigo. Foi o que aconteceu ao agendar: o item ficava
   * como rascunho até recarregar a página.
   */
  async function salvar(avisar = true): Promise<string | null> {
    const problema = validar();
    if (problema) { setErro(problema); return null; }

    setSalvando(true);
    setErro(null);
    try {
      const payload = montarPayload();
      // `idAtual` cobre o caso de a publicação ter nascido nesta mesma sessão
      // do editor (ao anexar mídia, por exemplo).
      const salvo = idAtual
        ? await feedApi.update(idAtual, payload)
        : await feedApi.create(payload);
      if (!idAtual) setIdCriado(salvo.id);
      if (avisar) {
        toast.success(editando ? "Publicação salva" : "Rascunho criado");
        onSalvo();
      }
      return salvo.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      setErro(msg);
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function publicar() {
    // Sempre salva antes — sem isso, editar o título e clicar direto em
    // "Publicar" publicaria a versão antiga e a alteração se perderia.
    // Sem recarregar a lista: quem recarrega é o publicar, com o estado final.
    const id = await salvar(false);
    if (!id) return;

    setPublicando(true);
    setErro(null);
    try {
      const r = await feedApi.publish(id, agendarPara ? new Date(agendarPara).toISOString() : null);
      toast.success(
        r.status === "scheduled"
          ? `Agendada para ${new Date(r.publish_at!).toLocaleString("pt-BR")}`
          : r.audiencia_alcancada
            ? `No ar para ${r.audiencia_alcancada} pessoas`
            : "No ar"
      );
      onSalvo();
      onFechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao publicar");
    } finally {
      setPublicando(false);
    }
  }

  async function enviarArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const id = idAtual ?? (await salvar());
    if (!id) {
      setErro("Salve o rascunho antes de anexar mídia.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      for (const arquivo of Array.from(lista)) {
        // Dimensões e duração são medidas aqui porque só o navegador as
        // conhece — e sem a duração não há como calcular quartil de vídeo.
        const extras = await medirArquivo(arquivo);
        const midia = await feedApi.uploadMedia(id, arquivo, extras);
        setMidias((m) => [...m, midia]);
      }
      toast.success("Mídia anexada");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar o arquivo");
    } finally {
      setEnviando(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  async function removerMidia(id: string) {
    try {
      await feedApi.removeMedia(id);
      setMidias((m) => m.filter((x) => x.id !== id));
    } catch {
      toast.error("Não foi possível remover");
    }
  }

  return (
    <Dialog open={aberto} onClose={onFechar} size="lg">
      <DialogHeader>
        <DialogTitle>
          {editando ? "Editar publicação" : "Nova publicação"}
        </DialogTitle>
      </DialogHeader>

      <DialogContent className="space-y-5 pt-4">
        {erro && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <Input
          label="Título *"
          placeholder="Ex.: Novo sistema de etapas na execução"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground/80">Conteúdo *</label>
          <textarea
            className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            placeholder="O texto que o profissional vai ler no aplicativo"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Categoria</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {meta?.categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Quem vai ver</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={audiencia}
              onChange={(e) => setAudiencia(e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {meta?.audiencias.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.estimated_size != null ? ` (~${a.estimated_size})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {exigePatrocinador && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Patrocinador * <span className="text-muted-foreground">— a categoria exige</span>
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={patrocinador}
              onChange={(e) => setPatrocinador(e.target.value)}
            >
              <option value="">Escolha o patrocinador</option>
              {meta?.patrocinadores.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ---- Mídia ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground/80">
              Mídia {midias.length > 1 && <span className="text-muted-foreground">— carrossel de {midias.length}</span>}
            </label>
            <Button
              type="button" variant="outline" size="sm"
              isLoading={enviando}
              onClick={() => inputArquivo.current?.click()}
            >
              <Plus className="h-3.5 w-3.5" /> Anexar
            </Button>
            <input
              ref={inputArquivo} type="file" multiple className="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf"
              onChange={(e) => enviarArquivos(e.target.files)}
            />
          </div>

          {midias.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Imagem, vídeo ou PDF. Até 100 MB por arquivo.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {midias.map((m, i) => (
                <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  {m.kind === "image" && m.public_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.public_url} alt={m.alt_text ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
                      {m.kind === "video" ? <Video className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                      <span className="line-clamp-2 text-center text-[10px]">{m.file_name}</span>
                    </div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-medium text-white">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerMidia(m.id)}
                    aria-label={`Remover mídia ${i + 1}`}
                    className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Programação ---- */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
              <CalendarClock className="h-3.5 w-3.5" /> Publicar em
            </label>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={agendarPara}
              onChange={(e) => setAgendarPara(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Vazio publica na hora.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Encerrar em</label>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={encerrarEm}
              onChange={(e) => setEncerrarEm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
              <Pin className="h-3.5 w-3.5" /> Fixar até
            </label>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={fixarAte}
              onChange={(e) => setFixarAte(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox" className="mt-1"
              checked={notificar}
              onChange={(e) => setNotificar(e.target.checked)}
            />
            <span>
              <b>Avisar por notificação</b>
              <span className="block text-xs text-muted-foreground">
                Manda um aviso no celular de todo o público escolhido. Use com parcimônia.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={comentarios}
              onChange={(e) => setComentarios(e.target.checked)}
            />
            Permitir comentários
          </label>
        </div>
      </DialogContent>

      <DialogFooter className="border-t">
        <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button type="button" variant="outline" isLoading={salvando} onClick={() => salvar()}>
          Salvar rascunho
        </Button>
        <Button type="button" isLoading={publicando} onClick={publicar}>
          <Send className="h-4 w-4" />
          {agendarPara ? "Agendar" : "Publicar agora"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Lê dimensões e duração no navegador — o servidor não tem como saber. */
async function medirArquivo(
  arquivo: File
): Promise<{ width?: number; height?: number; duration_seconds?: number }> {
  if (arquivo.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = URL.createObjectURL(arquivo);
    });
  }
  if (arquivo.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth, height: v.videoHeight, duration_seconds: v.duration });
      v.onerror = () => resolve({});
      v.src = URL.createObjectURL(arquivo);
    });
  }
  return {};
}

// ============================================================
// Painel de desempenho
// ============================================================

function PainelInsights({ post, onFechar }: { post: FeedPost; onFechar: () => void }) {
  const [dados, setDados] = useState<FeedInsights | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    feedApi
      .insights(post.id)
      .then(setDados)
      .catch(() => toast.error("Não foi possível carregar o desempenho"))
      .finally(() => setCarregando(false));
  }, [post.id]);

  const t = dados?.totais;

  return (
    <Dialog open onClose={onFechar} size="lg">
      <DialogHeader>
        <DialogTitle>Desempenho — {post.title}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-5 pt-4">
        {carregando ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        ) : !t ? (
          <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
              {[
                ["Impressões", t.impressoes],
                ["Alcance único", t.alcance_unico],
                ["Visualizações", t.visualizacoes],
                ["Cliques", t.cliques],
                ["Reações", t.reacoes],
                ["Comentários", t.comentarios],
                ["Compartilhamentos", t.compartilhamentos],
                ["Salvamentos", t.salvamentos],
              ].map(([rotulo, valor]) => (
                <div key={String(rotulo)} className="bg-background p-3">
                  <p className="text-xl font-semibold tabular-nums">{valor as number}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
                </div>
              ))}
            </div>

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
                  {([["25%", t.video.q25], ["50%", t.video.q50], ["75%", t.video.q75], ["100%", t.video.completos]] as const).map(
                    ([r, v]) => (
                      <div key={r}>
                        <p className="text-base font-semibold tabular-nums">
                          {t.video.inicios > 0 ? Math.round((v / t.video.inicios) * 100) : 0}%
                        </p>
                        <p className="text-[11px] text-muted-foreground">assistiu {r}</p>
                      </div>
                    )
                  )}
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

// ============================================================
// Tela
// ============================================================

export default function FeedPage() {
  const user = useAuthStore((s) => s.user);

  // A rota está no menu dos três papéis, mas gerir conteúdo é do admin. Quem
  // não é admin recebe o feed para ler — antes via os filtros de rascunho e um
  // botão "Nova publicação" que o servidor recusaria.
  if (user && user.role !== UserRole.ADMIN) return <FeedLeitor />;
  return <FeedAdmin />;
}

function FeedAdmin() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [editorAberto, setEditorAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<FeedPost | null>(null);
  const [insightsDe, setInsightsDe] = useState<FeedPost | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, m] = await Promise.all([
        feedApi.list({ include_drafts: true, limit: 50 }),
        meta ? Promise.resolve(meta) : feedApi.meta(),
      ]);
      setPosts(lista.data);
      setMeta(m);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar o feed");
    } finally {
      setCarregando(false);
    }
    // `meta` é buscado uma vez; incluí-lo nas dependências recarregaria em laço
  }, [meta]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return posts.filter((p) => {
      if (filtro !== "todos" && p.status !== filtro) return false;
      if (!termo) return true;
      return (
        p.title.toLowerCase().includes(termo) ||
        p.content.toLowerCase().includes(termo)
      );
    });
  }, [posts, filtro, busca]);

  async function abrirEdicao(p: FeedPost) {
    try {
      // Recarrega o detalhe: a listagem não traz mídia com todos os campos.
      const completo = await feedApi.getById(p.id);
      setEmEdicao(completo);
      setEditorAberto(true);
    } catch {
      toast.error("Não foi possível abrir a publicação");
    }
  }

  async function duplicar(p: FeedPost) {
    try {
      const completo = await feedApi.getById(p.id);
      const novo = await feedApi.create({
        title: `${completo.title} (cópia)`,
        content: completo.content,
        category_id: completo.category_id,
        audience_rule_id: completo.audience_rule_id,
        sponsor_id: completo.sponsor_id,
        comments_enabled: completo.comments_enabled,
      });
      toast.success("Cópia criada como rascunho");
      await carregar();
      abrirEdicao(novo);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao duplicar");
    }
  }

  async function pausar(p: FeedPost) {
    try {
      await feedApi.pause(p.id);
      toast.success("Publicação pausada");
      carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao pausar");
    }
  }

  async function publicar(p: FeedPost) {
    try {
      const r = await feedApi.publish(p.id);
      toast.success(
        r.audiencia_alcancada ? `No ar para ${r.audiencia_alcancada} pessoas` : "No ar"
      );
      carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao publicar");
    }
  }

  async function remover(p: FeedPost) {
    try {
      const r = await feedApi.remove(p.id);
      toast.success(r.arquivado ? "Publicação arquivada" : "Rascunho excluído");
      carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  const contagem = (s: string) =>
    s === "todos" ? posts.length : posts.filter((p) => p.status === s).length;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Central de Conteúdo</h1>
          <p className="text-muted-foreground">
            Publicações do feed dos profissionais — com público-alvo, agendamento e desempenho.
          </p>
        </div>
        <Button onClick={() => { setEmEdicao(null); setEditorAberto(true); }}>
          <Plus className="h-4 w-4" /> Nova publicação
        </Button>
      </motion.div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {["todos", "draft", "scheduled", "published", "paused"].map((s) => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                filtro === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {s === "todos" ? "Todas" : ESTADO[s].rotulo} ({contagem(s)})
            </button>
          ))}
        </div>
        <div className="sm:ml-auto sm:w-64">
          <Input placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-20 animate-pulse rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title={posts.length === 0 ? "Nenhuma publicação ainda" : "Nada neste filtro"}
            description={
              posts.length === 0
                ? "Crie a primeira publicação do feed. Ela aparece no aplicativo dos profissionais."
                : "Ajuste o filtro ou a busca."
            }
            action={
              posts.length === 0 ? (
                <Button onClick={() => { setEmEdicao(null); setEditorAberto(true); }}>
                  <Plus className="h-4 w-4" /> Nova publicação
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {visiveis.map((p, i) => {
              const st = ESTADO[p.status] ?? ESTADO.draft;
              const capa = p.media?.[0];
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.25) }}
                >
                  <Card hover>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                        {capa?.kind === "image" && capa.public_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={capa.public_url} alt="" className="h-full w-full object-cover" />
                        ) : capa?.kind === "video" ? (
                          <Video className="h-6 w-6 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cor)}>
                            {st.rotulo}
                          </span>
                          {p.is_pinned && (
                            <Badge variant="warning" size="sm"><Pin className="mr-1 h-3 w-3" />Fixada</Badge>
                          )}
                          {p.is_sponsored && <Badge variant="info" size="sm">Patrocinado</Badge>}
                          {p.category && (
                            <span className="text-[11px] text-muted-foreground">{p.category.name}</span>
                          )}
                        </div>
                        <p className="truncate font-medium">{p.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{p.content}</p>
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                          {/* Sem audiência definida, a publicação alcança todo mundo —
                              dizer isso é melhor que um ícone mudo. */}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {p.audience?.name ?? "Todos"}
                          </span>
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{p.impression_count} impressões</span>
                          <span>{p.like_count} reações</span>
                          <span>{p.comment_count} comentários</span>
                          {p.publish_at && p.status === "scheduled" && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {new Date(p.publish_at).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-1.5">
                        {p.status === "published" && (
                          <Button variant="outline" size="sm" onClick={() => setInsightsDe(p)}>
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(p.status === "draft" || p.status === "paused") && (
                          <Button size="sm" onClick={() => publicar(p)}>
                            <Send className="mr-1 h-3.5 w-3.5" />Publicar
                          </Button>
                        )}
                        {p.status === "published" && (
                          <Button variant="outline" size="sm" onClick={() => pausar(p)}>
                            <PauseCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => abrirEdicao(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => duplicar(p)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => remover(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Editor
        aberto={editorAberto}
        post={emEdicao}
        meta={meta}
        onFechar={() => setEditorAberto(false)}
        onSalvo={carregar}
      />
      {insightsDe && <PainelInsights post={insightsDe} onFechar={() => setInsightsDe(null)} />}
    </div>
  );
}
