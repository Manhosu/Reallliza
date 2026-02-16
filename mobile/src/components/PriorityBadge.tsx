import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OsPriority, OS_PRIORITY_LABELS } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface PriorityBadgeProps {
  priority: OsPriority;
  size?: 'sm' | 'md';
}

const PRIORITY_COLORS: Record<OsPriority, string> = {
  [OsPriority.LOW]: colors.priorityLow,
  [OsPriority.MEDIUM]: colors.priorityMedium,
  [OsPriority.HIGH]: colors.priorityHigh,
  [OsPriority.URGENT]: colors.priorityUrgent,
};

const PRIORITY_ICONS: Record<OsPriority, string> = {
  [OsPriority.LOW]: '\u2193',    // down arrow
  [OsPriority.MEDIUM]: '\u2192', // right arrow
  [OsPriority.HIGH]: '\u2191',   // up arrow
  [OsPriority.URGENT]: '\u26A0', // warning
};

export function PriorityBadge({ priority, size = 'sm' }: PriorityBadgeProps) {
  const color = PRIORITY_COLORS[priority];
  const label = OS_PRIORITY_LABELS[priority];
  const icon = PRIORITY_ICONS[priority];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color + '20', borderColor: color + '40' },
        size === 'md' && styles.badgeMd,
      ]}
    >
      <Text style={[styles.icon, { color }]}>{icon}</Text>
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
  icon: {
    fontSize: 12,
    marginRight: 4,
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
