import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import {
  Schedule,
  ScheduleStatus,
  SCHEDULE_STATUS_LABELS,
} from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

type NavigationProp = NativeStackNavigationProp<OsStackParamList>;

export function AgendaScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(weekStart, i),
  );

  const fetchSchedules = useCallback(async () => {
    try {
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(addDays(weekStart, 6), 'yyyy-MM-dd');

      const data = await apiClient.get<Schedule[]>('/schedules/my', {
        start_date: startDate,
        end_date: endDate,
      });
      setSchedules(data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  }, [weekStart]);

  useEffect(() => {
    setIsLoading(true);
    fetchSchedules().finally(() => setIsLoading(false));
  }, [fetchSchedules]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSchedules();
    setIsRefreshing(false);
  };

  const navigateWeek = (direction: number) => {
    setWeekStart(prev => addDays(prev, direction * 7));
  };

  const filteredSchedules = schedules.filter(s => {
    try {
      return isSameDay(new Date(s.scheduled_date), selectedDate);
    } catch {
      return false;
    }
  });

  const getStatusColor = (status: ScheduleStatus): string => {
    switch (status) {
      case ScheduleStatus.SCHEDULED:
        return colors.info;
      case ScheduleStatus.CONFIRMED:
        return colors.primary;
      case ScheduleStatus.IN_PROGRESS:
        return colors.statusInProgress;
      case ScheduleStatus.COMPLETED:
        return colors.success;
      case ScheduleStatus.CANCELLED:
        return colors.danger;
      case ScheduleStatus.RESCHEDULED:
        return colors.warning;
      default:
        return colors.textMuted;
    }
  };

  const renderSchedule = ({ item }: { item: Schedule }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <TouchableOpacity
        style={styles.scheduleCard}
        onPress={() => {
          if (item.service_order_id) {
            navigation.navigate('OsDetail', { id: item.service_order_id });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />
        <View style={styles.cardContent}>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.timeText}>
              {item.scheduled_start_time
                ? item.scheduled_start_time.substring(0, 5)
                : '--:--'}
              {' - '}
              {item.scheduled_end_time
                ? item.scheduled_end_time.substring(0, 5)
                : '--:--'}
            </Text>
          </View>

          {item.service_order && (
            <>
              <Text style={styles.scheduleTitle} numberOfLines={1}>
                {item.service_order.title}
              </Text>
              <View style={styles.addressRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.addressText} numberOfLines={1}>
                  {[
                    item.service_order.address_street,
                    item.service_order.address_number,
                    item.service_order.address_city,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Endereco nao informado'}
                </Text>
              </View>
            </>
          )}

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColor + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {SCHEDULE_STATUS_LABELS[item.status]}
              </Text>
            </View>
          </View>

          {item.notes && (
            <Text style={styles.notesText} numberOfLines={2}>
              {item.notes}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <View style={styles.container}>
      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => navigateWeek(-1)}
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.weekLabel}>
          {format(weekStart, "dd MMM", { locale: ptBR })} -{' '}
          {format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}
        </Text>

        <TouchableOpacity
          onPress={() => navigateWeek(1)}
          style={styles.navButton}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const today = isToday(day);

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                styles.dayButton,
                isSelected && styles.dayButtonSelected,
                today && !isSelected && styles.dayButtonToday,
              ]}
              onPress={() => setSelectedDate(day)}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected && styles.dayNameSelected,
                ]}
              >
                {format(day, 'EEE', { locale: ptBR }).substring(0, 3).toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isSelected && styles.dayNumberSelected,
                  today && !isSelected && styles.dayNumberToday,
                ]}
              >
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected Date Header */}
      <View style={styles.dateHeader}>
        <Text style={styles.dateHeaderText}>
          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </Text>
        <Text style={styles.scheduleCount}>
          {filteredSchedules.length} agendamento(s)
        </Text>
      </View>

      {/* Schedules List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredSchedules}
          keyExtractor={item => item.id}
          renderItem={renderSchedule}
          contentContainerStyle={
            filteredSchedules.length === 0
              ? styles.emptyContainer
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.card}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title="Sem agendamentos"
              message="Nao ha agendamentos para este dia."
            />
          }
        />
      )}
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navButton: {
    padding: 4,
  },
  weekLabel: {
    ...typography.bodySmBold,
    color: colors.text,
    textTransform: 'capitalize',
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonToday: {
    backgroundColor: colors.primary + '15',
  },
  dayName: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayNameSelected: {
    color: colors.black,
  },
  dayNumber: {
    ...typography.bodyBold,
    color: colors.text,
  },
  dayNumberSelected: {
    color: colors.black,
  },
  dayNumberToday: {
    color: colors.primary,
  },
  dateHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateHeaderText: {
    ...typography.bodyBold,
    color: colors.text,
    textTransform: 'capitalize',
  },
  scheduleCount: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  listContent: {
    padding: 16,
  },
  scheduleCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardAccent: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    ...typography.bodySmBold,
    color: colors.primary,
  },
  scheduleTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    ...typography.captionBold,
  },
  notesText: {
    ...typography.caption,
    color: colors.textDark,
    fontStyle: 'italic',
  },
});
