/**
 * Janela de execução: a sequência CONTÍNUA de dias que um serviço ocupa.
 *
 * Jessica 12/08: "Criei um orçamento com serviço estimado em 5 dias e escolhi
 * 28/08 como início. O sistema agendou 28/08, 31/08, 01/09, 02/09 e 03/09.
 * Isso não pode: precisamos de dias contínuos, sem intervalos. Não podemos
 * iniciar no dia 28, parar no dia seguinte e retornar depois. Se não existir
 * sequência disponível, o sistema não deve permitir aquele início."
 *
 * A regra antiga era "5 dias ÚTEIS": o laço avançava um dia por vez e só
 * contava os que passavam no filtro, empilhando até fechar a conta — 28/08 é
 * sexta, então o serviço pulava o fim de semana e voltava na segunda.
 *
 * Aqui a regra é "5 dias CONTÍNUOS": a partir do início escolhido, os N dias
 * seguintes têm de ser TODOS executáveis. Se algum não for, aquele início não
 * serve e a função devolve null.
 *
 * Isomórfico de propósito — sem dependência de servidor —, para que a mesma
 * regra valha no seletor de datas, na validação do orçamento e na conversão
 * em OS. Antes eram três implementações independentes, e nenhuma exigia
 * continuidade.
 */

export interface WorkdayRules {
  /** Cliente autorizou execução em sábado/domingo. */
  allowWeekend: boolean;
  /** Feriados em ISO (YYYY-MM-DD). Feriado bloqueia mesmo com allowWeekend. */
  holidays: Set<string>;
  /** Dias já ocupados (equipe sem capacidade), em ISO. */
  blocked?: Set<string>;
}

/**
 * Formata em YYYY-MM-DD no fuso LOCAL.
 *
 * `toISOString().slice(0,10)` sobre uma data construída como `T00:00:00` local
 * retrocede um dia em fuso negativo — no Brasil isso deslocava a comparação de
 * feriado e a própria data gravada.
 */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Constrói um Date local a partir de YYYY-MM-DD, sem passar por UTC. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isWeekendIso(iso: string): boolean {
  const dow = fromIsoDate(iso).getDay();
  return dow === 0 || dow === 6;
}

/** O serviço pode ser executado neste dia? */
export function isWorkableDay(iso: string, rules: WorkdayRules): boolean {
  if (rules.holidays.has(iso)) return false;
  if (!rules.allowWeekend && isWeekendIso(iso)) return false;
  if (rules.blocked?.has(iso)) return false;
  return true;
}

/**
 * A sequência contínua de `days` dias a partir de `startIso`, ou null se algum
 * dia da sequência não for executável.
 */
export function buildContiguousRun(
  startIso: string,
  days: number,
  rules: WorkdayRules
): string[] | null {
  if (days <= 0) return [];
  const run: string[] = [];
  const cursor = fromIsoDate(startIso);

  for (let i = 0; i < days; i++) {
    const iso = toIsoDate(cursor);
    if (!isWorkableDay(iso, rules)) return null;
    run.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return run;
}

/** O início escolhido comporta o serviço inteiro? */
export function canStartOn(
  startIso: string,
  days: number,
  rules: WorkdayRules
): boolean {
  return buildContiguousRun(startIso, days, rules) !== null;
}

/**
 * Primeira data a partir de `fromIso` (inclusive) que comporta a sequência
 * inteira. Devolve null se não houver nenhuma dentro do horizonte.
 */
export function findNextValidStart(
  fromIso: string,
  days: number,
  rules: WorkdayRules,
  horizonDays = 180
): string | null {
  const cursor = fromIsoDate(fromIso);
  for (let i = 0; i < horizonDays; i++) {
    const iso = toIsoDate(cursor);
    if (buildContiguousRun(iso, days, rules)) return iso;
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/**
 * Todas as datas de início válidas num intervalo — alimenta o seletor, que
 * deve oferecer só dias em que o serviço cabe inteiro.
 */
export function listValidStarts(
  fromIso: string,
  toIso: string,
  days: number,
  rules: WorkdayRules
): string[] {
  const out: string[] = [];
  const cursor = fromIsoDate(fromIso);
  const end = fromIsoDate(toIso);
  while (cursor <= end) {
    const iso = toIsoDate(cursor);
    if (buildContiguousRun(iso, days, rules)) out.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Mensagem pronta para recusar um início inválido. */
export function explainInvalidStart(
  startIso: string,
  days: number,
  rules: WorkdayRules
): string {
  const proxima = findNextValidStart(startIso, days, rules);
  const fmt = (iso: string) => fromIsoDate(iso).toLocaleDateString("pt-BR");
  const base = `O serviço leva ${days} dia(s) seguidos e não cabe a partir de ${fmt(startIso)} sem interrupção.`;
  return proxima
    ? `${base} A primeira data possível é ${fmt(proxima)}.`
    : `${base} Não há sequência disponível nos próximos meses.`;
}
