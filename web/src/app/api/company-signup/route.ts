import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/company-signup
 * Fila de cadastros de empresa (loja/fabricante). Apenas admin.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("company_signup_requests")
      .select(
        `
        *,
        profile:profiles!profile_id(id, full_name, email, phone)
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to list company signup requests: ${error.message}`);
      throw new Error("Falha ao listar cadastros de empresa");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/company-signup
 * Cadastro PÚBLICO de empresa (loja ou fabricante), sem autenticação.
 *
 * Cria a conta já com o papel final (partner/sponsor) mas `status:'pending'`
 * — diferente de `/api/homologation`, que deixa a conta ativa desde o
 * cadastro. Aqui o acesso fica bloqueado (ver `authenticateRequest`) até um
 * admin aprovar em `PATCH /api/company-signup/[id]`, que é quem de fato
 * provisiona `partners`/`feed_sponsors`/`feed_sponsor_users`.
 *
 * Body: { company_type: 'loja'|'fabricante', company_name, cnpj,
 *         contact_name, contact_phone, email, password, city?, uf? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const companyType = body.company_type === "loja" || body.company_type === "fabricante"
      ? body.company_type
      : null;
    const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
    const contactName = typeof body.contact_name === "string" ? body.contact_name.trim() : "";
    const contactPhone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const cnpj = String(body.cnpj ?? "").replace(/\D/g, "");
    const city = typeof body.city === "string" ? body.city.trim() || null : null;
    const uf = typeof body.uf === "string" ? body.uf.trim().toUpperCase().slice(0, 2) || null : null;

    if (!companyType) throw new AuthError(400, "Escolha se é Loja ou Fabricante");
    if (!companyName) throw new AuthError(400, "Informe a razão social ou nome da empresa");
    if (!cnpj) throw new AuthError(400, "Informe o CNPJ");
    // CNPJ tem 14 dígitos sempre — sem checar isso aqui, um CNPJ digitado
    // errado só ia aparecer quebrado bem mais tarde, na hora de gerar o PIX
    // (a Asaas recusa e a mensagem que sobra é confusa: "Asaas customer
    // falhou: 400", sem dizer que o problema é o CNPJ).
    if (cnpj.length !== 14) throw new AuthError(400, "CNPJ inválido — deve ter 14 dígitos.");
    if (!contactName) throw new AuthError(400, "Informe o nome do responsável");
    if (!contactPhone) throw new AuthError(400, "Informe o telefone/WhatsApp");
    if (!email || !email.includes("@")) throw new AuthError(400, "E-mail inválido");
    if (password.length < 6) throw new AuthError(400, "A senha deve ter ao menos 6 caracteres");

    const supabase = getAdminClient();

    // CNPJ é único — confere nas duas tabelas onde uma empresa de verdade
    // pode já existir, senão o erro cru da constraint só apareceria na
    // aprovação, tarde demais pra a pessoa corrigir.
    const [{ data: cnpjEmPartners }, { data: cnpjEmSponsors }] = await Promise.all([
      supabase.from("partners").select("id, company_name").eq("cnpj", cnpj).maybeSingle(),
      supabase.from("feed_sponsors").select("id, name").eq("cnpj", cnpj).maybeSingle(),
    ]);
    const nomeExistente = cnpjEmPartners?.company_name ?? cnpjEmSponsors?.name;
    if (nomeExistente) {
      throw new AuthError(409, `Já existe uma empresa cadastrada com este CNPJ (${nomeExistente}).`);
    }

    // 1. Cria a conta já com o papel final, mas ainda sem acesso —
    // `status:'pending'` é o que bloqueia (ver authenticateRequest).
    const role = companyType === "loja" ? "partner" : "sponsor";
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: contactName, role },
    });

    if (authErr || !created?.user) {
      const msg = authErr?.message || "";
      if (/already|registered|exists/i.test(msg)) {
        throw new AuthError(409, "Já existe uma conta com esse e-mail");
      }
      throw new Error(msg || "Falha ao criar a conta");
    }

    const profileId = created.user.id;

    // 2. Completa o profile (o trigger handle_new_user já criou a linha,
    // com o role vindo de user_metadata) e marca como pendente de análise.
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ full_name: contactName, phone: contactPhone, status: "pending" })
      .eq("id", profileId);

    if (profErr) {
      console.error(`Failed to update profile for company signup: ${profErr.message}`);
      throw new Error("Falha ao salvar os dados da empresa");
    }

    // 3. Cria a solicitação — é o que aparece na fila do admin.
    const { error: reqErr } = await supabase.from("company_signup_requests").insert({
      profile_id: profileId,
      company_type: companyType,
      company_name: companyName,
      cnpj,
      city_name: city,
      uf,
      status: "pending",
    });

    if (reqErr) {
      console.error(`Failed to create company signup request: ${reqErr.message}`);
      throw new Error("Falha ao registrar o cadastro");
    }

    logAudit({
      userId: profileId,
      action: "company_signup_request.created",
      entityType: "company_signup_request",
      entityId: profileId,
      newData: { company_name: companyName, company_type: companyType },
    });

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
