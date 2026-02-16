import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../lib/sync-manager';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function SyncIndicator() {
  const isSyncing = useSyncStore(s => s.isSyncing);
  const pendingCount = useSyncStore(s => s.pendingCount);
  const isOnline = useSyncStore(s => s.isOnline);
  const conflictCount = useSyncStore(s => s.conflictCount);
  const resetConflicts = useSyncStore(s => s.resetConflicts);
  const [showSuccess, setShowSuccess] = useState(false);
  const [prevPending, setPrevPending] = useState(pendingCount);

  // Auto-dismiss conflict indicator after 5 seconds
  useEffect(() => {
    if (conflictCount > 0) {
      const timer = setTimeout(() => resetConflicts(), 5000);
      return () => clearTimeout(timer);
    }
  }, [conflictCount, resetConflicts]);

  // Show brief success state when pending goes from >0 to 0
  useEffect(() => {
    if (prevPending > 0 && pendingCount === 0 && isOnline) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
    setPrevPending(pendingCount);
  }, [pendingCount, isOnline, prevPending]);

  if (!isOnline) return null; // OfflineBanner handles offline state

  if (isSyncing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.text}>Sincronizando...</Text>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={[styles.container, styles.warningContainer]}>
        <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
        <Text style={[styles.text, styles.warningText]}>
          {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}
        </Text>
      </View>
    );
  }

  if (showSuccess) {
    return (
      <View style={[styles.container, styles.successContainer]}>
        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
        <Text style={[styles.text, styles.successText]}>Sincronizado</Text>
      </View>
    );
  }

  if (conflictCount > 0) {
    return (
      <View style={[styles.container, styles.conflictContainer]}>
        <Ionicons name="alert-circle-outline" size={14} color="#FCD34D" />
        <Text style={[styles.text, styles.conflictText]}>
          {conflictCount} alteracao(oes) descartada(s)
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  warningContainer: {
    backgroundColor: colors.warning + '15',
  },
  successContainer: {
    backgroundColor: colors.success + '15',
  },
  conflictContainer: {
    backgroundColor: '#78350F' + '30',
  },
  text: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  warningText: {
    color: colors.warning,
  },
  successText: {
    color: colors.success,
  },
  conflictText: {
    color: '#FCD34D',
  },
});
