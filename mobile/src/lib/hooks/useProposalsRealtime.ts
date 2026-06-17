/**
 * Hook de Realtime para service_proposals.
 *
 * Inscreve-se em mudanças (INSERT/UPDATE/DELETE) na tabela de propostas
 * e dispara `onChange` quando algo muda. O filtro de "interessa pra esse
 * user?" é feito por callback do hook chamador, já que o filtro lado-
 * cliente do Supabase não dá pra fazer OR com `accepted_by` / `partner_id`.
 *
 * Vale pra qualquer mudança porque propostas são poucas — não é volume
 * que justifique filtro fino aqui.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../../stores/auth-store';

type OnChangeFn = () => void;

interface Options {
  onChange: OnChangeFn;
  enabled?: boolean;
}

export function useProposalsRealtime({ onChange, enabled = true }: Options) {
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

    const channel = supabase
      .channel(`proposals-realtime-${profile.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'service_proposals' },
        () => fire()
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
