import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { ROTULOS_CAMPO } from "@/lib/feed/audience";

/**
 * GET /api/feed/catalogos — tudo que a tela de segmentação precisa oferecer.
 *
 * Dezesseis recortes, cada um com sua lista de valores. Buscar cada lista
 * numa chamada seria dezesseis autenticações para desenhar um formulário.
 *
 * Município fica de fora da carga inicial de propósito: são 5.571, e mandar
 * isso para o navegador a cada abertura é meio megabyte por nada. A busca de
 * cidade tem seu próprio parâmetro, `?cidade=`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const buscaCidade = searchParams.get("cidade")?.trim();

    // Sponsor só precisa de UF/região pra escolher a abrangência regional —
    // o resto daqui (parceiros, equipes, saúde do cadastro) é informação
    // interna da Reallliza, sem motivo pra sair pra fora.
    if (user.role === "sponsor") {
      const { data: ufsSponsor } = await supabase.from("br_ufs").select("uf, name, region").order("name");
      const regioesSponsor = [...new Set((ufsSponsor ?? []).map((u) => u.region))].sort();
      return jsonResponse({ ufs: ufsSponsor ?? [], regioes: regioesSponsor });
    }

    if (buscaCidade) {
      if (buscaCidade.length < 2) {
        throw new AuthError(400, "Digite ao menos duas letras para buscar a cidade");
      }
      const normalizada = buscaCidade
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();

      let consulta = supabase
        .from("br_cities")
        .select("ibge_code, name, uf")
        .ilike("name_norm", `%${normalizada}%`)
        .order("name")
        .limit(30);

      const uf = searchParams.get("uf");
      if (uf) consulta = consulta.eq("uf", uf.toUpperCase());

      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      return jsonResponse({ cidades: data ?? [] });
    }

    const [ufs, tiposDePiso, certificacoes, fabricantes, especialidades, cursos, parceiros, equipes, saude] =
      await Promise.all([
        supabase.from("br_ufs").select("uf, name, region").order("name"),
        supabase.from("floor_types").select("id, name, family").eq("is_active", true).order("sort_order"),
        supabase.from("certifications").select("id, name, issuer").eq("is_active", true).order("name"),
        supabase.from("manufacturers").select("id, name, logo_url").eq("is_active", true).order("name"),
        supabase.from("specialties").select("id, name").order("name"),
        supabase.from("courses").select("id, title").order("title"),
        supabase.from("partners").select("id, company_name").order("company_name"),
        supabase.from("teams").select("id, name").order("name"),
        supabase.rpc("feed_saude_do_cadastro"),
      ]);

    const regioes = [...new Set((ufs.data ?? []).map((u) => u.region))].sort();

    return jsonResponse({
      rotulos: ROTULOS_CAMPO,
      ufs: ufs.data ?? [],
      regioes,
      tipos_de_piso: tiposDePiso.data ?? [],
      certificacoes: certificacoes.data ?? [],
      fabricantes: fabricantes.data ?? [],
      especialidades: especialidades.data ?? [],
      cursos: cursos.data ?? [],
      parceiros: parceiros.data ?? [],
      equipes: equipes.data ?? [],
      papeis: [
        { valor: "technician", rotulo: "Técnico" },
        { valor: "partner", rotulo: "Parceiro / Loja" },
        { valor: "admin", rotulo: "Administrador" },
      ],
      tipos_profissionais: [
        { valor: "internal", rotulo: "Equipe interna" },
        { valor: "external", rotulo: "Prestador externo" },
      ],
      niveis: [
        { valor: "bronze", rotulo: "Bronze" },
        { valor: "prata", rotulo: "Prata" },
        { valor: "ouro", rotulo: "Ouro" },
        { valor: "diamante", rotulo: "Diamante" },
      ],
      // Sai junto com os catálogos porque é a informação que decide se vale a
      // pena montar a regra: segmentar por cidade com ninguém tendo cidade
      // devolve zero, e sem esse aviso a impressão é de sistema quebrado.
      saude_do_cadastro: saude.data?.[0] ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST — cadastra certificação, fabricante ou tipo de piso.
 *
 * Os três nasceram vazios de propósito: certificadora e fabricante são nomes
 * de empresas reais, e quem preenche é a Reallliza.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();
    const body = await request.json();

    const TABELAS: Record<string, { tabela: string; campos: string[] }> = {
      certificacao: { tabela: "certifications", campos: ["name", "issuer", "description", "course_id"] },
      fabricante:   { tabela: "manufacturers", campos: ["name", "cnpj", "logo_url", "website_url", "sponsor_id"] },
      tipo_de_piso: { tabela: "floor_types", campos: ["name", "slug", "family", "sort_order"] },
    };

    const alvo = TABELAS[body.catalogo];
    if (!alvo) {
      throw new AuthError(400, `Catálogo inválido. Use: ${Object.keys(TABELAS).join(", ")}`);
    }

    const nome = String(body.name ?? "").trim();
    if (!nome) throw new AuthError(400, "Informe o nome");

    const registro: Record<string, unknown> = { name: nome };
    for (const campo of alvo.campos) {
      if (campo !== "name" && campo in body) registro[campo] = body[campo] || null;
    }
    if (alvo.tabela === "floor_types" && !registro.slug) {
      registro.slug = nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }

    const { data, error } = await supabase.from(alvo.tabela).insert(registro).select("*").single();
    if (error) {
      // Nome é único nos três. Devolver o erro cru mostraria nome de
      // constraint para quem só quer saber que já existe.
      if (error.code === "23505") throw new AuthError(409, `"${nome}" já está cadastrado`);
      throw new Error(error.message);
    }

    logAudit({
      userId: user.id,
      action: `feed_catalogo.${body.catalogo}.created`,
      entityType: alvo.tabela,
      entityId: data.id,
      newData: { nome },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
