import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Public routes that don't require authentication
const publicRoutes = [
  "/login",
  "/auth/callback",
  "/auth/confirm",
  "/cadastro-profissional",
  "/cadastro-empresa",
  // Paginas publicas de verificacao/preview (sem sessao) - QR do Termo de
  // Garantia e o preview do botao Compartilhar do Feed. Sem isto, o
  // middleware redireciona qualquer visitante sem login pra /login,
  // quebrando o proposito das duas (27/08/2026 - achado ao validar o
  // deep link do Feed em producao, mas atingia o /relatorio ja existente
  // desde que ele foi criado).
  "/relatorio",
  "/feed/p",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Refresh session and get user
  const { supabaseResponse, user } = await updateSession(request);

  // If user is not authenticated and trying to access a protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // If user is authenticated and trying to access login page, redirect to dashboard
  if (user && pathname === "/login") {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    const url = request.nextUrl.clone();
    url.pathname = redirectTo || "/dashboard";
    url.searchParams.delete("redirectTo");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .well-known (arquivos de verificacao estatica, ex.: assetlinks.json
     *   do App Link do Feed - precisam responder 200 puro, sem redirect)
     * - public folder files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)",
  ],
};
