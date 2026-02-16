import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../lib/sync-manager';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function OfflineBanner() {
  const isOnline = useSyncStore(s => s.isOnline);
  const pendingCount = useSyncStore(s => s.pendingCount);

  if (isOnline) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.black} />
        <Text style={styles.text}>Sem conexao - Modo offline</Text>
      </View>
      {pendingCount > 0 && (
        <Text style={styles.pendingText}>
          {pendingCount} {pendingCount === 1 ? 'acao pendente' : 'acoes pendentes'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    ...typography.captionBold,
    color: colors.black,
  },
  pendingText: {
    ...typography.tiny,
    color: colors.black,
    marginTop: 2,
    opacity: 0.8,
  },
});
