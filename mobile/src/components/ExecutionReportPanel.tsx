/**
 * Relatorio de execucao (versao mobile read-only).
 *
 * Espelha a secao web em ExecutionReportSection: KPIs + cards por etapa
 * com horarios, duracao efetiva e pausas. Usado dentro do OsDetailScreen.
 *
 * Jessica 18/06: tecnico tambem ve o proprio cronograma sem precisar
 * abrir o painel admin.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { useStepExecutionsRealtime } from '../lib/hooks/useStepExecutionsRealtime';
import { formatDurationShort } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface PauseEntry {
  paused_at: string;
  resumed_at: string;
  duration_seconds: number;
  reason?: string;
}

interface ReportStep {
  id: string;
  step_key: string;
  order_index: number;
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  total_duration_seconds: number | null;
  active_duration_seconds: number | null;
  total_pause_seconds: number;
  pause_count: number;
  wait_time_minutes: number;
  unlocked_at: string | null;
  pause_log: PauseEntry[];
  photos_count: number;
  notes: string | null;
}

interface Report {
  steps: ReportStep[];
  summary: {
    started_at: string | null;
    completed_at: string | null;
    total_duration_seconds: number;
    total_active_seconds: number;
    total_pause_seconds: number;
    total_pauses: number;
  };
}

interface Props {
  osId: string;
}

export function ExecutionReportPanel({ osId }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<Report>(
        `/service-orders/${osId}/steps/report`,
      );
      setReport(data);
    } catch (err) {
      console.error('Error loading execution report:', err);
    }
  }, [osId]);

  useEffect(() => {
    setIsLoading(true);
    load().finally(() => setIsLoading(false));
  }, [load]);

  useStepExecutionsRealtime({ osId, onChange: load });

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!report || report.steps.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>
          Nenhuma etapa registrada ainda nesta OS.
        </Text>
      </View>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.kpiRow}>
        <Kpi
          label="Efetivo"
          value={formatDurationShort(report.summary.total_active_seconds)}
          highlight
        />
        <Kpi
          label="Pausado"
          value={formatDurationShort(report.summary.total_pause_seconds)}
          hint={`${report.summary.total_pauses}× pausa${
            report.summary.total_pauses === 1 ? '' : 's'
          }`}
        />
        <Kpi
          label="Total"
          value={formatDurationShort(report.summary.total_duration_seconds)}
        />
      </View>

      {report.steps.map((s) => {
        const isExp = expanded.has(s.id);
        return (
          <View key={s.id} style={styles.stepCard}>
            <TouchableOpacity
              style={styles.stepHeader}
              onPress={() => toggle(s.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.stepBadge,
                  s.status === 'completed' && styles.stepBadgeDone,
                  s.status === 'in_progress' && styles.stepBadgeProgress,
                ]}
              >
                <Text style={styles.stepBadgeText}>{s.order_index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepName}>{s.name}</Text>
                <Text style={styles.stepMeta}>
                  {s.started_at
                    ? format(new Date(s.started_at), 'dd/MM HH:mm', {
                        locale: ptBR,
                      })
                    : '—'}
                  {' → '}
                  {s.completed_at
                    ? format(new Date(s.completed_at), 'HH:mm', {
                        locale: ptBR,
                      })
                    : 'em curso'}
                  {' · '}
                  <Text style={styles.stepMetaStrong}>
                    {formatDurationShort(s.active_duration_seconds ?? 0)} efetivo
                  </Text>
                </Text>
                {s.pause_count > 0 && (
                  <Text style={styles.stepPause}>
                    ⏸ {s.pause_count}× ·{' '}
                    {formatDurationShort(s.total_pause_seconds)} pausada
                  </Text>
                )}
                {s.wait_time_minutes > 0 && (
                  <Text style={styles.stepWait}>
                    cura de {s.wait_time_minutes} min após
                  </Text>
                )}
              </View>
              {(s.pause_log.length > 0 || s.notes) && (
                <Ionicons
                  name={isExp ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              )}
            </TouchableOpacity>

            {isExp && (s.pause_log.length > 0 || s.notes) && (
              <View style={styles.stepDetail}>
                {!!s.notes && (
                  <Text style={styles.stepNotes}>
                    <Text style={styles.bold}>Observações: </Text>
                    {s.notes}
                  </Text>
                )}
                {s.pause_log.length > 0 && (
                  <View style={{ gap: 2 }}>
                    {s.pause_log.map((p, i) => (
                      <Text key={i} style={styles.pauseRow}>
                        ⏸{' '}
                        {format(new Date(p.paused_at), 'HH:mm', {
                          locale: ptBR,
                        })}
                        {' → '}
                        {format(new Date(p.resumed_at), 'HH:mm', {
                          locale: ptBR,
                        })}
                        {' · '}
                        {formatDurationShort(p.duration_seconds)}
                        {p.reason ? ` — ${p.reason}` : ''}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Kpi({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.kpi, highlight && styles.kpiHighlight]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {!!hint && <Text style={styles.kpiHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  loadingBox: { padding: 16, alignItems: 'center' },
  emptyBox: { padding: 12 },
  emptyText: { ...typography.bodySm, color: colors.textMuted },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiHighlight: {
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderColor: colors.primary,
  },
  kpiLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontSize: 10,
  },
  kpiValue: { ...typography.h4, color: colors.text, marginTop: 2 },
  kpiHint: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  stepBadgeDone: { backgroundColor: colors.success + '33' },
  stepBadgeProgress: { backgroundColor: colors.warning + '33' },
  stepBadgeText: { ...typography.captionBold, color: colors.text },
  stepName: { ...typography.bodySm, color: colors.text, fontWeight: '600' },
  stepMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  stepMetaStrong: { color: colors.text, fontWeight: '600' },
  stepPause: { ...typography.caption, color: colors.warning, marginTop: 2 },
  stepWait: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  stepDetail: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.cardAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  stepNotes: { ...typography.caption, color: colors.text },
  pauseRow: { ...typography.caption, color: colors.textMuted },
  bold: { fontWeight: '700', color: colors.text },
});
