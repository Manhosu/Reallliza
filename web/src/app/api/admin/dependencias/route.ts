import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { diagnosticar } from "@/lib/api-helpers/exclusao";

/**
 * GET /api/admin/dependencias?tabela=X&id=Y
 *
 * O que segura este registro — consultado ANTES de tentar excluir.
 *
 * É o que permite ao diálogo de exclusão dizer "esta OS tem 1 orçamento
 * vinculado" em vez de deixar a pessoa clicar, esperar e receber um erro. O
 * `HardDeleteDialog` sempre soube receber essa lista (o campo `dependencies`
 * existe desde que ele foi escrito) e nenhuma tela nunca a passou.
 *
 * Uma rota só para todos os cadastros, e não uma por recurso: a descoberta é
 * genérica no banco, e vinte rotas idênticas envelheceriam de vinte formas
 * diferentes.
 */

/**
 * Só estas tabelas podem ser consultadas.
 *
 * A lista existe porque `tabela` vem da consulta do navegador. Sem ela, a
 * rota viraria um enumerador do banco inteiro para qualquer administrador —
 * inclusive de tabelas que não são cadastro, como as de auditoria e evento.
 */
const CADASTROS_CONSULTAVEIS = new Set([
  "service_orders", "quotes", "service_proposals",
  "tool_inventory", "tool_units", "tool_requests",
  "services", "service_categories", "specialties", "regions",
  "teams", "partners", "profiles",
  "checklist_templates", "step_template_groups",
  "courses", "course_modules", "course_lessons",
  "feed_posts", "feed_campaigns", "feed_sponsors", "feed_audience_rules",
  "schedules", "warranties", "quality_evaluations",
  "service_proposals", "professional_ratings", "checklist_templates",
  "tool_requests", "tool_maintenance",
]);

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "gestor", "diretor"]);

    const { searchParams } = new URL(request.url);
    const tabela = searchParams.get("tabela")?.trim() ?? "";
    const id = searchParams.get("id")?.trim() ?? "";

    if (!tabela || !id) {
      throw new AuthError(400, "Informe a tabela e o registro");
    }
    if (!CADASTROS_CONSULTAVEIS.has(tabela)) {
      throw new AuthError(400, `"${tabela}" não é um cadastro consultável`);
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new AuthError(400, "Identificador inválido");
    }

    const supabase = getAdminClient();
    const diagnostico = await diagnosticar(supabase, tabela, id);

    return jsonResponse({
      pode_excluir: diagnostico.podeExcluir,
      // O formato é o que `HardDeleteDialog` já espera: label, count, action.
      dependencies: [
        ...diagnostico.bloqueios.map((b) => ({
          label: `${b.rotulo} — ${b.motivo}`,
          count: b.quantidade,
          action: "block" as const,
        })),
        ...diagnostico.levaJunto.map((b) => ({
          label: b.rotulo,
          count: b.quantidade,
          action: "cascade" as const,
        })),
      ],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
