"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Dependency {
  label: string;
  count: number;
  action: "cascade" | "block" | "set_null";
}

interface Props {
  open: boolean;
  entityLabel: string; // "parceiro", "técnico", ...
  entityName: string; // que o admin digita pra confirmar
  dependencies?: Dependency[];
  loadingDeps?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Modal reusável de "Excluir permanentemente" (Jessica 27/07 D6).
 * Mostra dependências, exige digitação do nome pra confirmar.
 * Se houver dependência com action='block', desabilita o botão.
 */
export function HardDeleteDialog({
  open,
  entityLabel,
  entityName,
  dependencies,
  loadingDeps,
  onClose,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const blocking = (dependencies ?? []).find((d) => d.action === "block");
  const matches = typed.trim().toLowerCase() === entityName.trim().toLowerCase();

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      toast.success(`${entityLabel} excluído`);
      setTyped("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="border-destructive/40">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-destructive/20">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-destructive/15 p-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <CardTitle className="text-destructive">
                      Excluir {entityLabel}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Esta ação é permanente e não pode ser desfeita.
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <p className="text-sm">
                    Nome do registro:{" "}
                    <strong className="text-foreground">{entityName}</strong>
                  </p>
                </div>

                {loadingDeps ? (
                  <p className="text-xs text-muted-foreground italic">
                    Verificando dependências...
                  </p>
                ) : dependencies && dependencies.length > 0 ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold text-destructive mb-2 uppercase tracking-wide">
                      {blocking
                        ? "Bloqueio"
                        : "Dependências que serão apagadas em cascata"}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {dependencies.map((d, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-xs font-mono w-8 text-right">
                            {d.count}
                          </span>
                          <span
                            className={cn(
                              d.action === "block" && "text-destructive font-medium"
                            )}
                          >
                            {d.label}
                            {d.action === "block" && " — impede exclusão"}
                            {d.action === "set_null" && " (desvincula, não apaga)"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!blocking && (
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Digite <strong>{entityName}</strong> pra confirmar:
                    </label>
                    <Input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder={entityName}
                      className="mt-1"
                      autoFocus
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirm}
                    disabled={!matches || !!blocking || deleting}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {deleting ? "Excluindo..." : "Excluir permanentemente"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
