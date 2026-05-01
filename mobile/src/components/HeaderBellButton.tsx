import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';

interface UnreadCountResponse {
  unread_count: number;
}

export function HeaderBellButton() {
  const navigation = useNavigation<any>();
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await apiClient.get<UnreadCountResponse>('/notifications/unread-count');
        if (!cancelled) setUnread(res?.unread_count ?? 0);
      } catch {
        // silently ignore — endpoint may not exist yet
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => navigation.navigate('NotificationsTab' as never)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.text} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
});
