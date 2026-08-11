"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { uploadToolPhoto } from "@/lib/tools/upload-photo";

export type PhotoRef = { url: string; name: string; storage_path?: string };

/**
 * Campo de anexo de fotos de ferramenta.
 *
 * Extraido do fluxo de devolucao (que ja fazia isso inline) pra atender o
 * pedido da Jessica de 22/06: manutencao e baixa tambem precisam de fotos.
 * As colunas `photos` ja existiam nas duas tabelas desde a migration 053 e
 * as rotas ja aceitavam o campo — faltava so' a UI.
 */
export function ToolPhotosField({
  toolId,
  kind,
  photos,
  onChange,
  label = "Fotos",
  disabled = false,
}: {
  toolId: string;
  kind: "delivery" | "return" | "maintenance" | "retirement";
  photos: PhotoRef[];
  onChange: (photos: PhotoRef[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    if (!toolId) {
      toast.error("Selecione a ferramenta antes de anexar fotos");
      return;
    }
    if (list.some((f) => !f.type.startsWith("image/"))) {
      toast.error("Selecione apenas imagens");
      return;
    }

    setUploading(true);
    try {
      const uploaded: PhotoRef[] = [];
      for (const file of list) {
        uploaded.push(await uploadToolPhoto(file, kind, toolId));
      }
      onChange([...photos, ...uploaded]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none text-foreground/80">
        {label}
      </label>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div
              key={p.storage_path ?? p.url}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-secondary/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() =>
                  onChange(photos.filter((x) => (x.storage_path ?? x.url) !== (p.storage_path ?? p.url)))
                }
                className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Remover ${p.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        multiple
        disabled={disabled || uploading}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
        className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
      />
      {uploading && <p className="text-xs text-muted-foreground">Enviando...</p>}
    </div>
  );
}
