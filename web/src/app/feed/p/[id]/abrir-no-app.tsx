"use client";

import { useEffect } from "react";
import { Smartphone, Download } from "lucide-react";

/**
 * Se o Android já intercepta o link (App Link verificado) e o app está
 * instalado, esta página nunca chega a carregar — o sistema abre o app
 * direto ao tocar no link no WhatsApp/etc. Isto aqui é o caminho B: o
 * usuário caiu no navegador mesmo assim (link digitado, verificação ainda
 * não propagou, ou o app não está instalado).
 *
 * `intent://` é o fallback manual clássico do Android: se o app estiver
 * instalado mas o navegador não tiver feito a interceptação automática, o
 * toque no botão abre por esse caminho; se não estiver instalado,
 * `S.browser_fallback_url` manda o próprio Android abrir a página de
 * download em vez de só falhar.
 */
export function AbrirNoApp({ postId }: { postId: string }) {
  const path = `/feed/p/${postId}`;
  const host = typeof window !== "undefined" ? window.location.host : "reallliza-web.vercel.app";
  const fallback = encodeURIComponent(`https://${host}/api/app-download`);
  const intentUrl = `intent://${host}${path}#Intent;scheme=https;package=com.reallliza.app;S.browser_fallback_url=${fallback};end`;

  useEffect(() => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) return;
    // Dá meio segundo pro Android terminar a interceptação automática
    // (se for verificada) antes de tentar o intent manual — evita disparar
    // os dois ao mesmo tempo.
    const t = setTimeout(() => {
      window.location.href = intentUrl;
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 flex flex-col gap-2.5">
      <a
        href={intentUrl}
        className="flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-yellow-300"
      >
        <Smartphone className="h-4 w-4" />
        Abrir no app Reallliza
      </a>
      <a
        href="/api/app-download"
        className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        <Download className="h-4 w-4" />
        Ainda não tenho o app — baixar
      </a>
    </div>
  );
}
