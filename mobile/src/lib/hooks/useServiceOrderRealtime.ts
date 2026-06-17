/**
 * Hook de Realtime para service_orders.
 *
 * Inscreve-se nas mudanças da tabela `service_orders` e dispara um
 * callback (refetch) quando uma OS relevante para o usuário muda:
 *   - technician_id passou a ser ele, ou
 *   - partner_id passou a ser o partner record dele.
 *
 * Cenário Jessica 17/06: parceiro aceitava broadcast e a OS só aparecia
 * na lista após pull-to-refresh. Agora o app atualiza sozinho.
 *
 * Throttle simples: se o callback foi chamado < 800ms atrás, agenda para
 * a próxima janela. Evita refetch em rajada em UPDATEs em sequência.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../../stores/auth-store';

type OnChangeFn = () => void;

interface Options {
  /** Chamado quando uma mudança relevante ao user é detectada. */
  onRelevantChange: OnChangeFn;
  /** Liga/desliga o subscribe; útil pra suspender quando a tela está fora. */
  enabled?: boolean;
}

export function useServiceOrderRealtime({ onRelevantChange, enabled = true }: Options) {
  const { profile } = useAuthStore();
  const lastFire = useRef<number>(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerIdRef = useRef<string | null>(null);

  // Pré-carrega o partner_id do user (parceiro) uma única vez. Para o
  // técnico não precisa — basta comparar technician_id.
  useEffect(() => {
    if (!enabled || !profile?.id) return;
    if (profile.role !== 'partner') {
      partnerIdRef.current = null;
      return;
    }
    let cancelled = false;
    supabase
      .from('partners')
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        partnerIdRef.current = (data?.id as string | undefined) ?? null;
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, profile?.id, profile?.role]);

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

    const isRelevant = (row: Record<string, unknown> | null | undefined) => {
      if (!row) return false;
      const technicianId = row.technician_id as string | null;
      const partnerId = row.partner_id as string | null;
      if (technicianId && technicianId === profile.id) return true;
      if (partnerIdRef.current && partnerId === partnerIdRef.current) return true;
      return false;
    };

    const channel = supabase
      .channel(`so-realtime-${profile.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'service_orders' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          // INSERT/UPDATE → considera `new`. DELETE → `old`.
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
  }, [enabled, profile?.id, onRelevantChange]);
}
