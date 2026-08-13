import { getAccessToken, BASE_URL, ApiError } from "@/lib/api/client";

/**
 * Upload de foto de ferramenta no bucket privado `tool-photos`.
 *
 * Jessica 12/08: aparecia "Sessão expirada, faça login de novo" ao escolher o
 * arquivo, e relogar não resolvia.
 *
 * A versão anterior criava um cliente Supabase próprio no navegador
 * (`createClient` do supabase-js, que guarda sessão em localStorage), enquanto
 * o app autentica com `createBrowserClient` do @supabase/ssr, que guarda em
 * COOKIE. Os dois nunca compartilharam sessão, então `getSession()` voltava
 * vazio em toda tentativa — não era a sessão que estava expirada.
 *
 * Agora o upload vai pelo servidor com o Bearer token, como o resto do sistema.
 */
export async function uploadToolPhoto(
  file: File,
  kind: "delivery" | "return" | "maintenance" | "retirement" | "unit",
  toolId: string
): Promise<{ url: string; name: string; storage_path: string }> {
  const token = await getAccessToken();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("tool_id", toolId || "sem-vinculo");

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/tools/upload-photo`, {
    method: "POST",
    headers,
    body: formData,
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, res.statusText || "Resposta inválida do upload");
  }

  if (!res.ok) {
    const body = data as Record<string, unknown> | undefined;
    throw new ApiError(
      res.status,
      (body?.message as string) || (body?.error as string) || res.statusText,
      body
    );
  }

  return data as { url: string; name: string; storage_path: string };
}
