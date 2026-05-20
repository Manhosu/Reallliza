import { createClient } from "@/lib/supabase/client";

export type SessionGuardResult =
  | { ok: true }
  | { ok: false; reason: "no-session" | "expired" };

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/**
 * Garante que existe sessão válida antes de um POST/PUT.
 * Se faltar menos de 60s pra expirar, força o refresh.
 * BUG-001: forms longos (OS / orçamento) podem rodar past 1h e o token
 * vence sem refresh (aba inativa não dispara o autoRefresh). Sem este
 * guard, o save manda token expirado e some no 401 silencioso.
 */
export async function assertFreshSession(): Promise<SessionGuardResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: "no-session" };

  const exp = decodeJwtExp(session.access_token);
  if (!exp) return { ok: true };

  const now = Math.floor(Date.now() / 1000);
  if (exp - now > 60) return { ok: true };

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}
