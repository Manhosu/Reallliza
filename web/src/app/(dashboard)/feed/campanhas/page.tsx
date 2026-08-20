"use client";

/**
 * Patrocinadores e campanhas.
 *
 * Numa tela só porque é assim que o comercial pensa: campanha não existe sem
 * patrocinador, e cadastrar um para depois procurar o outro em outro menu é
 * atrito sem motivo.
 *
 * O que é entregue aparece ao lado do que foi contratado. Uma campanha com
 * meta e sem acompanhamento vira discussão no fim do mês.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Building2, Megaphone, FileDown, Pencil, Power, X, Check, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { feedGestaoApi, type Patrocinador, type Campanha } from "@/lib/api/feed";
import { cn } from "@/lib/utils";

const TIPOS = [
  { valor: "fabricante", rotulo: "Fabricante" },
  { valor: "loja", rotulo: "Loja" },
  { valor: "distribuidor", rotulo: "Distribuidor" },
  { valor: "parceiro", rotulo: "Parceiro" },
  { valor: "outro", rotulo: "Outro" },
];

const SITUACOES: Record<string, { rotulo: string; cor: string }> = {
  draft:     { rotulo: "Rascunho",  cor: "bg-muted text-muted-foreground" },
  scheduled: { rotulo: "Agendada",  cor: "bg-blue-500/15 text-blue-600" },
  active:    { rotulo: "No ar",     cor: "bg-emerald-500/15 text-emerald-600" },
  paused:    { rotulo: "Pausada",   cor: "bg-amber-500/15 text-amber-600" },
  ended:     { rotulo: "Encerrada", cor: "bg-slate-500/15 text-slate-600" },
  archived:  { rotulo: "Arquivada", cor: "bg-muted text-muted-foreground" },
};

const reais = (centavos: number | null) =>
  centavos === null
    ? "—"
    : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const numero = (n: number) => (n ?? 0).toLocaleString("pt-BR");

export default function CampanhasEPatrocinadores() {
  const [aba, setAba] = useState<"campanhas" | "patrocinadores">("campanhas");
  const [patrocinadores, setPatrocinadores] = useState<Patrocinador[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<"patrocinador" | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, c] = await Promise.all([
        feedGestaoApi.patrocinadores(),
        feedGestaoApi.campanhas(),
      ]);
      setPatrocinadores(p.patrocinadores);
      setCampanhas(c.campanhas);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudarSituacao = async (campanha: Campanha, novo: string) => {
    try {
      const r = await feedGestaoApi.atualizarCampanha(campanha.id, { status: novo });
      setAviso(
        r.pecas_pausadas > 0
          ? `Campanha atualizada. ${r.pecas_pausadas} publicação(ões) saíram do ar junto.`
          : "Campanha atualizada."
      );
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível mudar a situação");
    }
  };

  const alternarPatrocinador = async (p: Patrocinador) => {
    try {
      await feedGestaoApi.atualizarPatrocinador(p.id, { is_active: !p.is_active });
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao alterar");
    }
  };

  const pagar = async (campanha: Campanha) => {
    try {
      await feedGestaoApi.pagarCampanha(campanha.id);
      setAviso("Pagamento confirmado.");
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível confirmar o pagamento");
    }
  };
  const aprovar = async (campanha: Campanha) => {
    try {
      await feedGestaoApi.aprovarCampanha(campanha.id);
      setAviso("Campanha aprovada.");
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível aprovar");
    }
  };
  const reprovar = async (campanha: Campanha, motivo: string) => {
    try {
      await feedGestaoApi.reprovarCampanha(campanha.id, motivo);
      setAviso("Campanha reprovada.");
      await carregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível reprovar");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas e patrocinadores</h1>
          <p className="text-sm text-muted-foreground">
            Quem patrocina, o que foi contratado e o que já foi entregue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={feedGestaoApi.urlRelatorio("campanhas")}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FileDown className="h-4 w-4" /> Relatório
          </a>
          {aba === "patrocinadores" && (
            <button
              onClick={() => setFormulario("patrocinador")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Novo patrocinador
            </button>
          )}
        </div>
      </header>

      {aviso && (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}
      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{erro}</span>
        </div>
      )}

      <div className="flex rounded-md border w-fit">
        {(["campanhas", "patrocinadores"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm capitalize transition-colors first:rounded-l-md last:rounded-r-md",
              aba === a ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {a === "campanhas" ? <Megaphone className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {a}
          </button>
        ))}
      </div>

      {formulario === "patrocinador" && (
        <FormularioPatrocinador
          aoFechar={() => setFormulario(null)}
          aoSalvar={async () => {
            setFormulario(null);
            setAviso("Patrocinador cadastrado.");
            await carregar();
          }}
        />
      )}
      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : aba === "campanhas" ? (
        campanhas.length === 0 ? (
          <VazioGrande
            titulo="Nenhuma campanha ainda"
            texto="Campanhas nascem no Feed: clique em Nova publicação, escolha a categoria Campanhas Patrocinadas e configure abrangência, período e patrocinador por lá."
          />
        ) : (
          <div className="space-y-3">
            {campanhas.map((c) => (
              <CartaoCampanha
                key={c.id}
                campanha={c}
                aoMudar={mudarSituacao}
                aoPagar={pagar}
                aoAprovar={aprovar}
                aoReprovar={reprovar}
              />
            ))}
          </div>
        )
      ) : patrocinadores.length === 0 ? (
        <VazioGrande
          titulo="Nenhum patrocinador cadastrado"
          texto="O patrocinador é a empresa que paga a campanha. É dele o logotipo que aparece na publicação patrocinada."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {patrocinadores.map((p) => (
            <Card key={p.id} className={cn(!p.is_active && "opacity-60")}>
              <CardContent className="flex items-start gap-4 p-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border text-sm font-semibold"
                  style={p.primary_color ? { borderColor: p.primary_color, color: p.primary_color } : undefined}
                >
                  {p.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo_url} alt="" className="h-full w-full rounded-md object-contain" />
                  ) : (
                    p.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{p.name}</h3>
                    {!p.is_active && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">Inativo</span>
                    )}
                    {p.is_house_account && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                        Loja Reallliza · grátis
                      </span>
                    )}
                  </div>
                  <p className="text-xs capitalize text-muted-foreground">{p.sponsor_type}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{p.campanhas?.ativas ?? 0} campanha(s) no ar</span>
                    <span>{numero(p.desempenho?.impressoes ?? 0)} impressões</span>
                    <span>{numero(p.desempenho?.cliques ?? 0)} cliques</span>
                  </div>
                </div>
                <button
                  onClick={() => void alternarPatrocinador(p)}
                  title={p.is_active ? "Desativar" : "Reativar"}
                  className="rounded-md border p-2 hover:bg-muted"
                >
                  <Power className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const SITUACAO_PAGAMENTO: Record<string, { rotulo: string; cor: string }> = {
  pending: { rotulo: "Aguardando pagamento", cor: "bg-amber-500/15 text-amber-600" },
  paid:    { rotulo: "Pago",                 cor: "bg-emerald-500/15 text-emerald-600" },
  waived:  { rotulo: "Isento — loja Reallliza", cor: "bg-blue-500/15 text-blue-600" },
};
const SITUACAO_APROVACAO: Record<string, { rotulo: string; cor: string }> = {
  pending:  { rotulo: "Aguardando aprovação", cor: "bg-amber-500/15 text-amber-600" },
  approved: { rotulo: "Aprovada",             cor: "bg-emerald-500/15 text-emerald-600" },
  rejected: { rotulo: "Reprovada",            cor: "bg-red-500/15 text-red-600" },
};

function CartaoCampanha({
  campanha, aoMudar, aoPagar, aoAprovar, aoReprovar,
}: {
  campanha: Campanha;
  aoMudar: (c: Campanha, novo: string) => void | Promise<void>;
  aoPagar: (c: Campanha) => void | Promise<void>;
  aoAprovar: (c: Campanha) => void | Promise<void>;
  aoReprovar: (c: Campanha, motivo: string) => void | Promise<void>;
}) {
  const [mostrarReprovar, setMostrarReprovar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const s = SITUACOES[campanha.status] ?? SITUACOES.draft;
  const proximas: Record<string, string[]> = {
    draft: ["active"], scheduled: ["active", "paused"], active: ["paused", "ended"],
    paused: ["active", "ended"], ended: [], archived: [],
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{campanha.name}</h3>
              <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", s.cor)}>{s.rotulo}</span>
              <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SITUACAO_PAGAMENTO[campanha.payment_status]?.cor)}>
                {SITUACAO_PAGAMENTO[campanha.payment_status]?.rotulo}
              </span>
              <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SITUACAO_APROVACAO[campanha.approval_status]?.cor)}>
                {SITUACAO_APROVACAO[campanha.approval_status]?.rotulo}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {campanha.sponsor?.name}
              {campanha.contract_ref && ` · contrato ${campanha.contract_ref}`}
              {campanha.budget_cents !== null && ` · ${reais(campanha.budget_cents)}`}
              {campanha.coverage_type === "regional" && campanha.coverage_value && ` · ${campanha.coverage_value}`}
              {campanha.coverage_type === "nacional" && " · nacional"}
              {campanha.duration_days && ` · ${campanha.duration_days} dia(s)`}
            </p>
            {campanha.approval_status === "rejected" && campanha.rejection_reason && (
              <p className="mt-1 text-xs text-destructive">Motivo da reprovação: {campanha.rejection_reason}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {campanha.payment_status === "pending" && (
              <button
                onClick={() => void aoPagar(campanha)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Confirmar pagamento
              </button>
            )}
            {campanha.payment_status !== "pending" && campanha.approval_status === "pending" && !mostrarReprovar && (
              <>
                <button
                  onClick={() => void aoAprovar(campanha)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                >
                  Aprovar
                </button>
                <button
                  onClick={() => setMostrarReprovar(true)}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  Reprovar
                </button>
              </>
            )}
            {(proximas[campanha.status] ?? []).map((novo) => (
              <button
                key={novo}
                onClick={() => void aoMudar(campanha, novo)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                {novo === "active" ? "Ativar" : novo === "paused" ? "Pausar" : "Encerrar"}
              </button>
            ))}
            <a
              href={feedGestaoApi.urlRelatorio("leads", { campaign_id: campanha.id })}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Pedidos
            </a>
          </div>
        </div>

        {mostrarReprovar && (
          <div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <textarea
              className="w-full rounded-md border border-input bg-background p-2 text-xs"
              rows={2}
              placeholder="Motivo da reprovação"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                disabled={!motivo.trim()}
                onClick={() => {
                  void aoReprovar(campanha, motivo.trim());
                  setMostrarReprovar(false);
                  setMotivo("");
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
              >
                Confirmar reprovação
              </button>
              <button
                onClick={() => { setMostrarReprovar(false); setMotivo(""); }}
                className="rounded-md border px-3 py-1.5 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Entregue contra contratado. Sem meta, mostra só o entregue —
            barra de progresso sem denominador é decoração. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Meta rotulo="Impressões" feito={campanha.entregue?.impressoes ?? 0}
            meta={campanha.goal_impressions} pct={campanha.progresso?.impressoes ?? null} />
          <Meta rotulo="Cliques" feito={campanha.entregue?.cliques ?? 0}
            meta={campanha.goal_clicks} pct={campanha.progresso?.cliques ?? null} />
          <Meta rotulo="Pedidos" feito={campanha.entregue?.leads ?? 0}
            meta={campanha.goal_leads} pct={campanha.progresso?.leads ?? null} />
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({
  rotulo, feito, meta, pct,
}: {
  rotulo: string; feito: number; meta: number | null; pct: number | null;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        {pct !== null && (
          <span className={cn("text-xs tabular-nums", pct >= 100 ? "text-emerald-600" : "text-muted-foreground")}>
            {pct}%
          </span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {numero(feito)}
        {meta ? <span className="text-sm font-normal text-muted-foreground"> / {numero(meta)}</span> : null}
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function FormularioPatrocinador({
  aoFechar, aoSalvar,
}: {
  aoFechar: () => void; aoSalvar: () => void | Promise<void>;
}) {
  const [dados, setDados] = useState({
    name: "", sponsor_type: "fabricante", cnpj: "", contact_name: "",
    contact_email: "", website_url: "", logo_url: "", primary_color: "",
    is_house_account: false,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await feedGestaoApi.criarPatrocinador(dados);
      await aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao cadastrar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Novo patrocinador</CardTitle>
        <button onClick={aoFechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome" obrigatorio valor={dados.name}
            aoMudar={(v) => setDados({ ...dados, name: v })} />
          <div>
            <label className="mb-1 block text-xs font-medium">Tipo</label>
            <select
              value={dados.sponsor_type}
              onChange={(e) => setDados({ ...dados, sponsor_type: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
          </div>
          <Campo rotulo="CNPJ" valor={dados.cnpj} aoMudar={(v) => setDados({ ...dados, cnpj: v })} />
          <Campo rotulo="Site" valor={dados.website_url} aoMudar={(v) => setDados({ ...dados, website_url: v })} />
          <Campo rotulo="Contato" valor={dados.contact_name} aoMudar={(v) => setDados({ ...dados, contact_name: v })} />
          <Campo rotulo="E-mail do contato" valor={dados.contact_email} aoMudar={(v) => setDados({ ...dados, contact_email: v })} />
          <Campo rotulo="URL do logotipo" valor={dados.logo_url} aoMudar={(v) => setDados({ ...dados, logo_url: v })} />
          <Campo rotulo="Cor da marca" valor={dados.primary_color} aoMudar={(v) => setDados({ ...dados, primary_color: v })} />
        </div>
        <label className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={dados.is_house_account}
            onChange={(e) => setDados({ ...dados, is_house_account: e.target.checked })}
          />
          <span>
            <span className="font-medium">Esta é a loja da própria Reallliza (sem cobrança)</span>
            <br />
            <span className="text-xs text-muted-foreground">
              Campanhas deste patrocinador não pedem pagamento — só aprovação. Só pode haver um.
            </span>
          </span>
        </label>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={aoFechar} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={() => void enviar()}
            disabled={salvando || !dados.name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Cadastrar"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function Campo({
  rotulo, valor, aoMudar, tipo = "text", obrigatorio,
}: {
  rotulo: string; valor: string; aoMudar: (v: string) => void;
  tipo?: string; obrigatorio?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">
        {rotulo} {obrigatorio && <span className="text-destructive">*</span>}
      </label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function VazioGrande({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
        <Megaphone className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{titulo}</p>
        <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
      </CardContent>
    </Card>
  );
}
