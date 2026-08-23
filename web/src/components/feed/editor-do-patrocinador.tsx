"use client";

/**
 * Editor de publicação do Portal do Patrocinador.
 *
 * Dedicado, não o mesmo `Editor` grande de `feed/page.tsx` — aquele carrega
 * agendamento avançado, enquete, notificação push e vínculo a campanha
 * existente, nenhum dos quais está na lista que a Karol pediu. Aqui é só:
 * mídia, título, conteúdo, botões de ação, abrangência/dias/valor e
 * pagamento. Audiência é sempre "Todos" — não aparece na tela.
 *
 * Também usado pelo admin (`papel="admin"`, atalho "Publicação patrocinada"
 * na Central de Conteúdo) — a Karol notou que testar como admin caía num
 * editor bem diferente do que a loja via, mesmo a parte de patrocínio sendo
 * o mesmo componente por baixo (`EditorDePatrocinio`). O que sobrava era o
 * caminho pra chegar lá: no editor grande, o bloco só aparece depois de
 * escolher uma categoria "exige patrocinador" — fácil de esquecer. Aqui o
 * admin cai direto nele, só ganhando a escolha de qual patrocinador (o
 * sponsor/parceiro logado não escolhe — é sempre o próprio).
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Plus, Video, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter,
} from "@/components/ui/dialog";
import { EditorDeBotoes, type BotaoNoEditor } from "@/components/feed/editor-de-anexos";
import { EditorDePatrocinio, type CoberturaEditada } from "@/components/feed/editor-de-patrocinio";
import { medirArquivo } from "@/lib/feed/medir-arquivo";
import { feedApi } from "@/lib/api";
import { feedGestaoApi } from "@/lib/api/feed";
import type { FeedPost, FeedMedia, Campanha, Patrocinador } from "@/lib/api/feed";

function paraInputDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  aberto: boolean;
  /** Publicação já existente (rascunho) — null quando ainda vai nascer. */
  post: FeedPost | null;
  onFechar: () => void;
  onSalvo: () => void;
  /** Admin escolhe o patrocinador e ganha Aprovar/Reprovar/Confirmar manual; sponsor/parceiro é sempre o próprio. */
  papel?: "admin" | "sponsor";
}

