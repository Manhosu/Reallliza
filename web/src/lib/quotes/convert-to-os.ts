/**
 * Conversão de orçamento pago em Ordem de Serviço (Marco 6 / Bloco 4).
 *
 * Chamado quando o pagamento de um orçamento é confirmado (webhook do
 * Asaas ou confirmação manual do admin). Idempotente: um orçamento já
 * convertido apenas retorna a OS existente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pickDominantSpecialty } from "./dominant-specialty";
import { computeTeamAvailability } from "@/lib/teams/team-availability";
import { buildContiguousRun, findNextValidStart } from "./schedule-window";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** ISO (2026-08-24) para o formato que a operação lê (24/08/2026). */
function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export interface ConvertResult {
  ok: boolean;
  service_order_id?: string;
  error?: string;
}

interface QuoteItemRow {
  service_id: string | null;
  service_name: string;
  unit: string | null;
  unit_price: number;
  quantity: number;
}

export async function convertQuoteToServiceOrder(
  supabase: SupabaseClient,
  quoteId: string
): Promise<ConvertResult> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, items:quote_items(*)")
    .eq("id", quoteId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "Orçamento não encontrado" };
  }

  // Idempotência: já convertido.
  if (quote.status === "converted" && quote.service_order_id) {
    return { ok: true, service_order_id: quote.service_order_id };
  }

  const createdBy = (quote.created_by as string | null) || SYSTEM_USER_ID;

  // Jessica 27/07 D2: tenta auto-assign a equipe qualificada quando modalidade
  // reallliza + service_date + categorias vinculadas a specialty. Fallback:
  // status 'awaiting_assignment' pra admin resolver manual.
  let autoAssignedTeamId: string | null = null;
  // Início real da execução. Costumava ser sempre `quote.service_date`, mesmo
  // quando a equipe já estava comprometida ali — era o que empilhava duas OS
  // no mesmo dia (Jessica 13/08).
  let scheduleStart: string | null = null;
  if (
    quote.modality === "reallliza" &&
    quote.service_date &&
    Array.isArray(quote.items)
  ) {
    try {
      const { specialty_id } = await pickDominantSpecialty(
        supabase,
        (quote.items as QuoteItemRow[]).map((it) => ({
          service_id: it.service_id,
          quantity: Number(it.quantity),
        }))
      );
      if (specialty_id) {
        const daysNeeded = Math.max(
          1,
          Math.ceil(Number(quote.total_hours ?? 0) / 8)
        );
        const teams = await computeTeamAvailability(supabase, {
          specialty_id,
          days_needed: daysNeeded,
          from: quote.service_date as string,
          horizon: 60,
          // Faltava passar: as janelas vinham calculadas como se fim de semana
          // nunca fosse permitido, então não batiam com o que seria agendado.
          allow_weekend: !!(quote as { allow_weekend?: boolean }).allow_weekend,
        });

        // Preferência é a data que a loja pediu. Se nenhuma equipe tem a
        // sequência inteira livre ali, vale a janela mais próxima — antes o
        // match exigia início exato, e como a busca de janela agora exige dias
        // contíguos e livres, um dia ocupado deixaria a OS sem equipe nenhuma.
        const comJanela = teams.filter((t) => t.available_windows.length > 0);
        const exata = comJanela.find(
          (t) => t.available_windows[0].start === (quote.service_date as string)
        );
        const maisCedo = comJanela.reduce<(typeof comJanela)[number] | null>(
          (melhor, t) =>
            !melhor ||
            t.available_windows[0].start < melhor.available_windows[0].start
              ? t
              : melhor,
          null
        );
        const escolhida = exata ?? maisCedo;
        if (escolhida) {
          autoAssignedTeamId = escolhida.team_id;
          scheduleStart = escolhida.available_windows[0].start;
        }
      }
    } catch (err) {
      console.warn(
        `convertQuote: auto-assign failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // Mudar a data em silêncio é pior que mudar avisando: quem abrir a OS
  // precisa entender por que a execução não começa no dia que a loja pediu.
  const avisoDeslocamento =
    scheduleStart && scheduleStart !== quote.service_date
      ? `Início reagendado de ${formatarData(quote.service_date as string)} para ${formatarData(scheduleStart)}: a equipe não tinha a sequência de dias livre na data pedida.`
      : null;

  const initialStatus =
    quote.modality === "reallliza"
      ? autoAssignedTeamId
        ? "assigned"
        : "awaiting_assignment"
      : "pending";
  // Jessica 27/07 D4: copia anexos da quote pra OS (materiais + planta baixa)
  const materialFiles = Array.isArray(quote.material_files)
    ? quote.material_files
    : [];
  const projectFiles = Array.isArray(quote.project_files)
    ? quote.project_files
    : [];

  const { data: os, error: osErr } = await supabase
    .from("service_orders")
    .insert({
      title: `Orçamento #${quote.quote_number} — ${quote.client_name}`,
      status: initialStatus,
      partner_id: quote.partner_id,
      team_id: autoAssignedTeamId,
      client_name: quote.client_name,
      client_phone: quote.client_phone,
      client_email: quote.client_email,
      address_street: quote.address_street,
      address_city: quote.address_city,
      address_state: quote.address_state,
      address_zip: quote.address_zip,
      notes: avisoDeslocamento
        ? [quote.notes, avisoDeslocamento].filter(Boolean).join("\n\n")
        : quote.notes,
      material_files: materialFiles,
      project_files: projectFiles,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (osErr || !os) {
    console.error(`convertQuote: failed to create OS: ${osErr?.message}`);
    return { ok: false, error: "Falha ao criar a Ordem de Serviço" };
  }

  // 2. Itens da OS a partir dos itens do orçamento (modelo Cenize, kind 'S').
  const items = (quote.items as QuoteItemRow[] | null) || [];
  if (items.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(
        items.map((it, idx) => ({
          service_order_id: os.id,
          position: idx + 1,
          kind: "S",
          service_id: it.service_id,
          description: it.service_name,
          unit: it.unit,
          unit_value: it.unit_price,
          quantity: it.quantity,
        }))
      );
    if (itemsErr) {
      // Rollback da OS se os itens falharem.
      await supabase.from("service_orders").delete().eq("id", os.id);
      console.error(`convertQuote: failed items: ${itemsErr.message}`);
      return { ok: false, error: "Falha ao criar os itens da OS" };
    }
  }

  // 3. Histórico de status.
  await supabase.from("os_status_history").insert({
    service_order_id: os.id,
    from_status: null,
    to_status: initialStatus,
    changed_by: createdBy,
    notes: `Gerada a partir do orçamento #${quote.quote_number}`,
  });

  // 4. Marca o orçamento como convertido.
  await supabase
    .from("quotes")
    .update({
      status: "converted",
      service_order_id: os.id,
      paid_at: quote.paid_at || new Date().toISOString(),
    })
    .eq("id", quoteId);

  // 5. Agendamento automatico (Fase 2 — modalidade Reallliza).
  // Jornadas de 8h por dia a partir de service_date. Se nao tem data, pula.
  if (
    quote.modality === "reallliza" &&
    quote.service_date &&
    Number(quote.total_hours) > 0
  ) {
    const scheduled = await scheduleReallizaJobs(supabase, os.id, {
      // A janela escolhida manda; `quote.service_date` só quando não houve
      // equipe qualificada com agenda livre.
      service_date: scheduleStart ?? (quote.service_date as string),
      service_time: (quote.service_time as string | null) ?? "08:00",
      total_hours: Number(quote.total_hours),
      partner_id: (quote.partner_id as string | null) ?? null,
      team_id: autoAssignedTeamId,
      allow_weekend: !!(quote as { allow_weekend?: boolean }).allow_weekend,
    });

    // Jessica 10/08: espelha a data na propria OS. Sem isso o calendario da
    // equipe fica vazio nos dois caminhos — nem pelos schedules, nem pelo
    // fallback de scheduled_date (api/teams/[id]/calendar/route.ts).
    if (scheduled.first_date) {
      const { error: schedMirrorErr } = await supabase
        .from("service_orders")
        .update({
          scheduled_date: scheduled.first_date,
          scheduled_start_time: scheduled.start_time,
          scheduled_end_time: scheduled.end_time,
        })
        .eq("id", os.id);
      if (schedMirrorErr) {
        console.error(
          `convertQuote: falha ao gravar scheduled_date na OS ${os.id}: ${schedMirrorErr.message}`
        );
      }
    }
  }

  // 5.4. Aditivo Marco 4: se auto-assigned, valida cursos obrigatorios
  // das categorias contra os membros da equipe. Se nenhum membro cumpre,
  // downgrade pra awaiting_assignment (admin resolve manual).
  if (initialStatus === "assigned" && autoAssignedTeamId) {
    try {
      const { validateCoursePrerequisites } = await import(
        "@/lib/service-orders/course-prerequisites"
      );
      const { data: members } = await supabase
        .from("team_members")
        .select("technician_id")
        .eq("team_id", autoAssignedTeamId);
      const memberIds = ((members ?? []) as Array<{ technician_id: string }>)
        .map((m) => m.technician_id);
      let anyMemberValid = memberIds.length === 0;
      for (const mid of memberIds) {
        const r = await validateCoursePrerequisites(supabase, os.id, mid);
        if (r.ok) {
          anyMemberValid = true;
          break;
        }
      }
      if (!anyMemberValid) {
        await supabase
          .from("service_orders")
          .update({ status: "awaiting_assignment", team_id: null })
          .eq("id", os.id);
        await supabase
          .from("schedules")
          .update({ team_id: null })
          .eq("service_order_id", os.id);
        console.warn(
          `convertQuote: OS ${os.id} downgrade pra awaiting_assignment — nenhum membro da equipe cumpre cursos obrigatorios`
        );
      }
    } catch (err) {
      console.warn(
        `convertQuote: course prereq check failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // 5.5. Dispara category automation (checklist + etapas de execução por
  // categoria) sempre que a conversão termina — não só quando cai
  // 'assigned'. Jessica 26/08: ela precisava editar toda OS manualmente
  // pra anexar o template de etapas porque isso só rodava no caminho de
  // auto-atribuição; homologados e awaiting_assignment nunca disparavam.
  // applyCategoryAutomation não depende de status/atribuição — só lê
  // service_order_items (já populado acima) e é idempotente.
  // Re-le status pra respeitar eventual downgrade acima.
  const { data: latestOs } = await supabase
    .from("service_orders")
    .select("status")
    .eq("id", os.id)
    .maybeSingle();
  // Status efetivo depois do eventual downgrade do 5.4 — o bloco acima pode
  // ter mandado a OS de volta pra 'awaiting_assignment' e zerado o team_id.
  const finalStatus =
    (latestOs as { status?: string } | null)?.status ?? initialStatus;
  const finalTeamId = finalStatus === "assigned" ? autoAssignedTeamId : null;

  try {
    const { applyCategoryAutomation } = await import(
      "@/lib/service-orders/category-automation"
    );
    await applyCategoryAutomation(supabase, os.id);
  } catch (err) {
    console.warn(
      `convertQuote: category automation failed: ${err instanceof Error ? err.message : err}`
    );
  }

  // 6. Notifica admins quando modalidade reallliza cai na fila de designacao
  // (Jessica 24/06). Feito em fire-and-forget pra nao atrasar webhook Asaas.
  //
  // Usa o status final: antes olhava só o inicial, então uma OS rebaixada
  // pelo 5.4 (nenhum membro da equipe com os cursos obrigatórios) caía na
  // fila de designação sem avisar ninguém.
  if (finalStatus === "awaiting_assignment") {
    notifyAdminsOfAwaitingAssignment(
      supabase,
      os.id,
      quote.quote_number as string | number,
      quote.client_name as string
    ).catch((err) => {
      console.error(`convertQuote: notify admins failed: ${err?.message ?? err}`);
    });
  }

  // 6.1. Jessica 10/08: quando o auto-assign da certo ninguem era avisado —
  // nem admin (so' notificado em awaiting_assignment) nem os tecnicos. A OS
  // simplesmente aparecia na lista da equipe sem aviso nenhum.
  if (finalStatus === "assigned" && finalTeamId) {
    notifyTeamOfAssignment(
      supabase,
      finalTeamId,
      os.id,
      quote.quote_number as string | number,
      quote.client_name as string
    ).catch((err) => {
      console.error(`convertQuote: notify team failed: ${err?.message ?? err}`);
    });
  }

  // 7. Fanout automatico de proposta pra homologados (Jessica 17/07):
  // "Somente apos a confirmacao do pagamento o processo poderá continuar.
  //  Com o pagamento confirmado, o sistema devera disponibilizar
  //  automaticamente a proposta para todos os homologados cadastrados
  //  na regiao de atendimento da obra."
  if (quote.modality === "homologados") {
    import("@/lib/quotes/fanout-homologados").then(({ refanoutHomologadoProposal }) =>
      refanoutHomologadoProposal(supabase, {
        service_order_id: os.id,
        target_state: (quote.region_state ?? quote.address_state) as string | null,
        quote_number: quote.quote_number as string | number,
        client_name: quote.client_name as string,
        offered_amount: Number(quote.payout_amount ?? quote.total_amount ?? 0),
      })
    ).catch((err) => {
      console.error(
        `convertQuote: fanout homologado failed: ${err?.message ?? err}`
      );
    });
  }

  return { ok: true, service_order_id: os.id };
}

/**
 * Cria notificacao in-app pra TODOS os admins ativos quando uma OS
 * entra em awaiting_assignment. Fire-and-forget — falha nao bloqueia.
 */
async function notifyAdminsOfAwaitingAssignment(
  supabase: SupabaseClient,
  serviceOrderId: string,
  quoteNumber: string | number,
  clientName: string
): Promise<void> {
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  if (!admins || admins.length === 0) return;

  const { createNotification } = await import(
    "@/lib/api-helpers/notifications"
  );

  await Promise.allSettled(
    admins.map((a) =>
      createNotification(
        (a as { id: string }).id,
        "Nova OS aguardando designação",
        `Orçamento #${quoteNumber} de ${clientName} está aguardando designação de técnico e etapas.`,
        "general",
        { service_order_id: serviceOrderId, kind: "awaiting_assignment" },
        { priority: "high" }
      )
    )
  );
}

/**
 * Notifica todos os membros da equipe quando a OS e' auto-atribuida a ela.
 * Fire-and-forget — falha nao bloqueia a conversao.
 */
async function notifyTeamOfAssignment(
  supabase: SupabaseClient,
  teamId: string,
  serviceOrderId: string,
  quoteNumber: string | number,
  clientName: string
): Promise<void> {
  const { getTeamMemberIds } = await import("@/lib/api-helpers/team-scope");
  const memberIds = await getTeamMemberIds(supabase, teamId);
  if (memberIds.length === 0) return;

  const { createNotification } = await import(
    "@/lib/api-helpers/notifications"
  );

  await Promise.allSettled(
    memberIds.map((id) =>
      createNotification(
        id,
        "Nova OS para sua equipe",
        `Orçamento #${quoteNumber} de ${clientName} foi atribuído à sua equipe.`,
        "general",
        { service_order_id: serviceOrderId, kind: "team_assigned" },
        { priority: "high" }
      )
    )
  );
}

/** Resultado do agendamento automatico, usado pra espelhar em service_orders. */
interface ScheduleReallizaResult {
  /** Primeira data util efetivamente agendada (YYYY-MM-DD). */
  first_date: string | null;
  start_time: string;
  end_time: string;
  /** Quantos dias foram inseridos de fato. */
  days: number;
}

/**
 * Cria schedules em jornadas de 8h consecutivas a partir de service_date.
 * Pula domingos e feriados (busca a proxima data util).
 *
 * Devolve a primeira data agendada pro caller espelhar em
 * service_orders.scheduled_date — o calendario da equipe usa esse campo como
 * fallback quando a OS ainda nao tem schedule (api/teams/[id]/calendar).
 */
async function scheduleReallizaJobs(
  supabase: SupabaseClient,
  serviceOrderId: string,
  opts: {
    service_date: string;
    service_time: string;
    total_hours: number;
    partner_id: string | null;
    team_id?: string | null;
    allow_weekend?: boolean;
  }
): Promise<ScheduleReallizaResult> {
  const empty: ScheduleReallizaResult = {
    first_date: null,
    start_time: "",
    end_time: "",
    days: 0,
  };
  const totalDays = Math.ceil(opts.total_hours / 8);
  if (totalDays <= 0) return empty;

  // Feriados ativos pra pular (sempre respeitados, mesmo com allow_weekend)
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("is_active", true);
  const holidaySet = new Set(
    (holidays ?? []).map((h) => (h as { date: string }).date)
  );

  // Calcula horario de fim do bloco
  const [sh, sm] = opts.service_time.split(":").map((n) => parseInt(n, 10) || 0);
  const startMinutes = sh * 60 + sm;
  const endMinutes = Math.min(startMinutes + 8 * 60, 22 * 60); // tampa em 22h
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const startTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const inserts: Array<{
    service_order_id: string;
    technician_id: string | null;
    team_id: string | null;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    source: string;
    notes: string;
  }> = [];

  // Dias em que a equipe já está comprometida. Antes o agendamento gravava
  // por cima de qualquer ocupação — nem consultava `schedules`.
  const blockedSet = new Set<string>();
  if (opts.team_id) {
    const { data: ocupados } = await supabase
      .from("schedules")
      .select("date")
      .eq("team_id", opts.team_id)
      .gte("date", opts.service_date)
      .in("status", ["scheduled", "confirmed", "in_progress"]);
    for (const s of (ocupados ?? []) as Array<{ date: string }>) {
      blockedSet.add(s.date);
    }
  }

  // Jessica 12/08: os dias têm de ser CONTÍNUOS. A regra antiga contava dias
  // ÚTEIS — começando numa sexta, o serviço pulava o fim de semana e voltava na
  // segunda, deixando um buraco no meio da execução.
  const rules = {
    allowWeekend: !!opts.allow_weekend,
    holidays: holidaySet,
    blocked: blockedSet,
  };

  let inicio = opts.service_date;
  let run = buildContiguousRun(inicio, totalDays, rules);

  if (!run) {
    // A validação na criação do orçamento já barra isso. Se mesmo assim chegou
    // aqui (orçamento antigo, feriado cadastrado depois), empurra para o
    // primeiro início que comporta o serviço inteiro — melhor que agendar com
    // buracos ou não agendar nada. Fica registrado para o operador ver.
    const alternativa = findNextValidStart(inicio, totalDays, rules);
    if (!alternativa) {
      console.error(
        `scheduleReallizaJobs: sem sequência de ${totalDays} dia(s) a partir de ${inicio}`
      );
      return empty;
    }
    console.warn(
      `scheduleReallizaJobs: ${inicio} não comporta ${totalDays} dias seguidos; deslocado para ${alternativa}`
    );
    inicio = alternativa;
    run = buildContiguousRun(inicio, totalDays, rules)!;
  }

  run.forEach((dateStr, i) => {
    inserts.push({
      service_order_id: serviceOrderId,
      technician_id: null, // equipe distribui internamente
      team_id: opts.team_id ?? null,
      date: dateStr,
      start_time: startTime,
      end_time: endTime,
      status: "scheduled",
      source: "quote_paid",
      notes: `Auto-agendado da quote (${i + 1}/${totalDays})`,
    });
  });

  if (inserts.length === 0) return empty;

  // Jessica 03/08 fix: log de erro antes silencioso (era o motivo dos
  // schedules nao aparecerem no calendario da equipe).
  const { error: schErr } = await supabase.from("schedules").insert(inserts);
  if (schErr) {
    console.error(
      `scheduleReallizaJobs: falha inserir ${inserts.length} schedules: ${schErr.message}`
    );
    // Mesmo com falha no insert devolvemos as datas calculadas: o caller
    // espelha em service_orders.scheduled_date e o calendario da equipe
    // ainda consegue mostrar a OS pelo caminho de fallback.
  }

  return {
    first_date: inserts[0].date,
    start_time: startTime,
    end_time: endTime,
    days: inserts.length,
  };
}
