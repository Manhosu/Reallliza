"use client";

/**
 * Painel geral do Feed.
 *
 * Os dezoito números pedidos, os gráficos de evolução, o mapa de horários e
 * o mapa do Brasil. Tudo do mesmo período, escolhido num lugar só — dois
 * cartões com janelas diferentes na mesma tela é como se compara maçã com
 * laranja sem perceber.
 *
 * O aviso de cadastro incompleto fica no topo, e não escondido num canto,
 * porque com a base de hoje quase toda segmentação interessante devolve
 * público vazio. Sem esse aviso a leitura é "a segmentação não funciona".
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye, MousePointerClick, Users, Heart, MessageCircle, Share2, Bookmark,
  Download, Target, TrendingUp, Megaphone, FileDown, AlertTriangle, Video,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { feedGestaoApi, type PainelFeed, type UfDoMapa, type Catalogos } from "@/lib/api/feed";
import { cn } from "@/lib/utils";

const JANELAS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "12 meses" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const numero = (n: number) =>
  n >= 1000 ? n.toLocaleString("pt-BR") : String(n ?? 0);

export default function PainelDoFeed() {
  const [dias, setDias] = useState(30);
  const [painel, setPainel] = useState<PainelFeed | null>(null);
  const [mapa, setMapa] = useState<UfDoMapa[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);

    Promise.all([
      feedGestaoApi.painel(dias),
      feedGestaoApi.mapa(dias),
      feedGestaoApi.catalogos(),
    ])
      .then(([p, m, c]) => {
        if (!vivo) return;
        setPainel(p);
        setMapa(m.ufs);
        setCatalogos(c);
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar o painel"))
      .finally(() => vivo && setCarregando(false));

    return () => {
      vivo = false;
    };
  }, [dias]);

  const serie = useMemo(() => {
    if (!painel) return [];
    // Ordena pela data ISO e só depois formata. Ordenar pelo rótulo "dd/mm"
    // põe 28/07 depois de 17/08, porque a comparação é de texto — o gráfico
    // vira uma linha que volta no tempo na virada do mês.
    return Object.entries(painel.evolucao_diaria)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({
        dia: new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        ...v,
      }));
  }, [painel]);

  const porHora = useMemo(() => {
    if (!painel) return [];
    const total = new Array(24).fill(0);
    for (const a of painel.acesso) total[a.hora] += a.eventos;
    return total.map((eventos, hora) => ({ hora: `${String(hora).padStart(2, "0")}h`, eventos }));
  }, [painel]);

  const porDiaDaSemana = useMemo(() => {
    if (!painel) return [];
    const total = new Array(7).fill(0);
    for (const a of painel.acesso) total[a.dia_semana] += a.eventos;
    return total.map((eventos, i) => ({ dia: DIAS_SEMANA[i], eventos }));
  }, [painel]);

  const maiorImpressao = Math.max(1, ...mapa.map((u) => u.impressoes));
  const saude = catalogos?.saude_do_cadastro;

  if (erro) {
    return (
      <div className="p-6">
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm">
            <p className="font-medium text-destructive">Não foi possível carregar o painel.</p>
            <p className="mt-1 text-muted-foreground">{erro}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel do Feed</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho de conteúdo e campanhas nos últimos {dias} dias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border">
            {JANELAS.map((j) => (
              <button
                key={j.dias}
                onClick={() => setDias(j.dias)}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors first:rounded-l-md last:rounded-r-md",
                  dias === j.dias
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {j.rotulo}
              </button>
            ))}
          </div>

          <a
            href={feedGestaoApi.urlRelatorio("publicacoes", { dias })}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FileDown className="h-4 w-4" />
            Baixar relatório
          </a>
        </div>
      </header>

      {/* O aviso vem antes dos números: sem ele, "alcance 0" parece defeito
          quando na verdade é cadastro em branco. */}
      {saude && saude.com_cidade < saude.perfis_ativos && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium">A segmentação depende de cadastro que ainda está em branco.</p>
              <p className="text-muted-foreground">
                {saude.com_uf} de {saude.perfis_ativos} profissionais têm estado preenchido,{" "}
                {saude.com_cidade} têm cidade e {saude.com_tipo_de_piso} têm tipo de piso.
                Uma campanha segmentada por cidade hoje alcançaria{" "}
                {saude.com_cidade === 0 ? "ninguém" : `no máximo ${saude.com_cidade} pessoas`}.
                {saude.aparelhos_registrados === 0 &&
                  " Nenhum aparelho está registrado para notificação — o envio não chega a ninguém."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {carregando || !painel ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador icone={Users} rotulo="Usuários alcançados" valor={painel.totais.usuarios_alcancados}
              nota="Pessoas distintas no período" />
            <Indicador icone={Eye} rotulo="Impressões" valor={painel.totais.impressoes}
              nota={`${numero(painel.totais.visualizacoes)} visualizações`} />
            <Indicador icone={MousePointerClick} rotulo="Cliques" valor={painel.totais.cliques}
              nota={`CTR de ${painel.totais.ctr}%`} />
            <Indicador icone={Target} rotulo="Conversões" valor={painel.totais.conversoes}
              nota={`${numero(painel.totais.leads)} pedidos recebidos`} destaque />
            <Indicador icone={Megaphone} rotulo="Campanhas ativas" valor={painel.totais.campanhas_ativas}
              nota={`${numero(painel.totais.patrocinadores_ativos)} patrocinadores`} />
            <Indicador icone={TrendingUp} rotulo="Taxa de engajamento" valor={painel.totais.taxa_engajamento}
              sufixo="%" nota="Sobre alcance único" />
            <Indicador icone={Video} rotulo="Publicações no ar" valor={painel.totais.publicacoes_no_ar}
              nota={`${numero(painel.totais.publicacoes)} no total`} />
            <Indicador icone={Download} rotulo="Downloads" valor={painel.totais.downloads}
              nota="Materiais baixados" />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Miudo icone={Heart} rotulo="Curtidas" valor={painel.totais.curtidas} />
            <Miudo icone={MessageCircle} rotulo="Comentários" valor={painel.totais.comentarios} />
            <Miudo icone={Share2} rotulo="Compartilhamentos" valor={painel.totais.compartilhamentos} />
            <Miudo icone={Bookmark} rotulo="Salvamentos" valor={painel.totais.salvamentos} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crescimento no período</CardTitle>
            </CardHeader>
            <CardContent>
              {serie.length === 0 ? (
                <Vazio texto="Ainda não há movimento no período escolhido." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={serie}>
                    <defs>
                      <linearGradient id="gAlcance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dia" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 13 }}
                      labelFormatter={(v) => `Dia ${v}`}
                    />
                    <Area type="monotone" dataKey="impressoes" name="Impressões"
                      stroke="var(--primary)" fill="url(#gAlcance)" strokeWidth={2} />
                    <Area type="monotone" dataKey="cliques" name="Cliques"
                      stroke="#2C7A55" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="leads" name="Pedidos"
                      stroke="#B87A16" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horários de maior acesso</CardTitle>
              </CardHeader>
              <CardContent>
                {painel.acesso.length === 0 ? (
                  <Vazio texto="Sem acessos registrados no período." />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porHora}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="hora" fontSize={11} tickLine={false} axisLine={false} interval={2} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                      <Bar dataKey="eventos" name="Acessos" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Horário de Brasília.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dias da semana com maior movimento</CardTitle>
              </CardHeader>
              <CardContent>
                {painel.acesso.length === 0 ? (
                  <Vazio texto="Sem acessos registrados no período." />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porDiaDaSemana}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="dia" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                      <Bar dataKey="eventos" name="Acessos" radius={[3, 3, 0, 0]}>
                        {porDiaDaSemana.map((d, i) => (
                          <Cell key={i} fill={i === 0 || i === 6 ? "#94A1A2" : "var(--primary)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Fim de semana em cinza.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Onde estão os profissionais</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Grade das 27 UFs, ordenada por movimento. Estado sem
                  ninguém aparece igual: é informação de cobertura, e some
                  num mapa que só mostra onde já há gente. */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                {mapa.map((u) => {
                  const intensidade = u.impressoes / maiorImpressao;
                  return (
                    <div
                      key={u.uf}
                      title={`${u.nome} — ${u.profissionais} profissional(is), ${numero(u.impressoes)} impressões`}
                      className="rounded-md border p-2 text-center transition-colors"
                      style={{
                        backgroundColor:
                          u.impressoes > 0
                            ? `color-mix(in srgb, var(--primary) ${Math.max(12, intensidade * 100)}%, transparent)`
                            : undefined,
                      }}
                    >
                      <div className="text-sm font-semibold">{u.uf}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {u.profissionais}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                O número embaixo da sigla é a quantidade de profissionais ativos; a cor mostra o
                volume de impressões. Estados sem cor não tiveram entrega no período.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking titulo="Publicações mais vistas" itens={painel.destaques.mais_vistas} unidade="impressões" />
            <Ranking titulo="Maior engajamento" itens={painel.destaques.maior_engajamento} unidade="interações" />
            <Ranking titulo="Vídeos mais assistidos" itens={painel.destaques.videos_mais_assistidos} unidade="reproduções" />
            <Ranking titulo="Mais pedidos gerados" itens={painel.destaques.mais_leads} unidade="pedidos" />
          </div>

          {painel.campanhas_por_desempenho.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campanhas por desempenho</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Campanha</th>
                      <th className="pb-2 pr-4 font-medium">Situação</th>
                      <th className="pb-2 pr-4 text-right font-medium">Impressões</th>
                      <th className="pb-2 pr-4 text-right font-medium">Cliques</th>
                      <th className="pb-2 text-right font-medium">Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.campanhas_por_desempenho.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/feed/campanhas?id=${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{c.status}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{numero(c.impressoes)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{numero(c.cliques)}</td>
                        <td className="py-2 text-right tabular-nums">{numero(c.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Indicador({
  icone: Icone, rotulo, valor, nota, sufixo, destaque,
}: {
  icone: React.ElementType; rotulo: string; valor: number;
  nota?: string; sufixo?: string; destaque?: boolean;
}) {
  return (
    <Card className={cn(destaque && "border-primary/40")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</span>
          <Icone className={cn("h-4 w-4", destaque ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {numero(valor ?? 0)}
          {sufixo && <span className="text-base font-normal text-muted-foreground">{sufixo}</span>}
        </div>
        {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

function Miudo({ icone: Icone, rotulo, valor }: { icone: React.ElementType; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Icone className="h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-lg font-semibold tabular-nums leading-none">{numero(valor ?? 0)}</div>
        <div className="text-xs text-muted-foreground">{rotulo}</div>
      </div>
    </div>
  );
}

function Ranking({
  titulo, itens, unidade,
}: {
  titulo: string;
  itens?: { id: string; title: string; valor: number; is_sponsored: boolean }[];
  unidade: string;
}) {
  const lista = (itens ?? []).filter((i) => i.valor > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {lista.length === 0 ? (
          <Vazio texto="Nada a mostrar ainda." />
        ) : (
          <ol className="space-y-2">
            {lista.map((i, pos) => (
              <li key={i.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{pos + 1}</span>
                <span className="flex-1 truncate">
                  {i.title}
                  {i.is_sponsored && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Patrocinado
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums font-medium">{numero(i.valor)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{unidade}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {texto}
    </div>
  );
}
