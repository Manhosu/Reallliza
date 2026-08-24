import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { AuthError } from "@/lib/api-helpers/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      throw new AuthError(400, "Email is required");
    }

    const supabase = getAdminClient();
    // Deriva da própria requisição em vez de uma env var — `NEXT_PUBLIC_APP_URL`
    // nunca foi configurada em produção, então isto sempre gerou link de
    // recuperação apontando pra localhost, mesmo pra quem clicava em
    // produção. A origem da requisição está sempre certa, sem depender de
    // ninguém lembrar de configurar mais uma variável.
    const redirectUrl = request.nextUrl.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectUrl}/auth/reset-password`,
    });

    if (error) {
      console.error(
        `Failed to send reset password email to ${email}: ${error.message}`
      );
      // Don't expose whether the email exists or not
    }

    return jsonResponse({
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
