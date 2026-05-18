import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/homologation
 * Fila de solicitações de homologação. Apenas admin.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("homologation_requests")
      .select(
        `
        *,
        profile:profiles!profile_id(id, full_name, email, phone, specialties, professional_type, is_homologated)
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to list homologation requests: ${error.message}`);
      throw new Error("Falha ao listar solicitações de homologação");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/homologation
 * Cadastro PÚBLICO de profissional autônomo (sem autenticação).
 * Cria a conta, o profile (technician, professional_type=external, não
 * homologado) e a solicitação de homologação pendente.
 *
 * Body: { full_name, email, password, phone?, cpf?, specialties?, documents? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!fullName) throw new AuthError(400, "Nome completo é obrigatório");
    if (!email || !email.includes("@")) {
      throw new AuthError(400, "E-mail inválido");
    }
    if (password.length < 6) {
      throw new AuthError(400, "A senha deve ter ao menos 6 caracteres");
    }

    const supabase = getAdminClient();

    // 1. Cria a conta já confirmada (auto-serviço).
    const { data: created, error: authErr } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "technician" },
      });

    if (authErr || !created?.user) {
      const msg = authErr?.message || "";
      if (/already|registered|exists/i.test(msg)) {
        throw new AuthError(409, "Já existe uma conta com esse e-mail");
      }
      throw new Error(msg || "Falha ao criar a conta");
    }

    const profileId = created.user.id;

    // 2. Completa o profile (o trigger handle_new_user já criou a linha).
    const specialties = Array.isArray(body.specialties)
      ? body.specialties.filter((s: unknown) => typeof s === "string")
      : null;

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: typeof body.phone === "string" ? body.phone : null,
        cpf: typeof body.cpf === "string" ? body.cpf : null,
        specialties,
        professional_type: "external",
        is_homologated: false,
      })
      .eq("id", profileId);

    if (profErr) {
      console.error(`Failed to complete profile: ${profErr.message}`);
      throw new Error("Falha ao salvar os dados do profissional");
    }

    // 3. Cria a solicitação de homologação pendente.
    const { error: reqErr } = await supabase
      .from("homologation_requests")
      .insert({
        profile_id: profileId,
        status: "pending",
        documents: body.documents ?? null,
      });

    if (reqErr) {
      console.error(`Failed to create homologation request: ${reqErr.message}`);
      throw new Error("Falha ao registrar a solicitação");
    }

    logAudit({
      userId: profileId,
      action: "homologation_request.created",
      entityType: "homologation_request",
      entityId: profileId,
      newData: { full_name: fullName, email },
    });

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
