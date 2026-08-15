import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { getUserTeamIds, buildTeamScopeFilter } from "@/lib/api-helpers/team-scope";

/**
 * GET /api/messages/chats
 *
 * Lista as OS que têm conversa, com a última mensagem e a contagem de não
 * lidas. É a porta de entrada da tela de Chats.
 *
 * A tela chamava esta rota desde sempre (`messagesApi.listActiveChats`), mas
 * ela nunca existiu — só havia `/service-orders/[id]/messages`, que serve uma
 * conversa por vez. Abrir Chats quebrava.
 *
 * O escopo por papel repete o das demais rotas de OS: admin vê tudo, técnico
 * vê o que é dele ou da equipe dele, loja vê o que é da loja.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );

    // 1. As OS que o usuário pode ver.
    let escopo = supabase
      .from("service_orders")
      .select("id, order_number, title, status, technician_id");

    if (user.role === "technician") {
      const teamIds = await getUserTeamIds(supabase, user.id);
      const filtro = buildTeamScopeFilter(user.id, teamIds);
      escopo = filtro
        ? escopo.or(filtro)
        : escopo.eq("technician_id", user.id);
    } else if (user.role === "partner") {
      const { data: parceiro } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!parceiro) {
        return jsonResponse({
          data: [],
          meta: { total: 0, page, total_pages: 0 },
        });
      }
      escopo = escopo.eq("partner_id", parceiro.id);
    }

    const { data: ordens, error: errOrdens } = await escopo;
    if (errOrdens) {
      console.error(`Falha ao listar OS pro chat: ${errOrdens.message}`);
      throw new Error("Falha ao carregar as conversas");
    }

    const ordensPorId = new Map(
      ((ordens ?? []) as Array<{ id: string }>).map((o) => [o.id, o])
    );
    if (ordensPorId.size === 0) {
      return jsonResponse({ data: [], meta: { total: 0, page, total_pages: 0 } });
    }

    // 2. Mensagens dessas OS, da mais recente pra mais antiga. Uma consulta
    //    só — buscar por OS seria N+1 na tela que lista todas as conversas.
    const { data: mensagens, error: errMsg } = await supabase
      .from("os_messages")
      .select(
        "id, service_order_id, sender_user_id, sender_role, sender_name, content, attachment_url, attachment_type, external_message_id, read_at, created_at"
      )
      .in("service_order_id", Array.from(ordensPorId.keys()))
      .order("created_at", { ascending: false });

    if (errMsg) {
      console.error(`Falha ao carregar mensagens: ${errMsg.message}`);
      throw new Error("Falha ao carregar as conversas");
    }

    // 3. Primeira mensagem de cada OS é a última no tempo; conta as não lidas
    //    que não são do próprio usuário.
    const ultima = new Map<string, Record<string, unknown>>();
    const naoLidas = new Map<string, number>();
    for (const m of (mensagens ?? []) as Array<Record<string, unknown>>) {
      const osId = String(m.service_order_id);
      if (!ultima.has(osId)) ultima.set(osId, m);
      if (!m.read_at && m.sender_user_id !== user.id) {
        naoLidas.set(osId, (naoLidas.get(osId) ?? 0) + 1);
      }
    }

    // 4. Nome do técnico, pra tela não fazer uma busca por linha.
    const tecnicoIds = Array.from(
      new Set(
        Array.from(ultima.keys())
          .map((id) => (ordensPorId.get(id) as { technician_id?: string | null })?.technician_id)
          .filter((v): v is string => !!v)
      )
    );
    const nomePorTecnico = new Map<string, string>();
    if (tecnicoIds.length > 0) {
      const { data: perfis } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", tecnicoIds);
      for (const p of (perfis ?? []) as Array<{ id: string; full_name: string }>) {
        nomePorTecnico.set(p.id, p.full_name);
      }
    }

    const conversas = Array.from(ultima.entries())
      .map(([osId, msg]) => {
        const os = ordensPorId.get(osId) as {
          id: string;
          order_number: number;
          title: string;
          status: string;
          technician_id: string | null;
        };
        return {
          ...os,
          technician_name: os.technician_id
            ? nomePorTecnico.get(os.technician_id)
            : undefined,
          last_message: msg,
          unread_count: naoLidas.get(osId) ?? 0,
        };
      })
      .sort((a, b) =>
        String((b.last_message as { created_at: string }).created_at).localeCompare(
          String((a.last_message as { created_at: string }).created_at)
        )
      );

    const total = conversas.length;
    const inicio = (page - 1) * limit;

    return jsonResponse({
      data: conversas.slice(inicio, inicio + limit),
      meta: { total, page, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
