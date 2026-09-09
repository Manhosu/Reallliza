import type { SupabaseClient } from "@supabase/supabase-js";

interface CourseAccessInput {
  id: string;
  price_cents?: number | null;
}

/**
 * Decide se `userId` pode acessar o conteúdo de `course`. Curso grátis
 * (price_cents nulo/0) sempre libera; curso pago libera por compra
 * confirmada, liberação manual (course_access_grants) ou por pertencer a
 * uma equipe liberada (course_team_access). Única fonte de verdade — toda
 * rota que precisa checar acesso chama esta função em vez de reimplementar
 * a regra.
 */
export async function hasAccessToCourse(
  supabase: SupabaseClient,
  userId: string,
  course: CourseAccessInput
): Promise<boolean> {
  if (!course.price_cents || course.price_cents <= 0) return true;

  const [{ data: purchase }, { data: grant }, { data: memberships }] = await Promise.all([
    supabase
      .from("course_purchases")
      .select("id")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("course_access_grants")
      .select("course_id")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("team_members").select("team_id").eq("technician_id", userId),
  ]);

  if (purchase || grant) return true;

  const teamIds = ((memberships as Array<{ team_id: string }> | null) ?? []).map(
    (m) => m.team_id
  );
  if (teamIds.length === 0) return false;

  const { data: teamAccess } = await supabase
    .from("course_team_access")
    .select("team_id")
    .eq("course_id", course.id)
    .in("team_id", teamIds)
    .limit(1)
    .maybeSingle();

  return !!teamAccess;
}
