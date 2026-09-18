import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { DEFAULT_AVAILABILITY } from "@/lib/quotes/homologado-availability";

/**
 * GET/PATCH /api/profile/availability
 *
 * Disponibilidade de trabalho do próprio homologado (Jéssica, 18/09):
 * sábado, domingo, feriado, noturno e interestadual, cruzados com a
 * seleção de propostas em web/src/lib/quotes/homologado-availability.ts.
 * Sempre o próprio usuário — não existe versão admin desta rota porque a
 * disponibilidade é uma declaração pessoal, não algo que se define por
 * outra pessoa.
 *
 * Mudar aqui NUNCA afeta OS já aceitas — só entra na seleção de novas
 * propostas a partir de agora.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const { data } = await supabase
      .from("technician_availability_settings")
      .select("works_saturday, works_sunday, works_holidays, works_after_hours, works_interstate")
      .eq("technician_id", user.id)
      .maybeSingle();

    return jsonResponse(data ?? DEFAULT_AVAILABILITY);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json();
    const supabase = getAdminClient();

    const update: Record<string, boolean> = {};
    for (const campo of [
      "works_saturday",
      "works_sunday",
      "works_holidays",
      "works_after_hours",
      "works_interstate",
    ] as const) {
      if (body[campo] !== undefined) update[campo] = !!body[campo];
    }
    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const { data, error } = await supabase
      .from("technician_availability_settings")
      .upsert({ technician_id: user.id, ...update }, { onConflict: "technician_id" })
      .select("works_saturday, works_sunday, works_holidays, works_after_hours, works_interstate")
      .single();

    if (error) throw new Error(error.message);

    logAudit({
      userId: user.id,
      action: "technician_availability.updated",
      entityType: "technician_availability_settings",
      entityId: user.id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
