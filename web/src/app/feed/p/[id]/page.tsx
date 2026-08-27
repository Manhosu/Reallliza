import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { buscarPreviewPublico } from "@/lib/feed/preview-publico";
import { AbrirNoApp } from "./abrir-no-app";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://reallliza-web.vercel.app";

/**
 * Metadados OG/Twitter renderizados no servidor — quem cola o link no
 * WhatsApp precisa ver título/imagem/resumo direto no preview do card, sem
 * o app rodar JS nenhum. Isso só funciona vindo de generateMetadata (server),
 * não dá pra fazer via fetch no cliente como a página /relatorio faz.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const preview = await buscarPreviewPublico(id);

  if (!preview.found) {
    return { title: "Publicação não encontrada - Reallliza" };
  }

  const titulo = preview.sponsor_name
    ? `${preview.title} — ${preview.sponsor_name}`
    : `${preview.title} - Reallliza`;
  const url = `${BASE_URL}/feed/p/${id}`;

  return {
    title: titulo,
    description: preview.excerpt,
    openGraph: {
      title: preview.title,
      description: preview.excerpt,
      url,
      siteName: "Reallliza",
      images: preview.image_url ? [{ url: preview.image_url }] : undefined,
      locale: "pt_BR",
      type: "article",
    },
    twitter: {
      card: preview.image_url ? "summary_large_image" : "summary",
      title: preview.title,
      description: preview.excerpt,
      images: preview.image_url ? [preview.image_url] : undefined,
    },
  };
}

export default async function FeedPostPublicoPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const preview = await buscarPreviewPublico(id);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex justify-center border-b border-zinc-800 py-6">
          <span className="text-2xl font-bold">
            <span className="text-yellow-400">R</span>
            <span className="text-white">EALIZA</span>
          </span>
        </div>

        {preview.found ? (
          <>
            {preview.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.image_url}
                alt=""
                className="h-48 w-full object-cover"
              />
            )}
            <div className="p-6">
              {preview.sponsor_name && (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-yellow-400">
                  {preview.sponsor_name}
                </p>
              )}
              <h1 className="text-lg font-bold text-white">{preview.title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {preview.excerpt}
              </p>

              <p className="mt-5 text-xs text-zinc-500">
                Publicado no Feed Corporativo Reallliza — abra no app pra ver
                o conteúdo completo, reagir e comentar.
              </p>

              <AbrirNoApp postId={id} />
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                <Newspaper className="h-8 w-8 text-zinc-600" />
              </div>
            </div>
            <h1 className="text-lg font-bold text-white">
              Publicação não encontrada
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Este link não está mais disponível ou a publicação saiu do ar.
            </p>
            <AbrirNoApp postId={id} />
          </div>
        )}
      </div>
    </div>
  );
}
