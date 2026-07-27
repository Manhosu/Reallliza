import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Valida se o tecnico completou os cursos obrigatorios exigidos pelas
 * categorias dos servicos de uma OS.
 *
 * Regra: cada service_category pode ter required_course_ids[] setado.
 * Um tecnico so pode receber a OS se completou TODOS os cursos exigidos
 * (course_enrollments com completed_at != null OU status='completed').
 *
 * Retorna:
 *   { ok: true }  quando todos os cursos estao concluidos ou nao ha requisito
 *   { ok: false, missing: [{ course_id, title }] }  quando falta algum
 */
export async function validateCoursePrerequisites(
  supabase: SupabaseClient,
  serviceOrderId: string,
  technicianId: string
): Promise<
  | { ok: true }
  | { ok: false; missing: Array<{ course_id: string; title: string }> }
> {
  // 1. Categorias unicas dos items da OS
  const { data: itemsRaw } = await supabase
    .from("service_order_items")
    .select("service_id, service:services(category_id)")
    .eq("service_order_id", serviceOrderId);

  const categoryIds = new Set<string>();
  for (const it of (itemsRaw ?? []) as unknown as Array<{
    service:
      | { category_id: string | null }
      | { category_id: string | null }[]
      | null;
  }>) {
    const svc = Array.isArray(it.service) ? it.service[0] : it.service;
    if (svc?.category_id) categoryIds.add(svc.category_id);
  }
  if (categoryIds.size === 0) return { ok: true };

  // 2. Coleta required_course_ids de todas as categorias
  const { data: cats } = await supabase
    .from("service_categories")
    .select("required_course_ids")
    .in("id", Array.from(categoryIds));

  const requiredCourseIds = new Set<string>();
  for (const c of (cats ?? []) as Array<{
    required_course_ids: string[] | null;
  }>) {
    for (const cid of c.required_course_ids ?? []) {
      requiredCourseIds.add(cid);
    }
  }
  if (requiredCourseIds.size === 0) return { ok: true };

  // 3. Enrollments concluidos do tecnico
  const { data: enrolls } = await supabase
    .from("course_enrollments")
    .select("course_id, status, completed_at")
    .eq("user_id", technicianId)
    .in("course_id", Array.from(requiredCourseIds));

  const completedIds = new Set<string>(
    ((enrolls ?? []) as Array<{
      course_id: string;
      status: string;
      completed_at: string | null;
    }>)
      .filter((e) => e.completed_at || e.status === "completed")
      .map((e) => e.course_id)
  );

  const missingIds = Array.from(requiredCourseIds).filter(
    (id) => !completedIds.has(id)
  );
  if (missingIds.length === 0) return { ok: true };

  // 4. Busca titulos pra mensagem clara
  const { data: missingCourses } = await supabase
    .from("courses")
    .select("id, title")
    .in("id", missingIds);

  return {
    ok: false,
    missing: ((missingCourses ?? []) as Array<{ id: string; title: string }>).map(
      (c) => ({ course_id: c.id, title: c.title })
    ),
  };
}
