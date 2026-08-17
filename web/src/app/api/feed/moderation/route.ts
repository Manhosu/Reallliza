import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Fila de moderação de comentários.
 *
 * A denúncia existia desde a 064 e ninguém tinha onde ver o que foi
 * denunciado — a fila caía num lugar que não era lido, que é o mesmo que não
 * ter moderação.
 *
 * GET   traz o que está aberto, com o comentário e o contexto.
 * PATCH decide: esconder, remover, ou arquivar a denúncia.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const situacao = searchParams.get("status") ?? "open";

    const { data: denuncias, error } = await supabase
      .from("feed_comment_reports")
      .select(
        "id, reason, details, status, created_at, " +
          "reporter:profiles!feed_comment_reports_reporter_id_fkey(id, full_name), " +
          "comment:feed_post_comments(id, content, created_at, status, deleted_at, like_count, " +
          "post_id, author:profiles(id, full_name))"
      )
      .eq("status", situacao)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    // Várias pessoas denunciando o mesmo comentário são o mesmo problema, não
    // vários. Agrupar evita a fila mostrar dez linhas do mesmo caso e o
    // moderador decidir dez vezes.
    interface Denuncia {
      id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      reporter: unknown;
      comment: { id?: string } | null;
    }
    const porComentario = new Map<string, { comentario: unknown; denuncias: unknown[]; motivos: string[] }>();
    for (const d of (denuncias ?? []) as unknown as Denuncia[]) {
      const c = d.comment;
      if (!c?.id) continue;
      const atual = porComentario.get(c.id) ?? { comentario: c, denuncias: [], motivos: [] };
      atual.denuncias.push({
        id: d.id, reason: d.reason, details: d.details,
        created_at: d.created_at, reporter: d.reporter,
      });
      if (!atual.motivos.includes(d.reason)) atual.motivos.push(d.reason);
      porComentario.set(c.id, atual);
    }

    const [{ count: abertas }, { count: resolvidas }] = await Promise.all([
      supabase.from("feed_comment_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("feed_comment_reports").select("id", { count: "exact", head: true }).neq("status", "open"),
    ]);

    return jsonResponse({
      fila: [...porComentario.values()].sort(
        (a, b) => b.denuncias.length - a.denuncias.length
      ),
      resumo: { abertas: abertas ?? 0, resolvidas: resolvidas ?? 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();
    const body = await request.json();

    const ACOES = ["esconder", "remover", "liberar", "arquivar"];
    if (!ACOES.includes(body.acao)) {
      throw new AuthError(400, `Ação inválida. Use: ${ACOES.join(", ")}`);
    }
    if (!body.comment_id) throw new AuthError(400, "Informe o comentário");

    const { data: comentario } = await supabase
      .from("feed_post_comments")
      .select("id, post_id, author_id")
      .eq("id", body.comment_id)
      .maybeSingle();
    if (!comentario) throw new AuthError(404, "Comentário não encontrado");

    if (body.acao === "esconder") {
      await supabase
        .from("feed_post_comments")
        .update({ status: "hidden" })
        .eq("id", body.comment_id);
    } else if (body.acao === "remover") {
      // Remoção é lógica: o texto sai do feed e a linha fica, porque uma
      // denúncia sem o que foi denunciado é indefensável se alguém contestar.
      await supabase
        .from("feed_post_comments")
        .update({ status: "removed", deleted_at: new Date().toISOString() })
        .eq("id", body.comment_id);
    } else if (body.acao === "liberar") {
      await supabase
        .from("feed_post_comments")
        .update({ status: "visible", deleted_at: null })
        .eq("id", body.comment_id);
    }

    // A denúncia sempre sai da fila: liberar também é uma decisão tomada.
    await supabase
      .from("feed_comment_reports")
      .update({ status: body.acao === "liberar" ? "dismissed" : "reviewed" })
      .eq("comment_id", body.comment_id)
      .eq("status", "open");

    // O contador da publicação se acerta sozinho: desde a 074 o gatilho de
    // contagem também dispara quando o comentário cruza a fronteira do
    // visível, e não só em inclusão e exclusão.

    logAudit({
      userId: user.id,
      action: `feed_comment.${body.acao}`,
      entityType: "feed_comment",
      entityId: body.comment_id,
      newData: { post_id: comentario.post_id, motivo: body.motivo ?? null },
    });

    return jsonResponse({ ok: true, acao: body.acao });
  } catch (error) {
    return errorResponse(error);
  }
}
