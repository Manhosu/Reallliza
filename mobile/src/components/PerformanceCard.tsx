import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Performance {
  total_ratings: number;
  total_services_completed: number;
  avg_overall: number | null;
  recent_reviews: Array<{
    comment: string | null;
    score: number | null;
    created_at: string;
  }>;
}

function StarsRow({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= Math.round(score) ? 'star' : 'star-outline'}
          size={size}
          color={colors.primary}
        />
      ))}
    </View>
  );
}

export function PerformanceCard() {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<Performance>('/profile/me/performance')
      .then(setData)
      .catch(() => {
        /* silencia */
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Desempenho</Text>

      <View style={styles.headerRow}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreValue}>
            {data.avg_overall != null ? data.avg_overall.toFixed(1) : '—'}
          </Text>
          <StarsRow score={data.avg_overall || 0} size={14} />
          <Text style={styles.scoreLabel}>
            {data.total_ratings} avaliação(ões)
          </Text>
        </View>
        <View style={styles.servicesBlock}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
          <Text style={styles.servicesValue}>
            {data.total_services_completed}
          </Text>
          <Text style={styles.servicesLabel}>Serviços concluídos</Text>
        </View>
      </View>

      {data.recent_reviews.length > 0 && (
        <View style={styles.reviews}>
          <Text style={styles.reviewsHeading}>Avaliações recentes</Text>
          {data.recent_reviews.map((r, idx) => (
            <View key={idx} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <StarsRow score={r.score || 0} size={11} />
                <Text style={styles.reviewDate}>
                  {format(new Date(r.created_at), 'dd/MM/yy', { locale: ptBR })}
                </Text>
              </View>
              {r.comment && <Text style={styles.reviewText}>{r.comment}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  heading: {
    ...typography.bodyBold,
    color: colors.text,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreBlock: {
    flex: 1,
    backgroundColor: colors.primary + '12',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  scoreLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  servicesBlock: {
    flex: 1,
    backgroundColor: colors.success + '12',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  servicesValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.success,
  },
  servicesLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCell: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  metricValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  reviews: {
    gap: 8,
    marginTop: 4,
  },
  reviewsHeading: {
    ...typography.captionBold,
    color: colors.textMuted,
    marginBottom: 2,
  },
  reviewItem: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewDate: {
    ...typography.tiny,
    color: colors.textDark,
  },
  reviewText: {
    ...typography.bodySm,
    color: colors.text,
    lineHeight: 18,
  },
});
