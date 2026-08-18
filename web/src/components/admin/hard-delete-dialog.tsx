"use client";

import { useEffect, useState } from "react";
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
  /**
   * Contexto extra para diferenciar registros de nome igual — o parceiro de
   * uma proposta, o horário de um agendamento, a data de uma avaliação.
   *
   * Existe porque nem toda entidade tem nome próprio: duas propostas da mesma
   * OS, duas garantias da mesma OS e dois agendamentos do mesmo dia produzem
   * `entityName` idêntico, e aí a digitação confirma o texto sem confirmar o
   * registro. O que se digita continua sendo o `entityName`; isto só aparece
   * ao lado, para a pessoa saber em qual dos dois está.
   */
  entityHint?: string;
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
  entityHint,
  dependencies,
  loadingDeps,
  onClose,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const blocking = (dependencies ?? []).find((d) => d.action === "block");
  const matches =
    typed.trim().toLowerCase() === entityName.trim().toLowerCase() &&
    entityName.trim().length > 0;

  /**
   * O texto digitado morre junto com o diálogo.
   *
   * O componente fica montado o tempo todo — o `AnimatePresence` está aqui
   * dentro, então fechar desmonta só o conteúdo. `typed` sobrevivia, e só o
   * caminho de sucesso o limpava. Efeito: quem abria, digitava o nome e
   * cancelava, ao reabrir encontrava o campo preenchido e o botão vermelho já
   * habilitado. Em telas onde o nome se repete entre registros — duas
   * propostas da mesma OS, duas avaliações do mesmo profissional — a segunda
   * abertura era de OUTRO registro com a confirmação do primeiro já satisfeita.
   *
   * A digitação existe para forçar a pessoa a conferir qual registro está
   * saindo. Guardada entre aberturas, ela deixava de conferir qualquer coisa.
   */
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  // E também quando o diálogo troca de alvo sem fechar no meio.
  useEffect(() => {
    setTyped("");
  }, [entityName]);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      // Sem particípio: "proposta excluído" e "unidade excluído" saíam com o
      // gênero errado, e acertar exigiria marcar gênero em cada rótulo passado
      // por vinte telas. A frase funciona igual sem ele.
      toast.success(`Exclusão concluída: ${entityLabel}`);
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
                  {entityHint && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{entityHint}</p>
                  )}
                </div>

                {loadingDeps ? (
                  <p className="text-xs text-muted-foreground italic">
                    Verificando dependências...
                  </p>
                ) : dependencies && dependencies.length > 0 ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold text-destructive mb-2 uppercase tracking-wide">
                      {/*
                        O título vinha fixo em "apagadas em cascata", que ficava
                        errado quando a lista só tinha desvínculos — o diálogo
                        anunciava perda de dado onde não havia nenhuma.
                      */}
                      {blocking
                        ? "Bloqueio"
                        : dependencies.some((d) => d.action === "cascade")
                          ? "O que será apagado junto"
                          : "O que será desvinculado"}
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
