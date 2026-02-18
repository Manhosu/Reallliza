import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Public routes that don't require authentication
const publicRoutes = ["/login", "/auth/callback", "/auth/confirm"];

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
     * - public folder files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
