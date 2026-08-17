"use client";

/**
 * Botões de ação e enquete no editor.
 *
 * Os dois existiam no banco e no aplicativo desde o começo, e não havia como
 * criá-los — o editor não tinha campo e a API não aceitava. Enquanto isso o
 * app desenhava enquete que nunca vinha preenchida e disparava formulário de
 * pedido a partir de um botão que nunca existia.
 *
 * Em componente separado porque a Central de Conteúdo já passa de 900 linhas.
 */

import { Plus, X, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BotaoNoEditor {
  cta_type: string;
  label: string;
  target_url: string;
  coupon_code: string;
}

export interface EnqueteNoEditor {
  question: string;
  options: string[];
  allow_multiple: boolean;
  is_anonymous: boolean;
  show_results: "always" | "after_vote" | "after_close" | "never";
  closes_at: string;
}

/** Os nove que o José listou, com o rótulo que ele usou. */
export const TIPOS_DE_BOTAO = [
  { valor: "conhecer_produto",      rotulo: "Conhecer Produto",        pedeLink: true },
  { valor: "solicitar_contato",     rotulo: "Solicitar Contato",       pedeLink: false },
  { valor: "baixar_catalogo",       rotulo: "Baixar Catálogo",         pedeLink: true },
  { valor: "participar_treinamento",rotulo: "Participar do Treinamento", pedeLink: false },
  { valor: "comprar_agora",         rotulo: "Comprar Agora",           pedeLink: true },
  { valor: "encontrar_revendedor",  rotulo: "Encontrar Revendedor",    pedeLink: false },
  { valor: "solicitar_amostra",     rotulo: "Solicitar Amostra",       pedeLink: false },
  { valor: "utilizar_cupom",        rotulo: "Utilizar Cupom",          pedeLink: false },
  { valor: "saiba_mais",            rotulo: "Saiba Mais",              pedeLink: true },
];

export const ENQUETE_VAZIA: EnqueteNoEditor = {
  question: "",
  options: ["", ""],
  allow_multiple: false,
  is_anonymous: true,
  show_results: "after_vote",
  closes_at: "",
};

export function EditorDeBotoes({
  botoes, aoMudar,
}: {
  botoes: BotaoNoEditor[];
  aoMudar: (b: BotaoNoEditor[]) => void;
}) {
  const trocar = (i: number, campo: keyof BotaoNoEditor, valor: string) =>
    aoMudar(botoes.map((b, j) => (i === j ? { ...b, [campo]: valor } : b)));

  const mover = (i: number, direcao: -1 | 1) => {
    const alvo = i + direcao;
    if (alvo < 0 || alvo >= botoes.length) return;
    const copia = [...botoes];
    [copia[i], copia[alvo]] = [copia[alvo], copia[i]];
    aoMudar(copia);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground/80">
          Botões de ação
          {botoes.length > 0 && (
            <span className="text-muted-foreground"> — {botoes.length}</span>
          )}
        </label>
        <Button
          type="button" variant="outline" size="sm"
          onClick={() =>
            aoMudar([
              ...botoes,
              { cta_type: "saiba_mais", label: "Saiba mais", target_url: "", coupon_code: "" },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {botoes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Sem botão, a publicação informa mas não gera ação. É o botão que vira pedido e conversão.
        </p>
      ) : (
        botoes.map((b, i) => {
          const tipo = TIPOS_DE_BOTAO.find((t) => t.valor === b.cta_type);
          const geraPedido = ["solicitar_contato", "solicitar_amostra", "encontrar_revendedor", "participar_treinamento"]
            .includes(b.cta_type);

          return (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={b.cta_type}
                  onChange={(e) => trocar(i, "cta_type", e.target.value)}
                >
                  {TIPOS_DE_BOTAO.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                  ))}
                </select>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                  aria-label="Subir" className="rounded border p-1.5 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === botoes.length - 1}
                  aria-label="Descer" className="rounded border p-1.5 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => aoMudar(botoes.filter((_, j) => j !== i))}
                  aria-label="Remover botão" className="rounded border p-1.5 text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <Input
                placeholder="Texto do botão"
                value={b.label}
                onChange={(e) => trocar(i, "label", e.target.value)}
              />

              {tipo?.pedeLink && (
                <Input
                  placeholder="https://..."
                  value={b.target_url}
                  onChange={(e) => trocar(i, "target_url", e.target.value)}
                />
              )}

              {b.cta_type === "utilizar_cupom" && (
                <Input
                  placeholder="Código do cupom"
                  value={b.coupon_code}
                  onChange={(e) => trocar(i, "coupon_code", e.target.value)}
                />
              )}

              {geraPedido && (
                <p className="text-xs text-muted-foreground">
                  Abre um formulário e gera um pedido com nome e telefone. É o que vira
                  conversão no painel — não precisa de link.
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function EditorDeEnquete({
  enquete, aoMudar, temVotos,
}: {
  enquete: EnqueteNoEditor | null;
  aoMudar: (e: EnqueteNoEditor | null) => void;
  temVotos: number;
}) {
  if (!enquete) {
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground/80">Enquete</label>
        <Button type="button" variant="outline" size="sm" onClick={() => aoMudar({ ...ENQUETE_VAZIA })}>
          <Plus className="h-3.5 w-3.5" /> Adicionar enquete
        </Button>
      </div>
    );
  }

  const trocarOpcao = (i: number, valor: string) =>
    aoMudar({ ...enquete, options: enquete.options.map((o, j) => (i === j ? valor : o)) });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground/80">Enquete</label>
        <button type="button" onClick={() => aoMudar(null)}
          aria-label="Remover enquete" className="rounded border p-1.5 text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mudar a enquete apaga os votos por cascata. Avisar antes é o mínimo:
          o admin acha que está corrigindo uma vírgula e perde a pesquisa. */}
      {temVotos > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            Esta enquete já tem {temVotos} {temVotos === 1 ? "voto" : "votos"}. Salvar
            qualquer alteração aqui apaga as respostas e recomeça a contagem.
          </span>
        </p>
      )}

      <Input
        placeholder="A pergunta"
        value={enquete.question}
        onChange={(e) => aoMudar({ ...enquete, question: e.target.value })}
      />

      {enquete.options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder={`Opção ${i + 1}`}
            value={o}
            onChange={(e) => trocarOpcao(i, e.target.value)}
          />
          {enquete.options.length > 2 && (
            <button type="button"
              onClick={() => aoMudar({ ...enquete, options: enquete.options.filter((_, j) => j !== i) })}
              aria-label={`Remover opção ${i + 1}`} className="rounded border p-1.5 text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {enquete.options.length < 10 && (
        <Button type="button" variant="outline" size="sm"
          onClick={() => aoMudar({ ...enquete, options: [...enquete.options, ""] })}>
          <Plus className="h-3.5 w-3.5" /> Opção
        </Button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enquete.allow_multiple}
            onChange={(e) => aoMudar({ ...enquete, allow_multiple: e.target.checked })} />
          Aceita mais de uma resposta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enquete.is_anonymous}
            onChange={(e) => aoMudar({ ...enquete, is_anonymous: e.target.checked })} />
          Resposta anônima
        </label>
        <div>
          <label className="mb-1 block text-xs font-medium">Mostrar o resultado</label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={enquete.show_results}
            onChange={(e) => aoMudar({ ...enquete, show_results: e.target.value as EnqueteNoEditor["show_results"] })}
          >
            {/* Depois de votar é o padrão: ver o placar antes enviesa a
                resposta, que é o contrário do que uma pesquisa quer. */}
            <option value="after_vote">Depois de a pessoa votar</option>
            <option value="always">Sempre</option>
            <option value="after_close">Só quando encerrar</option>
            <option value="never">Nunca</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Encerrar em</label>
          <Input type="datetime-local" value={enquete.closes_at}
            onChange={(e) => aoMudar({ ...enquete, closes_at: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
