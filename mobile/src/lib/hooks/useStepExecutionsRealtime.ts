/**
 * Hook de Realtime para os_step_executions — etapas de uma OS.
 *
 * Refire quando a etapa muda (start/complete/pause/resume) — necessario
 * pra que StepsScreen/StepDetailScreen reflitam acoes feitas no admin web
 * em tempo real e atualize o countdown de cura quando a etapa anterior
 * concluir em outro device.
 *
 * Filtra no client: refire so quando payload.service_order_id == osId.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

type OnChangeFn = () => void;

interface Options {
  osId: string | null | undefined;
  onChange: OnChangeFn;
  enabled?: boolean;
}

export function useStepExecutionsRealtime({
  osId,
  onChange,
  enabled = true,
}: Options) {
  const lastFire = useRef<number>(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !osId) return;

    const fire = () => {
      const now = Date.now();
      const elapsed = now - lastFire.current;
      if (elapsed >= 800) {
        lastFire.current = now;
        onChange();
        return;
      }
      if (pendingTimer.current) return;
      pendingTimer.current = setTimeout(() => {
        lastFire.current = Date.now();
        pendingTimer.current = null;
        onChange();
      }, 800 - elapsed);
    };

    const isRelevant = (row: Record<string, unknown> | null | undefined) => {
      if (!row) return false;
      return (row.service_order_id as string | null) === osId;
    };

    const channel = supabase
      .channel(`os-step-executions-realtime-${osId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'os_step_executions' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (isRelevant(payload?.new) || isRelevant(payload?.old)) {
            fire();
          }
        }
      )
      .subscribe();

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, osId, onChange]);
}
