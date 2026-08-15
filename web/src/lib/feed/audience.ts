import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Motor de segmentação de público do Feed.
 *
 * A regra é gravada como JSONB com gramática fechada — não como SQL. SQL
 * guardado no banco é injeção esperando acontecer e ninguém consegue revisar;
 * tabela de critérios vira uma dezena de junções e uma interface insuportável.
 *
 * O compilador só conhece os campos do mapa abaixo. Campo fora dele é erro,
 * não consulta silenciosa. Valores viajam sempre como parâmetro.
 */

export type Operador =
  | "eq" | "neq" | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte"
  | "contains_any" | "contains_all"
  | "is_null" | "is_not_null";

export interface Criterio {
  field: string;
  op: Operador;
  value?: unknown;
  values?: unknown[];
}
export interface NoLogico {
  op: "and" | "or" | "not";
  rules: RegraAudiencia[];
}
export type RegraAudiencia = Criterio | NoLogico;

function ehNoLogico(r: RegraAudiencia): r is NoLogico {
  return (r as NoLogico).rules !== undefined;
}

/**
 * Campos que podem ser usados numa regra.
 *
 * `array` marca os que são listas no perfil — só eles aceitam contains_*.
 */
const CAMPOS: Record<string, { coluna: string; tipo: "texto" | "numero" | "bool" | "array" }> = {
  role:                 { coluna: "role",                 tipo: "texto" },
  uf:                   { coluna: "uf",                   tipo: "texto" },
  city_ibge_code:       { coluna: "city_ibge_code",       tipo: "texto" },
  professional_type:    { coluna: "professional_type",    tipo: "texto" },
  is_homologated:       { coluna: "is_homologated",       tipo: "bool" },
  level:                { coluna: "level",                tipo: "texto" },
  overall_score:        { coluna: "overall_score",        tipo: "numero" },
  days_since_signup:    { coluna: "days_since_signup",    tipo: "numero" },
  specialty_id:         { coluna: "specialty_ids",        tipo: "array" },
  completed_course_id:  { coluna: "completed_course_ids", tipo: "array" },
  team_id:              { coluna: "team_ids",             tipo: "array" },
  partner_id:           { coluna: "partner_ids",          tipo: "array" },
};

const PROFUNDIDADE_MAX = 3;

export class RegraInvalida extends Error {}

interface SqlCompilado {
  sql: string;
  params: unknown[];
}

function compilarCriterio(c: Criterio, params: unknown[]): string {
  const campo = CAMPOS[c.field];
  if (!campo) {
    throw new RegraInvalida(`Campo "${c.field}" não pode ser usado numa audiência`);
  }
  const col = `p."${campo.coluna}"`;

  /**
   * Valor NUNCA entra no texto do SQL — vira uma referência a uma posição de
   * `$1`, o parâmetro JSONB que o Postgres recebe separado via EXECUTE ...
   * USING. É o que torna a regra imune a injeção sem depender de escapar
   * string corretamente.
   */
  const ref = (v: unknown, como: "texto" | "numero" | "bool") => {
    params.push(v);
    const i = params.length - 1;
    const bruto = `($1->>${i})`;
    return como === "numero" ? `${bruto}::NUMERIC`
         : como === "bool"   ? `${bruto}::BOOLEAN`
         : bruto;
  };
  // ARRAY(subconsulta) constrói um array de verdade. `ANY(subconsulta)` seria
  // lido como a forma de conjunto e compararia texto com texto[].
  const refLista = (vs: unknown[], comoUuid: boolean) => {
    params.push(vs);
    const i = params.length - 1;
    return `ARRAY(SELECT x${comoUuid ? "::UUID" : ""}
             FROM jsonb_array_elements_text($1->${i}) AS t(x))`;
  };

  switch (c.op) {
    case "is_null":     return `${col} IS NULL`;
    case "is_not_null": return `${col} IS NOT NULL`;

    case "eq":
      return campo.tipo === "bool"
        ? `${col} IS NOT DISTINCT FROM ${ref(c.value, "bool")}`
        : `${col}::TEXT = ${ref(c.value, "texto")}`;
    case "neq":
      return `${col}::TEXT IS DISTINCT FROM ${ref(c.value, "texto")}`;

    case "gt": case "gte": case "lt": case "lte": {
      if (campo.tipo !== "numero") {
        throw new RegraInvalida(`"${c.field}" não é numérico e não aceita ${c.op}`);
      }
      const n = Number(c.value);
      if (!Number.isFinite(n)) throw new RegraInvalida(`Valor não numérico em "${c.field}"`);
      const sinal = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[c.op];
      return `${col} ${sinal} ${ref(n, "numero")}`;
    }

    case "in": case "not_in": {
      const lista = Array.isArray(c.values) ? c.values : [];
      // Lista vazia: "in" não casa com ninguém, "not_in" casa com todos.
      if (lista.length === 0) return c.op === "in" ? "false" : "true";
      const negar = c.op === "not_in" ? "NOT " : "";
      return `${negar}(${col}::TEXT = ANY(${refLista(lista, false)}))`;
    }

    case "contains_any": case "contains_all": {
      if (campo.tipo !== "array") {
        throw new RegraInvalida(`"${c.field}" não é uma lista e não aceita ${c.op}`);
      }
      const lista = Array.isArray(c.values) ? c.values : [];
      if (lista.length === 0) return "false";
      // && é "tem interseção"; @> é "contém todos".
      const operador = c.op === "contains_any" ? "&&" : "@>";
      return `COALESCE(${col}, '{}'::UUID[]) ${operador} ${refLista(lista, true)}`;
    }

    default:
      throw new RegraInvalida(`Operador "${c.op}" não existe`);
  }
}

