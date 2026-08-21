import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/feed/sponsors/[id]/users
 *
 * Cria (ou vincula) o login de um patrocinador — a porta de entrada do
 * Portal do Patrocinador. Mesmo padrão de `POST /api/partners`: não existe
 * convite por e-mail em lugar nenhum do sistema, então o admin define e-mail
 * e senha na hora, a conta já nasce confirmada, e a pessoa recebe a senha
 * por fora (mesma coisa que já deve acontecer hoje com login de loja).
 *
 * Body: { email, password?, full_name?, role?: "viewer"|"editor"|"admin" }
 * `role` aqui é o papel INTERNO dentro do patrocinador (quem pode editar
 * campanha vs. só ver) — não confundir com o `UserRole` do sistema, que
 * para essa conta é sempre "sponsor".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const body = await request.json();

    const { data: sponsor } = await supabase
      .from("feed_sponsors")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!sponsor) throw new AuthError(404, "Patrocinador não encontrado");

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) throw new AuthError(400, "Informe o e-mail de acesso");
    const papelInterno = ["viewer", "editor", "admin"].includes(body.role) ? body.role : "admin";

    const { data: existente } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existente) {
      if (existente.role !== "sponsor") {
        throw new AuthError(
          400,
          `Já existe um usuário com este e-mail, mas o perfil é '${existente.role}'. Use um e-mail diferente.`
        );
      }
      // Conta de sponsor já existe (gerencia outra marca) — só vincula,
      // sem criar conta nova nem mexer na senha.
      userId = existente.id;
    } else {
      const password = body.password;
      if (!password || typeof password !== "string" || password.length < 6) {
        throw new AuthError(400, "Informe uma senha (mínimo 6 caracteres) para criar o acesso.");
      }

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name || sponsor.name, role: "sponsor" },
      });
      if (createErr || !created?.user) {
        throw new AuthError(400, `Não foi possível criar a conta: ${createErr?.message ?? "erro desconhecido"}`);
      }

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: created.user.id,
          email,
          full_name: body.full_name || sponsor.name,
          role: "sponsor",
          status: "active",
        },
        { onConflict: "id" }
      );
      if (profileErr) {
        console.error(`Falha ao criar profile do sponsor ${email}: ${profileErr.message}`);
      }
      userId = created.user.id;
    }

    const { error: vinculoErr } = await supabase
      .from("feed_sponsor_users")
      .upsert(
        { sponsor_id: id, user_id: userId, role: papelInterno },
        { onConflict: "sponsor_id,user_id" }
      );
    if (vinculoErr) throw new Error(`Falha ao vincular: ${vinculoErr.message}`);

    logAudit({
      userId: user.id,
      action: existente ? "feed_sponsor.user_linked" : "feed_sponsor.user_created",
      entityType: "feed_sponsor",
      entityId: id,
      newData: { email, role: papelInterno },
    });

    return jsonResponse(
      { user_id: userId, email, sponsor_id: id, role: papelInterno },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/feed/sponsors/[id]/users — lista quem tem acesso a este patrocinador. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("feed_sponsor_users")
      .select("user_id, role, created_at, profile:profiles(id, email, full_name)")
      .eq("sponsor_id", id)
      .order("created_at");
    if (error) throw new Error(error.message);

    return jsonResponse({ usuarios: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
