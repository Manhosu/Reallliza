import { NextResponse } from "next/server";

/**
 * GET /api/app-download
 *
 * Redireciona pro APK mais recente. O app não está na Play Store — é
 * distribuído como link direto do EAS, que muda a cada build. Em vez de
 * espalhar o link do artefato pelo código (QR do relatório, botão
 * Compartilhar do Feed, etc.) e ter que trocar todo mundo a cada versão,
 * todo mundo aponta pra ESTA rota, e só a env var `MOBILE_APK_URL` precisa
 * ser atualizada quando sai um build novo.
 */
export async function GET() {
  const url = process.env.MOBILE_APK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "Link de download indisponível no momento. Fale com o suporte." },
      { status: 503 }
    );
  }
  return NextResponse.redirect(url);
}
