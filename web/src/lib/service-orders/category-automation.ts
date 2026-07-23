import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aplica automacao da etapa de execucao baseada nas CATEGORIAS dos servicos
 * da OS. Chamado quando OS entra em 'in_progress' (Jessica 20/07 Fase 2).
 *
 * Regras:
 *   - COEXISTE com specialty_checklist_items (nao substitui).
 *   - Idempotente: usa service_orders.auto_execution_applied pra nao rodar 2x.
 *   - Pra cada categoria unica dos service_order_items:
 *       - Se service_categories.checklist_template_id: cria checklist
 *       - Se service_categories.step_template_group_id: provisiona steps
 *   - Nao lanca erro no caller — retorna { ok, applied[], warnings[] }.
 */
export async function applyCategoryAutomation(
  supabase: SupabaseClient,
  serviceOrderId: string
): Promise<{
  ok: boolean;
  applied: string[];
  warnings: string[];
  category_ids: string[];
}> {
  const applied: string[] = [];
  const warnings: string[] = [];

  const { data: os, error: osErr } = await supabase
    .from("service_orders")
    .select("id, auto_execution_applied, status, step_template_group_id, technician_id")
    .eq("id", serviceOrderId)
    .single();

  if (osErr || !os) {
    warnings.push(`OS ${serviceOrderId} nao encontrada`);
    return { ok: false, applied, warnings, category_ids: [] };
  }

  if ((os as { auto_execution_applied?: boolean }).auto_execution_applied) {
    return { ok: true, applied: ["already_applied"], warnings, category_ids: [] };
  }

  // 1. Pega categorias unicas via service_order_items -> services
  const { data: itemsRaw, error: itemsErr } = await supabase
    .from("service_order_items")
    .select("service_id, service:services(id, category_id)")
    .eq("service_order_id", serviceOrderId);

  if (itemsErr) {
    warnings.push(`Falha carregar items: ${itemsErr.message}`);
    return { ok: false, applied, warnings, category_ids: [] };
  }

  const categoryIds = new Set<string>();
  for (const it of (itemsRaw ?? []) as unknown as Array<{
    service: { category_id: string | null } | { category_id: string | null }[] | null;
  }>) {
    const svc = Array.isArray(it.service) ? it.service[0] : it.service;
    const cid = svc?.category_id;
    if (cid) categoryIds.add(cid);
  }

  if (categoryIds.size === 0) {
    return { ok: true, applied, warnings, category_ids: [] };
  }

  // 2. Lookup templates por categoria
  const { data: cats, error: catErr } = await supabase
    .from("service_categories")
    .select("id, name, checklist_template_id, step_template_group_id")
    .in("id", Array.from(categoryIds));

  if (catErr) {
    warnings.push(`Falha carregar categorias: ${catErr.message}`);
    return { ok: false, applied, warnings, category_ids: Array.from(categoryIds) };
  }

  // 3. Steps: usa primeiro step_template_group_id encontrado (categoria dominante)
  const stepGroups = ((cats ?? []) as Array<{
    id: string;
    name: string;
    step_template_group_id: string | null;
  }>)
    .filter((c) => c.step_template_group_id)
    .map((c) => ({ category: c.name, groupId: c.step_template_group_id! }));

  if (stepGroups.length > 0 && !os.step_template_group_id) {
    const { groupId, category } = stepGroups[0];
    try {
      const { provisionSteps } = await import(
        "@/app/api/service-orders/[id]/provision-steps/route"
      );
      const result = await provisionSteps(supabase, serviceOrderId, groupId);
      await supabase
        .from("service_orders")
        .update({ step_template_group_id: groupId })
        .eq("id", serviceOrderId);
      applied.push(`steps:${category}:${result.created}`);
    } catch (err) {
      warnings.push(
        `Falha provisionar steps (${category}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 4. Checklists: cria 1 checklist por categoria com template
  for (const c of (cats ?? []) as Array<{
    id: string;
    name: string;
    checklist_template_id: string | null;
  }>) {
    if (!c.checklist_template_id) continue;

    // Ja existe checklist deste template pra OS? (idempotencia extra)
    const { data: exists } = await supabase
      .from("checklists")
      .select("id")
      .eq("service_order_id", serviceOrderId)
      .eq("template_id", c.checklist_template_id)
      .limit(1)
      .maybeSingle();

    if (exists) {
      applied.push(`checklist:${c.name}:existing`);
      continue;
    }

    const { data: tpl, error: tplErr } = await supabase
      .from("checklist_templates")
      .select("id, name, items, fields")
      .eq("id", c.checklist_template_id)
      .maybeSingle();

    if (tplErr || !tpl) {
      warnings.push(`Template checklist ${c.checklist_template_id} nao achado`);
      continue;
    }

    try {
      const tplRow = tpl as {
        id: string;
        name: string;
        items?: unknown;
        fields?: unknown;
      };
      const itemsSnapshot = Array.isArray(tplRow.items) ? tplRow.items : [];
      const techId = (os as { technician_id: string | null }).technician_id;
      if (!techId) {
        warnings.push(
          `Skip checklist ${c.name}: OS sem technician_id (checklists.technician_id e' NOT NULL)`
        );
        continue;
      }
      const { error: clErr } = await supabase
        .from("checklists")
        .insert({
          service_order_id: serviceOrderId,
          template_id: c.checklist_template_id,
          technician_id: techId,
          title: `${tplRow.name} — ${c.name}`,
          items: itemsSnapshot,
          data: {},
          is_completed: false,
        })
        .select("id")
        .single();

      if (clErr) {
        warnings.push(
          `Falha criar checklist (${c.name}): ${clErr.message}`
        );
        continue;
      }

      applied.push(`checklist:${c.name}:${itemsSnapshot.length}`);
    } catch (err) {
      warnings.push(
        `Excecao criar checklist (${c.name}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 5. Marca como aplicado
  await supabase
    .from("service_orders")
    .update({ auto_execution_applied: true })
    .eq("id", serviceOrderId);

  return {
    ok: true,
    applied,
    warnings,
    category_ids: Array.from(categoryIds),
  };
}
