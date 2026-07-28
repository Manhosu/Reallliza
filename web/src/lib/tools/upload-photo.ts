import { createClient } from "@supabase/supabase-js";

/**
 * Upload de foto de ferramenta no bucket tool-photos (Jessica 28/07).
 * Retorna { url (signed 30d), name, storage_path } no mesmo shape usado
 * em tool_custody.photos_in/photos_out.
 */
export async function uploadToolPhoto(
  file: File,
  kind: "delivery" | "return" | "maintenance" | "retirement",
  toolId: string
): Promise<{ url: string; name: string; storage_path: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase env missing");

  const client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const { data: sessData } = await client.auth.getSession();
  if (!sessData.session) throw new Error("Sessao expirada, faca login de novo");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${kind}/${toolId}/${Date.now()}-${rand}.${ext}`;

  const { error: upErr } = await client.storage
    .from("tool-photos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(`Falha upload: ${upErr.message}`);

  const { data: signed, error: sErr } = await client.storage
    .from("tool-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (sErr || !signed) throw new Error("Falha gerar URL");

  return {
    url: signed.signedUrl,
    name: file.name,
    storage_path: path,
  };
}
