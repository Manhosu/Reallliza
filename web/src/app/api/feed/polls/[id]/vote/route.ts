import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/feed/polls/[id]/vote — vota numa enquete.
 *
 * A enquete existia no banco desde a 064 e o feed já a entregava montada, mas
 * não havia como votar: nem rota, nem tela. Duas das onze categorias pedidas
 * são Pesquisas e Enquetes, então a lacuna valia mais do que parecia.
 *
 * O voto é registrado como evento de métrica também, para a enquete aparecer
 * no painel da publicação junto do resto.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const body = await request.json().catch(() => ({}));
    const escolhidas: string[] = Array.isArray(body.option_ids)
      ? body.option_ids.map(String)
      : body.option_id
        ? [String(body.option_id)]
        : [];

    if (escolhidas.length === 0) {
      throw new AuthError(400, "Escolha ao menos uma opção");
    }

    const { data: enquete } = await supabase
      .from("feed_polls")
      .select("id, post_id, allow_multiple, closes_at, show_results, is_anonymous")
      .eq("id", id)
      .maybeSingle();

    if (!enquete) throw new AuthError(404, "Enquete não encontrada");

    if (!enquete.allow_multiple && escolhidas.length > 1) {
      throw new AuthError(400, "Esta enquete aceita apenas uma opção");
    }
    if (enquete.closes_at && new Date(enquete.closes_at) < new Date()) {
      throw new AuthError(409, "Esta enquete já foi encerrada");
    }

    // Quem não enxerga a publicação não vota nela. A verificação é a mesma
    // função que o feed, a RLS e as outras interações usam — uma definição só
    // de visibilidade, no banco.
    const { data: pode } = await supabase.rpc("feed_pode_ver", {
      p_post: enquete.post_id,
      p_user: user.id,
    });
    if (!pode) throw new AuthError(403, "Esta publicação não está disponível para você");

    // As opções precisam ser desta enquete. Sem isso, um id de outra enquete
    // entraria e contaminaria a contagem alheia.
    const { data: validas } = await supabase
      .from("feed_poll_options")
      .select("id")
      .eq("poll_id", id)
      .in("id", escolhidas);

    if ((validas?.length ?? 0) !== escolhidas.length) {
      throw new AuthError(400, "Opção inválida para esta enquete");
    }

    // Trocar de voto é permitido enquanto a enquete está aberta: apaga o
    // anterior e grava o novo, para o total não contar a pessoa duas vezes.
    await supabase.from("feed_poll_votes").delete().eq("poll_id", id).eq("user_id", user.id);

    const { error } = await supabase.from("feed_poll_votes").insert(
      escolhidas.map((opcao) => ({
        poll_id: id,
        option_id: opcao,
        user_id: user.id,
        // Copiado da enquete porque o índice que garante um voto por pessoa
        // é parcial, e predicado de índice não pode consultar outra tabela.
        is_single_choice: !enquete.allow_multiple,
      }))
    );
    if (error) throw new Error(error.message);

    // O voto também vira evento de métrica, para a enquete aparecer no painel
    // junto do resto. `session_id` é obrigatório na tabela de eventos; sem
    // ele o lote inteiro é recusado — e como a falha aqui não pode derrubar o
    // voto já gravado, ela é registrada no log em vez de virar erro.
    const { error: erroEvento } = await supabase.rpc("feed_registrar_eventos", {
      p_eventos: [
        {
          client_event_id: crypto.randomUUID(),
          session_id: crypto.randomUUID(),
          post_id: enquete.post_id,
          user_id: user.id,
          event_type: "poll_vote",
          occurred_at: new Date().toISOString(),
          platform: "web",
        },
      ],
    });
    if (erroEvento) {
      console.error(`Voto gravado, mas o evento de métrica falhou: ${erroEvento.message}`);
    }

    const { data: resultado } = await supabase
      .from("feed_polls")
      .select("id, question, total_votes, unique_voters, show_results, options:feed_poll_options!feed_poll_options_poll_id_fkey(id, position, label, vote_count)")
      .eq("id", id)
      .single();

    return jsonResponse({
      votou: true,
      // Depois de votar a pessoa sempre pode ver o resultado, exceto quando a
      // enquete foi configurada para nunca mostrar.
      resultado: resultado?.show_results === "never" ? null : resultado,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
