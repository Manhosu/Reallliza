"use client";

/**
 * Enquete e pedido no feed lido pelo navegador.
 *
 * Os dois já existiam no aplicativo e não existiam aqui — quem lia pelo site
 * via a publicação pela metade: a enquete não aparecia, e o botão que deveria
 * abrir um formulário virava um link para lugar nenhum.
 *
 * O comportamento é o mesmo dos componentes do aplicativo, de propósito. Duas
 * regras diferentes para "quando mostrar o resultado" produziriam duas
 * respostas para a mesma pergunta dependendo de onde a pessoa abriu.
 */

import { useState } from "react";
import { BarChart3, Check, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import { feedApi, type FeedEnquete } from "@/lib/api/feed";

export function EnqueteDoFeed({
  enquete, meusVotos, aoVotar,
}: {
  enquete: FeedEnquete;
  meusVotos: string[];
  aoVotar: (opcoes: string[]) => void;
}) {
  const [estado, setEstado] = useState(enquete);
  const [escolhidas, setEscolhidas] = useState<string[]>(meusVotos);
  const [enviando, setEnviando] = useState(false);
  const [jaVotou, setJaVotou] = useState(meusVotos.length > 0);
  const [erro, setErro] = useState<string | null>(null);

  const encerrada = Boolean(estado.closes_at && new Date(estado.closes_at) < new Date());
  const mostrarResultado =
    estado.show_results === "always" ||
    (estado.show_results === "after_vote" && jaVotou) ||
    (estado.show_results === "after_close" && encerrada);

  // O denominador é PESSOAS, não votos: em enquete de múltipla escolha,
  // somar percentuais sobre o total de votos passa de 100%.
  const base = Math.max(1, estado.unique_voters);

  const alternar = (id: string) => {
    if (encerrada) return;
    setErro(null);
    setEscolhidas((atual) =>
      estado.allow_multiple
        ? atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
        : [id]
    );
  };

  const enviar = async () => {
    if (escolhidas.length === 0 || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await feedApi.votarEnquete(estado.id, escolhidas);
      if (r.resultado) setEstado({ ...estado, ...r.resultado });
      setJaVotou(true);
      aoVotar(escolhidas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar seu voto");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-4 mb-4 space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {estado.question}
      </p>
      {estado.allow_multiple && !jaVotou && !encerrada && (
        <p className="text-xs text-muted-foreground">Pode marcar mais de uma.</p>
      )}

      {[...estado.options].sort((a, b) => a.position - b.position).map((o) => {
        const marcada = escolhidas.includes(o.id);
        const pct = mostrarResultado ? Math.round((o.vote_count / base) * 100) : 0;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => alternar(o.id)}
            disabled={encerrada}
            aria-pressed={marcada}
            className={cn(
              "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              marcada ? "border-primary" : "hover:bg-muted",
              encerrada && "cursor-default"
            )}
          >
            {/* A barra fica ATRÁS do texto para a opção manter a mesma altura
                antes e depois do voto — senão a lista "pula" quando o
                resultado aparece. */}
            {mostrarResultado && (
              <span
                className="absolute inset-y-0 left-0 bg-primary/15"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                marcada && "border-primary bg-primary text-primary-foreground")}>
                {marcada && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1">{o.label}</span>
              {mostrarResultado && <span className="font-medium tabular-nums">{pct}%</span>}
            </span>
          </button>
        );
      })}

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {!encerrada && (
          <Button size="sm" onClick={() => void enviar()} disabled={escolhidas.length === 0 || enviando}>
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : jaVotou ? "Trocar voto" : "Votar"}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {estado.unique_voters === 0
            ? "Seja o primeiro a responder"
            : `${estado.unique_voters} ${estado.unique_voters === 1 ? "pessoa respondeu" : "pessoas responderam"}`}
          {encerrada && " · encerrada"}
        </span>
      </div>
    </div>
  );
}

const TEXTOS: Record<string, { titulo: string; explicacao: string; botao: string }> = {
  contato:     { titulo: "Solicitar contato",    explicacao: "O fabricante entra em contato com você.", botao: "Enviar pedido" },
  amostra:     { titulo: "Solicitar amostra",    explicacao: "Confirme onde você quer receber a amostra.", botao: "Pedir amostra" },
  revendedor:  { titulo: "Encontrar revendedor", explicacao: "Informamos o revendedor mais próximo.", botao: "Procurar" },
  treinamento: { titulo: "Participar do treinamento", explicacao: "Confirme sua inscrição.", botao: "Inscrever-me" },
};

export function PedidoDoFeed({
  postId, ctaId, tipo, tituloDaPublicacao, perfil, aoFechar,
}: {
  postId: string;
  ctaId: string;
  tipo: string;
  tituloDaPublicacao: string;
  perfil: { nome?: string | null; email?: string | null; telefone?: string | null };
  aoFechar: () => void;
}) {
  const t = TEXTOS[tipo] ?? TEXTOS.contato;
  const [nome, setNome] = useState(perfil.nome ?? "");
  const [email, setEmail] = useState(perfil.email ?? "");
  const [telefone, setTelefone] = useState(perfil.telefone ?? "");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    if (!nome.trim()) return setErro("Informe seu nome");
    // Sem forma de contato o pedido não serve: o fabricante recebe um nome e
    // não tem como responder.
    if (!telefone.trim() && !email.trim()) {
      return setErro("Informe ao menos um telefone ou e-mail");
    }
    setEnviando(true);
    setErro(null);
    try {
      await apiClient.post("/feed/leads", {
        post_id: postId, cta_id: ctaId, kind: tipo,
        name: nome.trim(), email: email.trim(), phone: telefone.trim(),
        message: mensagem.trim(),
      });
      setPronto(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar seu pedido");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-3 p-5">
          {pronto ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Check className="h-10 w-10 text-primary" />
              <p className="font-medium">Pedido enviado</p>
              <p className="text-sm text-muted-foreground">
                {tipo === "amostra"
                  ? "O fabricante vai entrar em contato para combinar a entrega."
                  : "Em breve entram em contato com você."}
              </p>
              <Button onClick={aoFechar} className="mt-2">Fechar</Button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{t.titulo}</p>
                  <p className="text-sm text-primary">{tituloDaPublicacao}</p>
                  <p className="text-sm text-muted-foreground">{t.explicacao}</p>
                </div>
                <button onClick={aoFechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
              </div>

              <Campo rotulo="Nome" valor={nome} aoMudar={setNome} />
              <Campo rotulo="Telefone" valor={telefone} aoMudar={setTelefone} />
              <Campo rotulo="E-mail" valor={email} aoMudar={setEmail} />
              <Campo rotulo="Observação (opcional)" valor={mensagem} aoMudar={setMensagem} />

              {erro && <p className="text-sm text-destructive">{erro}</p>}

              <Button className="w-full" onClick={() => void enviar()} disabled={enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : t.botao}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Seus dados de contato são enviados ao patrocinador desta publicação.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({
  rotulo, valor, aoMudar,
}: { rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{rotulo}</label>
      <Input value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </div>
  );
}