export function EditorDoPatrocinador({ aberto, post, onFechar, onSalvo, papel = "sponsor" }: Props) {
  const editando = !!post;
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [dataDeInicio, setDataDeInicio] = useState("");
  const [midias, setMidias] = useState<FeedMedia[]>([]);
  const [botoes, setBotoes] = useState<BotaoNoEditor[]>([]);
  const [campanhaVinculada, setCampanhaVinculada] = useState<Campanha | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaEditada>({
    coverage_type: "nacional", coverage_scope: null, coverage_value: null, duration_days: 7,
  });
  const [idCriado, setIdCriado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroTick, setErroTick] = useState(0);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const bannerDeErro = useRef<HTMLDivElement>(null);

  // Só o admin escolhe o patrocinador — sponsor/parceiro logado é sempre o
  // próprio, resolvido no servidor.
  const [patrocinadores, setPatrocinadores] = useState<Patrocinador[]>([]);
  const [patrocinadorId, setPatrocinadorId] = useState("");
  useEffect(() => {
    if (papel !== "admin" || !aberto) return;
    feedGestaoApi.patrocinadores().then((r) => setPatrocinadores(r.patrocinadores)).catch(() => {});
  }, [papel, aberto]);
  useEffect(() => {
    setPatrocinadorId(campanhaVinculada?.sponsor_id ?? "");
  }, [campanhaVinculada]);

  function mostrarErro(msg: string) {
    setErro(msg);
    setErroTick((t) => t + 1);
  }

  useEffect(() => {
    if (erroTick > 0) bannerDeErro.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [erroTick]);

  const idAtual = post?.id ?? idCriado;

  useEffect(() => {
    if (!aberto) return;
    setTitulo(post?.title ?? "");
    setConteudo(post?.content ?? "");
    setDataDeInicio(paraInputDate(post?.publish_at ?? null));
    setMidias(post?.media ?? []);
    setBotoes(
      (post?.ctas ?? []).map((c) => ({
        cta_type: c.cta_type,
        label: c.label,
        target_url: c.target_url ?? "",
        coupon_code: c.coupon_code ?? "",
      }))
    );
    setIdCriado(null);
    setErro(null);
    // Reseta aqui, não só no efeito abaixo — para uma "Nova publicação"
    // (post sempre null), `post?.campaign_id` nunca muda entre uma abertura
    // e outra, e o efeito de baixo não dispara de novo. Sem isto, criar uma
    // campanha, fechar e abrir "Nova publicação" de novo reaproveitava a
    // campanha da vez anterior.
    setCampanhaVinculada(null);
    setCobertura({ coverage_type: "nacional", coverage_scope: null, coverage_value: null, duration_days: 7 });
  }, [aberto, post]);

  useEffect(() => {
    if (!post?.campaign_id) return;
    let cancelado = false;
    feedGestaoApi
      .buscarCampanha(post.campaign_id)
      .then((c) => {
        if (cancelado) return;
        setCampanhaVinculada(c);
        setCobertura({
          coverage_type: c.coverage_type,
          coverage_scope: c.coverage_scope,
          coverage_value: c.coverage_value,
          duration_days: c.duration_days ?? 7,
        });
      })
      .catch(() => {
        if (!cancelado) setCampanhaVinculada(null);
      });
    return () => {
      cancelado = true;
    };
  }, [post?.campaign_id]);

  function montarPayload() {
    return {
      title: titulo.trim(),
      content: conteudo.trim(),
      publish_at: dataDeInicio ? new Date(`${dataDeInicio}T00:00`).toISOString() : null,
      ctas: botoes
        .filter((b) => b.label.trim())
        .map((b) => ({
          cta_type: b.cta_type,
          label: b.label.trim(),
          target_url: b.target_url.trim() || null,
          coupon_code: b.coupon_code.trim() || null,
        })),
    };
  }

  function validar(): string | null {
    if (!titulo.trim()) return "Dê um título à publicação.";
    if (!conteudo.trim()) return "Escreva a descrição da publicação.";
    if (papel === "admin" && !campanhaVinculada && !patrocinadorId) {
      return "Escolha o patrocinador.";
    }
    if (!campanhaVinculada) {
      if (cobertura.coverage_type === "regional" && !cobertura.coverage_value) {
        return "Escolha a UF ou a região da divulgação regional.";
      }
      if (!cobertura.duration_days || cobertura.duration_days <= 0) {
        return "Informe por quantos dias a publicação vai ficar no ar.";
      }
    }
    return null;
  }

  async function salvar(avisar = true): Promise<string | null> {
    const problema = validar();
    if (problema) { mostrarErro(problema); return null; }

    setSalvando(true);
    setErro(null);
    try {
      const payload = montarPayload();

      // Primeira vez: campanha e peça nascem juntas — o "criar publicação"
      // único que a Karol pediu, sem passar por uma tela de campanha à parte.
      if (!idAtual && !campanhaVinculada) {
        const criada = await feedGestaoApi.criarCampanhaComPost({
          // Sponsor/parceiro: o servidor ignora e resolve pelo próprio login.
          // Admin: é o único jeito de dizer pra quem é a campanha.
          ...(papel === "admin" ? { sponsor_id: patrocinadorId } : {}),
          name: titulo.trim(),
          coverage_type: cobertura.coverage_type,
          coverage_scope: cobertura.coverage_scope,
          coverage_value: cobertura.coverage_value,
          duration_days: cobertura.duration_days,
          post: payload,
        });
        if (!criada.post) throw new Error("A campanha foi criada, mas a publicação não.");
        setIdCriado(criada.post.id);
        setCampanhaVinculada(criada);
        if (avisar) {
          toast.success("Rascunho criado");
          onSalvo();
        }
        return criada.post.id;
      }

      if (campanhaVinculada) {
        const camposCampanha: Record<string, unknown> = { name: titulo.trim() };
        if (campanhaVinculada.payment_status === "pending") {
          camposCampanha.coverage_type = cobertura.coverage_type;
          camposCampanha.coverage_scope = cobertura.coverage_scope;
          camposCampanha.coverage_value = cobertura.coverage_value;
          camposCampanha.duration_days = cobertura.duration_days;
        }
        const atualizada = await feedGestaoApi.atualizarCampanha(campanhaVinculada.id, camposCampanha);
        setCampanhaVinculada(atualizada);
      }

      const salvo = idAtual
        ? await feedApi.update(idAtual, payload)
        : await feedApi.create(payload);
      if (!idAtual) setIdCriado(salvo.id);
      if (avisar) {
        toast.success("Publicação salva");
        onSalvo();
      }
      return salvo.id;
    } catch (e: unknown) {
      mostrarErro(e instanceof Error ? e.message : "Erro ao salvar");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function enviarArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    try {
      const id = idAtual ?? (await salvar());
      if (!id) return;

      setEnviando(true);
      setErro(null);
      for (const arquivo of Array.from(lista)) {
        const extras = await medirArquivo(arquivo);
        const midia = await feedApi.uploadMedia(id, arquivo, extras);
        setMidias((m) => [...m, midia]);
      }
      toast.success("Mídia anexada");
    } catch (e: unknown) {
      mostrarErro(e instanceof Error ? e.message : "Erro ao enviar o arquivo");
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
          {editando ? "Editar publicação" : papel === "admin" ? "Nova publicação patrocinada" : "Nova publicação"}
        </DialogTitle>
      </DialogHeader>

      <DialogContent className="space-y-5 pt-4">
        {erro && (
          <div
            ref={bannerDeErro}
            className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {papel === "admin" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Patrocinador *</label>
            {campanhaVinculada ? (
              <p className="text-sm text-muted-foreground">
                {campanhaVinculada.sponsor?.name ?? "—"}{" "}
                <span className="text-xs">— não muda depois que a campanha já existe.</span>
              </p>
            ) : (
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={patrocinadorId}
                onChange={(e) => setPatrocinadorId(e.target.value)}
              >
                <option value="">Escolha o patrocinador</option>
                {patrocinadores.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <Input
          label="Título *"
          placeholder="Ex.: Nova linha de porcelanato acetinado"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground/80">Descrição *</label>
          <textarea
            className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            placeholder="O texto que vai aparecer na publicação"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
          />
        </div>

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

        {/* ---- Botões de ação (link ou chamada) ---- */}
        <EditorDeBotoes botoes={botoes} aoMudar={setBotoes} />

        {/* ---- Abrangência, dias, valor e pagamento ---- */}
        <EditorDePatrocinio
          campanha={campanhaVinculada}
          cobertura={cobertura}
          aoMudarCobertura={setCobertura}
          aoAtualizarCampanha={setCampanhaVinculada}
          papel={papel}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground/80">Data de início</label>
          <input
            type="date"
            className="h-9 w-full max-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
            value={dataDeInicio}
            onChange={(e) => setDataDeInicio(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Vazio publica assim que for aprovada. A publicação sai do ar sozinha depois de{" "}
            {cobertura.duration_days} dia(s) no ar.
          </p>
        </div>
      </DialogContent>

      <DialogFooter className="border-t">
        <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button type="button" isLoading={salvando} onClick={() => salvar()}>
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
