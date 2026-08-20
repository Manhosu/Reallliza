"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { feedGestaoApi } from "@/lib/api/feed";
import type { Campanha, Catalogos, PrecoDeCampanha, TipoDeAbrangencia, EscopoRegional } from "@/lib/api/feed";

/** UFs e regiões — busca própria, mesmo padrão do SeletorDePublico. */
function useCatalogos(): Catalogos | null {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  useEffect(() => {
    feedGestaoApi.catalogos().then(setCatalogos).catch(() => {});
  }, []);
  return catalogos;
}

/**
 * Patrocínio e cobrança — a parte do editor que a Karol pediu pra não ficar
 * mais numa tela "Campanhas" separada.
 *
 * Fase 1a: quem cria e opera é o admin (loja/fabricante ainda não loga
 * sozinho — isso é Fase 1b) e a confirmação de pagamento é manual (PIX
 * automático é Fase 2). O valor nunca é calculado aqui na tela: é sempre o
 * `POST /feed/campaigns/price-preview` que decide, contra as regras do
 * admin — esta tela só mostra o resultado.
 */

const SITUACAO_PAGAMENTO: Record<string, { rotulo: string; cor: string }> = {
  pending: { rotulo: "Aguardando pagamento", cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  paid:    { rotulo: "Pago",                 cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  waived:  { rotulo: "Isento — loja Reallliza", cor: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
};
const SITUACAO_APROVACAO: Record<string, { rotulo: string; cor: string }> = {
  pending:  { rotulo: "Aguardando aprovação", cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  approved: { rotulo: "Aprovada",             cor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  rejected: { rotulo: "Reprovada",            cor: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

const reais = (centavos: number | null | undefined) =>
  centavos == null ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface CoberturaEditada {
  coverage_type: TipoDeAbrangencia;
  coverage_scope: EscopoRegional | null;
  coverage_value: string | null;
  duration_days: number;
}

interface Props {
  /** Campanha já existente vinculada a este post — null quando ainda vai nascer junto com ele. */
  campanha: Campanha | null;
  cobertura: CoberturaEditada;
  aoMudarCobertura: (v: CoberturaEditada) => void;
  aoAtualizarCampanha: (c: Campanha) => void;
}

export function EditorDePatrocinio({
  campanha, cobertura, aoMudarCobertura, aoAtualizarCampanha,
}: Props) {
  const catalogos = useCatalogos();
  const [preco, setPreco] = useState<PrecoDeCampanha | null>(null);
  const [carregandoPreco, setCarregandoPreco] = useState(false);
  const [erroPreco, setErroPreco] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [mostrarReprovar, setMostrarReprovar] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");

  // Cobertura só é editável (e recalcula preço) enquanto a campanha ainda
  // não foi paga — depois de paga, o valor está travado.
  const podeEditarCobertura = !campanha || campanha.payment_status === "pending";

  useEffect(() => {
    if (!podeEditarCobertura) return;
    if (cobertura.coverage_type === "regional" && !cobertura.coverage_value) {
      setPreco(null);
      return;
    }
    if (!cobertura.duration_days || cobertura.duration_days <= 0) {
      setPreco(null);
      return;
    }
    let cancelado = false;
    setCarregandoPreco(true);
    setErroPreco(null);
    const t = setTimeout(() => {
      feedGestaoApi
        .previewPrecoCampanha(cobertura)
        .then((r) => {
          if (!cancelado) setPreco(r);
        })
        .catch((e) => {
          if (!cancelado) {
            setPreco(null);
            setErroPreco(e instanceof Error ? e.message : "Não foi possível calcular o preço");
          }
        })
        .finally(() => {
          if (!cancelado) setCarregandoPreco(false);
        });
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobertura.coverage_type, cobertura.coverage_scope, cobertura.coverage_value, cobertura.duration_days, podeEditarCobertura]);

  async function confirmarPagamento() {
    if (!campanha) return;
    setProcessando(true);
    try {
      const atualizada = await feedGestaoApi.pagarCampanha(campanha.id);
      toast.success("Pagamento confirmado");
      aoAtualizarCampanha(atualizada);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar pagamento");
    } finally {
      setProcessando(false);
    }
  }

  async function aprovar() {
    if (!campanha) return;
    setProcessando(true);
    try {
      const atualizada = await feedGestaoApi.aprovarCampanha(campanha.id);
      toast.success("Campanha aprovada");
      aoAtualizarCampanha(atualizada);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aprovar");
    } finally {
      setProcessando(false);
    }
  }

  async function reprovar() {
    if (!campanha || !motivoReprovacao.trim()) return;
    setProcessando(true);
    try {
      const atualizada = await feedGestaoApi.reprovarCampanha(campanha.id, motivoReprovacao.trim());
      toast.success("Campanha reprovada");
      setMostrarReprovar(false);
      setMotivoReprovacao("");
      aoAtualizarCampanha(atualizada);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reprovar");
    } finally {
      setProcessando(false);
    }
  }

  const ufs = catalogos?.ufs ?? [];
  const regioes = catalogos?.regioes ?? [];

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Patrocínio e cobrança</h3>
        {campanha?.payment_status === "waived" && (
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
            Loja Reallliza — publicação gratuita
          </span>
        )}
      </div>

      {podeEditarCobertura ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                aoMudarCobertura({ ...cobertura, coverage_type: "nacional", coverage_scope: null, coverage_value: null })
              }
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-sm",
                cobertura.coverage_type === "nacional"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              Nacional
            </button>
            <button
              type="button"
              onClick={() =>
                aoMudarCobertura({ ...cobertura, coverage_type: "regional", coverage_scope: cobertura.coverage_scope ?? "uf" })
              }
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-sm",
                cobertura.coverage_type === "regional"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              Regional
            </button>
          </div>

          {cobertura.coverage_type === "regional" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={cobertura.coverage_scope ?? "uf"}
                onChange={(e) =>
                  aoMudarCobertura({ ...cobertura, coverage_scope: e.target.value as EscopoRegional, coverage_value: "" })
                }
              >
                <option value="uf">Por estado</option>
                <option value="regiao">Por região</option>
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={cobertura.coverage_value ?? ""}
                onChange={(e) => aoMudarCobertura({ ...cobertura, coverage_value: e.target.value })}
              >
                <option value="">Escolha</option>
                {cobertura.coverage_scope === "regiao"
                  ? regioes.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))
                  : ufs.map((u) => (
                      <option key={u.uf} value={u.uf}>
                        {u.uf} — {u.name}
                      </option>
                    ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Por quantos dias</label>
            <input
              type="number"
              min={1}
              className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={cobertura.duration_days}
              onChange={(e) =>
                aoMudarCobertura({ ...cobertura, duration_days: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>

          <div className="rounded-md bg-background/60 p-3 text-sm">
            {carregandoPreco ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando...
              </span>
            ) : erroPreco ? (
              <span className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {erroPreco}
              </span>
            ) : preco ? (
              <span>
                <strong>{reais(preco.price_per_day_cents)}</strong>/dia × {preco.days} dia(s) ={" "}
                <strong className="text-base">{reais(preco.total_cents)}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Escolha a abrangência e a duração para ver o valor.</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {cobertura.coverage_type === "nacional" ? "Nacional" : `Regional — ${cobertura.coverage_value}`} ·{" "}
          {cobertura.duration_days} dia(s) · <strong>{reais(campanha?.total_price_cents)}</strong>. Já paga —
          abrangência e duração não podem mais mudar.
        </p>
      )}

      {campanha && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", SITUACAO_PAGAMENTO[campanha.payment_status]?.cor)}>
              {SITUACAO_PAGAMENTO[campanha.payment_status]?.rotulo}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 font-medium", SITUACAO_APROVACAO[campanha.approval_status]?.cor)}>
              {SITUACAO_APROVACAO[campanha.approval_status]?.rotulo}
            </span>
          </div>

          {campanha.approval_status === "rejected" && campanha.rejection_reason && (
            <p className="text-xs text-destructive">Motivo da reprovação: {campanha.rejection_reason}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {campanha.payment_status === "pending" && (
              <button
                type="button"
                disabled={processando}
                onClick={() => void confirmarPagamento()}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Confirmar pagamento
              </button>
            )}
            {campanha.payment_status !== "pending" && campanha.approval_status === "pending" && !mostrarReprovar && (
              <>
                <button
                  type="button"
                  disabled={processando}
                  onClick={() => void aprovar()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={processando}
                  onClick={() => setMostrarReprovar(true)}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Reprovar
                </button>
              </>
            )}
          </div>

          {mostrarReprovar && (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-md border border-input bg-background p-2 text-xs"
                rows={2}
                placeholder="Motivo da reprovação"
                value={motivoReprovacao}
                onChange={(e) => setMotivoReprovacao(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={processando || !motivoReprovacao.trim()}
                  onClick={() => void reprovar()}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                >
                  Confirmar reprovação
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarReprovar(false);
                    setMotivoReprovacao("");
                  }}
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
