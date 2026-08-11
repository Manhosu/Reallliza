/**
 * Realtime do módulo Ferramentas.
 *
 * Spec (regra 10 do app): "Toda movimentação realizada na plataforma do
 * almoxarifado deverá refletir automaticamente no aplicativo." Antes a tela só
 * recarregava no pull-to-refresh — o técnico não via o pedido virar "pronto
 * para retirada" sem puxar a lista na mão.
 *
 * Escuta tool_requests (pedidos dele) e tool_custody (custódias dele), com o
 * mesmo throttle de 800 ms dos outros hooks de realtime do app.
 *
 * Depende da migration 059, que publicou as duas tabelas em supabase_realtime.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../../stores/auth-store';

interface Options {
  onRelevantChange: () => void;
  enabled?: boolean;
}

export function useToolsRealtime({ onRelevantChange, enabled = true }: Options) {
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
        onRelevantChange();
        return;
      }
      if (pendingTimer.current) return;
      pendingTimer.current = setTimeout(() => {
        lastFire.current = Date.now();
        pendingTimer.current = null;
        onRelevantChange();
      }, 800 - elapsed);
    };

    /** Pedido é meu quando requester_id sou eu; custódia, quando user_id sou eu. */
    const isMine = (row: Record<string, unknown> | null | undefined) => {
      if (!row) return false;
      return (
        (row.requester_id as string | null) === profile.id ||
        (row.user_id as string | null) === profile.id
      );
    };

    const channel = supabase
      .channel(`tools-realtime-${profile.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'tool_requests' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (isMine(payload?.new) || isMine(payload?.old)) fire();
        }
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'tool_custody' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (isMine(payload?.new) || isMine(payload?.old)) fire();
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
  }, [enabled, profile?.id, onRelevantChange]);
}
