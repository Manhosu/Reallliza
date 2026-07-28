"use client";

import { useState } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select-native";
import { apiClient } from "@/lib/api/client";
import { uploadToolPhoto } from "@/lib/tools/upload-photo";

type PhotoRef = { url: string; name: string; storage_path?: string };

const CONDITIONS = [
  { value: "good", label: "Boa condição" },
  { value: "fair", label: "Desgaste normal" },
  { value: "poor", label: "Ruim" },
  { value: "damaged", label: "Danificada" },
];

const NEXT_STATUS = [
  { value: "available", label: "Voltar pra disponível" },
  { value: "maintenance", label: "Enviar pra manutenção" },
  { value: "damaged", label: "Marcar como danificada" },
  { value: "retired", label: "Aposentar/Baixar" },
  { value: "missing", label: "Marcar como extraviada" },
];

/**
 * Modal de devolução de ferramenta (Jessica 28/07).
 * Registra condição, observação, fotos + escolha do novo status.
 */
export function DevolucaoModal({
  custodyId,
  toolId,
  onClose,
  onDone,
}: {
  custodyId: string;
  toolId?: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState("available");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const requireNotes = condition === "damaged" || condition === "poor";

  const handleFile = async (f: File) => {
    if (!toolId) {
      toast.error("Tool ID ausente");
      return;
    }
    setUploading(true);
    try {
      const p = await uploadToolPhoto(f, "return", toolId);
      setPhotos((prev) => [...prev, p]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha upload");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (requireNotes && !notes.trim()) {
      toast.error("Observação obrigatória quando condição é ruim/danificada");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/tools/custody/${custodyId}/checkin`, {
        condition_in: condition,
        notes_in: notes || null,
        photos_in: photos,
        new_status: newStatus,
      });
      toast.success("Devolução registrada");
      await onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-card border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Receber devolução</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Condição na devolução</label>
            <SelectNative
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectNative>
          </div>

          <div>
            <label className="text-sm font-medium">
              Observação {requireNotes && <span className="text-destructive">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                requireNotes
                  ? "Descreva o dano ou problema (obrigatório)"
                  : "Opcional"
              }
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Fotos da ferramenta ({photos.length})
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name}
                    className="h-16 w-16 rounded-md object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed hover:bg-secondary/50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                  disabled={uploading}
                />
                <Upload className="h-4 w-4 text-muted-foreground" />
              </label>
            </div>
            {uploading && (
              <p className="text-xs text-muted-foreground mt-1">Enviando...</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Novo status da ferramenta</label>
            <SelectNative
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="mt-1"
            >
              {NEXT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} isLoading={saving} disabled={uploading}>
              Confirmar devolução
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
