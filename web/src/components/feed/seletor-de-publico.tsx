"use client";

/**
 * Seletor de público.
 *
 * Os dezesseis recortes pedidos, montados como critérios que se somam. A
 * estimativa é recalculada a cada mudança, antes de salvar qualquer coisa —
 * é ela que responde a única pergunta que importa aqui: "isso alcança
 * quantas pessoas?".
 *
 * Os critérios se combinam com E, não com OU. "Instaladores DO Sudeste QUE
 * fizeram o curso" é o que alguém quer dizer ao marcar três coisas; oferecer
 * OU no mesmo painel produziria públicos enormes por engano.
 *
 * Recorte cujo cadastro está vazio aparece com o aviso do lado, em vez de
 * ficar de fora da lista. Some da lista → parece que o sistema não sabe
 * segmentar por aquilo. Aparece com aviso → fica claro que falta preencher.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Users, AlertTriangle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { feedGestaoApi, type Catalogos } from "@/lib/api/feed";
import { cn } from "@/lib/utils";

/** Critério montado pela tela. Vira a regra JSONB que o compilador entende. */
interface Criterio {
  field: string;
  op: "in" | "contains_any" | "eq";
  values: string[];
}

interface Props {
  /** Público já escolhido, quando editando. */
  audienceRuleId: string | null;
  aoEscolher: (id: string | null) => void;
}

type Opcao = { valor: string; rotulo: string };