function compilarNo(r: RegraAudiencia, params: unknown[], nivel: number): string {
  if (nivel > PROFUNDIDADE_MAX) {
    throw new RegraInvalida(
      `Regra aninhada demais (máximo ${PROFUNDIDADE_MAX} níveis)`
    );
  }
  if (!ehNoLogico(r)) return compilarCriterio(r as Criterio, params);

  const partes = (r.rules ?? []).map((f) => compilarNo(f, params, nivel + 1));
  if (partes.length === 0) return "true"; // "and" sem critério = todo mundo

  if (r.op === "not") return `NOT (${partes.join(" AND ")})`;
  return `(${partes.join(r.op === "or" ? " OR " : " AND ")})`;
}

/** Traduz a regra num predicado SQL parametrizado sobre a visão de perfis. */
export function compilarRegra(definicao: RegraAudiencia): SqlCompilado {
  const params: unknown[] = [];
  const sql = compilarNo(definicao, params, 1);
  return { sql, params };
}

/**
 * Resolve a regra e materializa a lista de destinatários.
 *
 * Materializar em vez de avaliar a cada leitura: com a regra aplicada por
 * requisição, cada publicação da página viraria uma varredura de perfis.
 * Assim o feed consulta um índice.
 *
 * O preço é o atraso: quem sobe de nível às 14h só entra na audiência de
 * "ouro" no próximo recálculo. Aceitável para conteúdo; se incomodar, o
 * remédio barato é recalcular as participações do usuário no login.
 */
export async function resolverAudiencia(
  supabase: SupabaseClient,
  ruleId: string
): Promise<{ total: number }> {
  const { data: regra, error } = await supabase
    .from("feed_audience_rules")
    .select("id, definition")
    .eq("id", ruleId)
    .single();

  if (error || !regra) throw new RegraInvalida("Audiência não encontrada");

  const { sql, params } = compilarRegra(regra.definition as RegraAudiencia);

  const { data, error: errExec } = await supabase.rpc("feed_resolver_audiencia", {
    p_rule_id: ruleId,
    p_predicado: sql,
    p_params: params,
  });

  if (errExec) {
    throw new Error(`Falha ao resolver a audiência: ${errExec.message}`);
  }

  const total = Number(data ?? 0);
  return { total };
}

/** Só conta, sem materializar — usado no "estimar alcance" do editor. */
export async function estimarAudiencia(
  supabase: SupabaseClient,
  definicao: RegraAudiencia
): Promise<number> {
  const { sql, params } = compilarRegra(definicao);
  const { data, error } = await supabase.rpc("feed_estimar_audiencia", {
    p_predicado: sql,
    p_params: params,
  });
  if (error) throw new Error(`Falha ao estimar: ${error.message}`);
  return Number(data ?? 0);
}
