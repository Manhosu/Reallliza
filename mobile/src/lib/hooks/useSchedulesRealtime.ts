/**
 * Hook de Realtime para schedules — agenda do user.
 *
 * Atualiza a tela de Agenda quando um schedule novo é criado/alterado
 * pra esse user. Cobre o cenário Jessica 17/06 em que o parceiro
 * aceitou broadcast → createScheduleFromOs gerou evento → tinha que
 * abrir o app e a Agenda mostrava vazio até forçar refresh.
 *
 * Filtra no client: refire só quando o payload.technician_id == user.id.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../../stores/auth-store';

type OnChangeFn = () => void;

interface Options {
  onChange: OnChangeFn;
  enabled?: boolean;
}

export function useSchedulesRealtime({ onChange, enabled = true }: Options) {
  const { profile } = useAuthStore();
  const lastFire = useRef<number>(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !profile?.id) return;

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
      return (row.technician_id as string | null) === profile.id;
    };

    const channel = supabase
      .channel(`schedules-realtime-${profile.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'schedules' },
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
  }, [enabled, profile?.id, onChange]);
}
