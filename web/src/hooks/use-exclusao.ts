"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Dependency } from "@/components/admin/hard-delete-dialog";

/**
 * O estado de "excluir este cadastro", numa linha.
 *
 * O padrão de três peças — estado, botão, diálogo — já estava em sete telas,
 * copiado. Com mais onze cadastros ganhando exclusão, copiar de novo seria
 * dezoito lugares para corrigir quando algo mudasse.
 *
 * O que este hook resolve, e que a cópia fazia errado com facilidade: buscar
 * as dependências ANTES de abrir o diálogo, para o usuário ver o que segura o
 * registro em vez de clicar, esperar e receber recusa.
 *
 *   const excl = useExclusao<Ferramenta>("tool_inventory", (f) => f.name);
 *   <Button onClick={() => excl.abrir(f)}><Trash2 /></Button>
 *   <HardDeleteDialog {...excl.props("ferramenta")} onConfirm={...} />
 */
export function useExclusao<T extends { id: string }>(
  tabela: string,
  nomeDe: (registro: T) => string
) {
  const [alvo, setAlvo] = useState<T | null>(null);
  const [dependencias, setDependencias] = useState<Dependency[]>([]);
  const [carregando, setCarregando] = useState(false);

  const abrir = useCallback(
    async (registro: T) => {
      setAlvo(registro);
      setCarregando(true);
      try {
        const r = await apiClient.get<{ dependencies: Dependency[] }>(
          `/admin/dependencias?tabela=${tabela}&id=${registro.id}`
        );
        setDependencias(r.dependencies);
      } catch {
        // Sem o diagnóstico o diálogo ainda funciona — só não antecipa o
        // bloqueio. A recusa vem do servidor, igualmente explicada.
        setDependencias([]);
      } finally {
        setCarregando(false);
      }
    },
    [tabela]
  );

  const fechar = useCallback(() => {
    setAlvo(null);
    setDependencias([]);
  }, []);

  return {
    alvo,
    abrir,
    fechar,
    /** Espalhe no HardDeleteDialog; falta só o `onConfirm`. */
    props: (entityLabel: string) => ({
      open: !!alvo,
      entityLabel,
      entityName: alvo ? nomeDe(alvo) : "",
      dependencies: dependencias,
      loadingDeps: carregando,
      onClose: fechar,
    }),
  };
}
