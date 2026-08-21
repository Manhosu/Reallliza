import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverSponsorDoUsuario, postPertenceAoSponsor } from "@/lib/feed/sponsor-auth";

export const runtime = "nodejs";

/**
 * PATCH /api/feed/media/[id]
 *
 * Confirma que o arquivo chegou ao armazenamento e completa os metadados que
 * só o cliente conhece: dimensões, duração do vídeo e capa.
 *
 * `duration_seconds` não é enfeite — sem ela não há como calcular quartil de
 * vídeo, que é uma das métricas pedidas.
 *
 * Confere a existência do objeto antes de marcar pronto: sem isso, uma falha
 * de rede no meio do envio deixaria uma publicação apontando para um arquivo
 * que não existe.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor", "partner"]);
    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    const { data: midia, error } = await supabase
      .from("feed_post_media")
      .select("id, post_id, storage_path, kind")
      .eq("id", id)
      .maybeSingle();
    if (error || !midia) throw new AuthError(404, "Mídia não encontrada");

    if (user.role !== "admin") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, midia.post_id, sponsor_id);
      if (!dono) throw new AuthError(404, "Mídia não encontrada");
    }

    const pasta = midia.storage_path.split("/").slice(0, -1).join("/");
    const arquivo = midia.storage_path.split("/").pop();
    const { data: lista } = await supabase.storage.from("feed").list(pasta, { limit: 100 });
    const existe = (lista ?? []).some((o) => o.name === arquivo);

    if (!existe) {
      await supabase
        .from("feed_post_media")
        .update({ status: "failed" })
        .eq("id", id);
      throw new AuthError(400, "O arquivo não chegou ao armazenamento. Envie de novo.");
    }

    const { data: pub } = supabase.storage.from("feed").getPublicUrl(midia.storage_path);

    const atualizacao: Record<string, unknown> = {
      status: "ready",
      public_url: pub.publicUrl,
      width: body.width ?? null,
      height: body.height ?? null,
      alt_text: body.alt_text ?? null,
      caption: body.caption ?? null,
    };
    if (midia.kind === "video") {
      atualizacao.duration_seconds = body.duration_seconds ?? null;
      atualizacao.thumbnail_url = body.thumbnail_url ?? null;
    }

    const { data: pronta, error: errUp } = await supabase
      .from("feed_post_media")
      .update(atualizacao)
      .eq("id", id)
      .select("*")
      .single();

    if (errUp) throw new Error(`Falha ao confirmar a mídia: ${errUp.message}`);
    return jsonResponse(pronta);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/feed/media/[id] — remove a mídia e o arquivo. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor", "partner"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: midia } = await supabase
      .from("feed_post_media")
      .select("post_id, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (!midia) throw new AuthError(404, "Mídia não encontrada");

    if (user.role !== "admin") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, midia.post_id, sponsor_id);
      if (!dono) throw new AuthError(404, "Mídia não encontrada");
    }

    await supabase.storage.from("feed").remove([midia.storage_path]);
    const { error } = await supabase.from("feed_post_media").delete().eq("id", id);
    if (error) throw new Error(`Falha ao remover: ${error.message}`);

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
