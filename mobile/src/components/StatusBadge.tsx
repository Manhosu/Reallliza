import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OsStatus, OS_STATUS_LABELS } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface StatusBadgeProps {
  status: OsStatus;
  size?: 'sm' | 'md';
}

const STATUS_COLORS: Record<OsStatus, string> = {
  [OsStatus.DRAFT]: colors.statusDraft,
  [OsStatus.PENDING]: colors.statusPending,
  [OsStatus.ASSIGNED]: colors.statusAssigned,
  [OsStatus.IN_PROGRESS]: colors.statusInProgress,
  [OsStatus.PAUSED]: colors.statusPaused,
  [OsStatus.COMPLETED]: colors.statusCompleted,
  [OsStatus.INVOICED]: colors.statusInvoiced,
  [OsStatus.CANCELLED]: colors.statusCancelled,
  [OsStatus.REJECTED]: colors.statusRejected,
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status];
  const label = OS_STATUS_LABELS[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color + '20', borderColor: color + '40' },
        size === 'md' && styles.badgeMd,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[
          size === 'sm' ? styles.textSm : styles.textMd,
          { color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  textSm: {
    ...typography.caption,
    fontWeight: '600',
  },
  textMd: {
    ...typography.bodySm,
    fontWeight: '600',
  },
});