export function SeletorDePublico({ audienceRuleId, aoEscolher }: Props) {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [salvos, setSalvos] = useState<{ id: string; name: string; estimated_size: number | null }[]>([]);
  const [modo, setModo] = useState<"salvo" | "novo">("salvo");
  const [criterios, setCriterios] = useState<Record<string, string[]>>({});
  /**
   * `overall_score` e `days_since_signup` são numéricos — não cabem no molde
   * de pastilha dos outros catorze, que é "marcar um valor de uma lista
   * fechada". Aqui o valor é um limiar: "nota geral pelo menos X", "cadastrado
   * há pelo menos X dias". Por isso vivem num estado à parte, e não em
   * `criterios`.
   */
  const [numericos, setNumericos] = useState<{ overall_score: string; days_since_signup: string }>({
    overall_score: "",
    days_since_signup: "",
  });
  const [nome, setNome] = useState("");
  const [estimativa, setEstimativa] = useState<number | null>(null);
  const [estimando, setEstimando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscaCidade, setBuscaCidade] = useState("");
  const [cidades, setCidades] = useState<{ ibge_code: string; name: string; uf: string }[]>([]);

  const [carregando, setCarregando] = useState(true);

  /**
   * Busca os catálogos e os públicos salvos.
   *
   * Isolada da montagem porque precisa rodar de novo se falhar — antes só
   * existia dentro do `useEffect` de montagem, e uma falha (sessão que
   * expirou no meio, rede instável, o que for) deixava `catalogos` null pra
   * sempre. O erro ficava gravado em `erro`, mas o componente inteiro
   * retorna cedo enquanto `catalogos` é null — a mensagem nunca tinha chance
   * de aparecer. Era spinner girando pra sempre, sem explicação e sem saída,
   * exatamente o que a Jéssica relatou como "fica carregando".
   */
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [c, a] = await Promise.all([
        feedGestaoApi.catalogos(),
        apiClient.get<{ audiencias: { id: string; name: string; estimated_size: number | null }[] }>(
          "/feed/audiencias"
        ),
      ]);
      setCatalogos(c);
      setSalvos(a.audiencias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os públicos");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Traduz o que está marcado na tela para a gramática do compilador. */
  const definicao = useMemo(() => {
    const LISTA: Record<string, Criterio["op"]> = {
      uf: "in", region: "in", city_ibge_code: "in", role: "in",
      professional_type: "in", level: "in",
      specialty_id: "contains_any", floor_type_id: "contains_any",
      certification_id: "contains_any", completed_course_id: "contains_any",
      manufacturer_id: "contains_any", partner_id: "contains_any", team_id: "contains_any",
    };
    const regras: Array<
      | { field: string; op: Criterio["op"]; values: string[] }
      | { field: string; op: "eq"; value: boolean }
      | { field: string; op: "gte"; value: number }
    > = Object.entries(criterios)
      .filter(([, v]) => v.length > 0)
      .map(([campo, valores]) =>
        campo === "is_homologated"
          ? { field: campo, op: "eq" as const, value: valores[0] === "sim" }
          : { field: campo, op: LISTA[campo] ?? "in", values: valores }
      );
    for (const [campo, texto] of Object.entries(numericos)) {
      const n = Number(texto);
      if (texto.trim() !== "" && Number.isFinite(n)) {
        regras.push({ field: campo, op: "gte", value: n });
      }
    }
    return { op: "and" as const, rules: regras };
  }, [criterios, numericos]);

  const quantidadeDeCriterios =
    Object.values(criterios).filter((v) => v.length > 0).length +
    Object.values(numericos).filter((v) => v.trim() !== "").length;

  // Estima a cada mudança, com folga para não disparar a cada clique numa
  // sequência rápida de marcações.
  useEffect(() => {
    if (modo !== "novo") return;
    if (quantidadeDeCriterios === 0) {
      setEstimativa(null);
      return;
    }
    const t = setTimeout(async () => {
      setEstimando(true);
      setErro(null);
      try {
        const r = await apiClient.post<{ estimativa: number }>("/feed/audiencias", {
          definition: definicao,
          apenas_estimar: true,
        });
        setEstimativa(r.estimativa);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível estimar");
        setEstimativa(null);
      } finally {
        setEstimando(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [definicao, modo, quantidadeDeCriterios]);

  const buscar = useCallback(async (termo: string) => {
    if (termo.trim().length < 2) {
      setCidades([]);
      return;
    }
    try {
      const r = await feedGestaoApi.buscarCidade(termo.trim());
      setCidades(r.cidades);
    } catch {
      setCidades([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void buscar(buscaCidade), 350);
    return () => clearTimeout(t);
  }, [buscaCidade, buscar]);

  const alternar = (campo: string, valor: string) => {
    setCriterios((atual) => {
      const lista = atual[campo] ?? [];
      const nova = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...atual, [campo]: nova };
    });
  };

  const salvar = async () => {
    if (!nome.trim()) {
      setErro("Dê um nome ao público para poder reaproveitá-lo depois");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await apiClient.post<{ id: string; name: string; alcance: number }>(
        "/feed/audiencias",
        { name: nome.trim(), definition: definicao }
      );
      setSalvos((s) => [...s, { id: r.id, name: r.name, estimated_size: r.alcance }]);
      aoEscolher(r.id);
      setModo("salvo");
      setCriterios({});
      setNumericos({ overall_score: "", days_since_signup: "" });
      setNome("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o público");
    } finally {
      setSalvando(false);
    }
  };

  const saude = catalogos?.saude_do_cadastro;

  /** Quantas pessoas têm este dado preenchido — 0 significa recorte inútil hoje. */
  const preenchimento = (campo: string): number | null => {
    if (!saude) return null;
    if (campo === "uf" || campo === "region") return saude.com_uf;
    if (campo === "city_ibge_code") return saude.com_cidade;
    if (campo === "floor_type_id") return saude.com_tipo_de_piso;
    if (campo === "certification_id") return saude.com_certificacao;
    if (campo === "manufacturer_id") return saude.com_fabricante;
    return null;
  };

  if (!catalogos) {
    if (erro) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
          </span>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {carregando ? "Tentando..." : "Tentar de novo"}
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando públicos...
      </div>
    );
  }

  const grupos: { campo: string; opcoes: Opcao[] }[] = [
    { campo: "uf", opcoes: catalogos.ufs.map((u) => ({ valor: u.uf, rotulo: `${u.uf} — ${u.name}` })) },
    { campo: "region", opcoes: catalogos.regioes.map((r) => ({ valor: r, rotulo: r })) },
    { campo: "role", opcoes: catalogos.papeis.map((p) => ({ valor: p.valor, rotulo: p.rotulo })) },
    { campo: "professional_type", opcoes: catalogos.tipos_profissionais.map((p) => ({ valor: p.valor, rotulo: p.rotulo })) },
    { campo: "level", opcoes: catalogos.niveis.map((n) => ({ valor: n.valor, rotulo: n.rotulo })) },
    { campo: "specialty_id", opcoes: catalogos.especialidades.map((e) => ({ valor: e.id, rotulo: e.name })) },
    { campo: "floor_type_id", opcoes: catalogos.tipos_de_piso.map((t) => ({ valor: t.id, rotulo: t.name })) },
    { campo: "certification_id", opcoes: catalogos.certificacoes.map((c) => ({ valor: c.id, rotulo: c.name })) },
    { campo: "completed_course_id", opcoes: catalogos.cursos.map((c) => ({ valor: c.id, rotulo: c.title })) },
    { campo: "manufacturer_id", opcoes: catalogos.fabricantes.map((f) => ({ valor: f.id, rotulo: f.name })) },
    { campo: "partner_id", opcoes: catalogos.parceiros.map((p) => ({ valor: p.id, rotulo: p.company_name })) },
    { campo: "team_id", opcoes: catalogos.equipes.map((e) => ({ valor: e.id, rotulo: e.name })) },
    { campo: "is_homologated", opcoes: [{ valor: "sim", rotulo: "Somente homologados" }] },
  ];

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border w-fit text-sm">
        <button
          type="button"
          onClick={() => setModo("salvo")}
          className={cn("rounded-l-md px-3 py-1.5", modo === "salvo" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          Público salvo
        </button>
        <button
          type="button"
          onClick={() => setModo("novo")}
          className={cn("rounded-r-md px-3 py-1.5", modo === "novo" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          Montar novo
        </button>
      </div>

      {modo === "salvo" ? (
        <select
          value={audienceRuleId ?? ""}
          onChange={(e) => aoEscolher(e.target.value || null)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos que enxergam o feed</option>
          {salvos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.estimated_size !== null ? ` (${a.estimated_size} pessoas)` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              {quantidadeDeCriterios === 0
                ? "Marque ao menos um critério"
                : estimando
                  ? "Calculando..."
                  : estimativa === null
                    ? "—"
                    : estimativa === 0
                      ? "Nenhuma pessoa atende a esses critérios"
                      : `Alcança ${estimativa} ${estimativa === 1 ? "pessoa" : "pessoas"}`}
            </span>
            {quantidadeDeCriterios > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCriterios({});
                  setNumericos({ overall_score: "", days_since_signup: "" });
                }}
                className="text-xs text-muted-foreground hover:underline"
              >
                Limpar critérios
              </button>
            )}
          </div>

          {/* Cidade tem busca própria: são 5.571 municípios, e mandar todos
              para o navegador a cada abertura é meio megabyte por nada. */}
          <div>
            <RotuloCampo
              rotulo={catalogos.rotulos.city_ibge_code ?? "Cidade"}
              preenchido={preenchimento("city_ibge_code")}
              total={saude?.perfis_ativos ?? null}
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={buscaCidade}
                onChange={(e) => setBuscaCidade(e.target.value)}
                placeholder="Digite o nome da cidade"
                className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm"
              />
            </div>
            {cidades.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cidades.map((c) => (
                  <Pastilha
                    key={c.ibge_code}
                    rotulo={`${c.name}/${c.uf}`}
                    marcada={(criterios.city_ibge_code ?? []).includes(c.ibge_code)}
                    aoClicar={() => alternar("city_ibge_code", c.ibge_code)}
                  />
                ))}
              </div>
            )}
            {(criterios.city_ibge_code ?? []).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {criterios.city_ibge_code.length} cidade(s) escolhida(s)
              </p>
            )}
          </div>

          {grupos.map(({ campo, opcoes }) => (
            <div key={campo}>
              <RotuloCampo
                rotulo={catalogos.rotulos[campo] ?? campo}
                preenchido={preenchimento(campo)}
                total={saude?.perfis_ativos ?? null}
                vazio={opcoes.length === 0}
              />
              {opcoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum item cadastrado ainda.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {opcoes.map((o) => (
                    <Pastilha
                      key={o.valor}
                      rotulo={o.rotulo}
                      marcada={(criterios[campo] ?? []).includes(o.valor)}
                      aoClicar={() => alternar(campo, o.valor)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/*
            Os dois numéricos: limiar, não lista. "Nota geral pelo menos X" e
            "cadastrado há pelo menos X dias" — sempre calculáveis (nota tem
            piso zero, dias de cadastro vem de `created_at`), então não levam
            o aviso de dado ausente que os outros catorze levam.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">
                {catalogos.rotulos.overall_score ?? "Nota geral"} — mínimo
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={numericos.overall_score}
                onChange={(e) =>
                  setNumericos((s) => ({ ...s, overall_score: e.target.value }))
                }
                placeholder="Ex.: 80"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {catalogos.rotulos.days_since_signup ?? "Dias de cadastro"} — mínimo
              </label>
              <input
                type="number"
                min={0}
                value={numericos.days_since_signup}
                onChange={(e) =>
                  setNumericos((s) => ({ ...s, days_since_signup: e.target.value }))
                }
                placeholder="Ex.: 30"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium">Nome deste público</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Instaladores homologados do Sudeste"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || quantidadeDeCriterios === 0 || !nome.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar e usar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RotuloCampo({
  rotulo, preenchido, total, vazio,
}: {
  rotulo: string; preenchido: number | null; total: number | null; vazio?: boolean;
}) {
  const alerta =
    !vazio && preenchido !== null && total !== null && preenchido < total;
  return (
    <label className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium">
      {rotulo}
      {alerta && (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          {preenchido === 0
            ? "ninguém tem este dado preenchido"
            : `só ${preenchido} de ${total} têm este dado`}
        </span>
      )}
    </label>
  );
}

function Pastilha({
  rotulo, marcada, aoClicar,
}: {
  rotulo: string; marcada: boolean; aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={marcada}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
        marcada
          ? "border-primary bg-primary/10 text-foreground"
          : "hover:bg-muted"
      )}
    >
      {rotulo}
      {marcada && <X className="h-3 w-3" />}
    </button>
  );
}
