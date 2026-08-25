import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { useSchedulesRealtime } from '../lib/hooks/useSchedulesRealtime';
import {
  Schedule,
  ScheduleStatus,
  SCHEDULE_STATUS_LABELS,
} from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { OsStackParamList } from '../navigation/os-stack';

LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ],
  monthNamesShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt-br';

type NavigationProp = NativeStackNavigationProp<OsStackParamList>;
type ViewMode = 'semana' | 'quinzena' | 'mes';

const PERIOD_TABS: { key: ViewMode; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'quinzena', label: 'Quinzena' },
  { key: 'mes', label: 'Mês' },
];

// Cores por status, seguindo a sugestão da Jéssica (spec da nova Agenda,
// item 8): azul-Confirmado, amarelo/laranja-Pendente(Agendado), roxo-Em
// andamento, verde-Concluído, vermelho-Cancelado.
function getStatusColor(status: ScheduleStatus): string {
  switch (status) {
    case ScheduleStatus.SCHEDULED:
      return colors.warning;
    case ScheduleStatus.CONFIRMED:
      return colors.info;
    case ScheduleStatus.IN_PROGRESS:
      return colors.statusInProgress;
    case ScheduleStatus.COMPLETED:
      return colors.success;
    case ScheduleStatus.CANCELLED:
      return colors.danger;
    case ScheduleStatus.RESCHEDULED:
      return colors.primaryLight;
    default:
      return colors.textMuted;
  }
}

const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');

function formatAddress(order: Schedule['service_order']): string {
  if (!order) return 'Endereço não informado';
  return (
    [order.address_street, order.address_number, order.address_city]
      .filter(Boolean)
      .join(', ') || 'Endereço não informado'
  );
}

export function AgendaScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [viewMode, setViewMode] = useState<ViewMode>('semana');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showWeekExpanded, setShowWeekExpanded] = useState(false);

  const [periodSchedules, setPeriodSchedules] = useState<Schedule[]>([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Intervalo visível, de acordo com o modo — cada um navega de um jeito
  // diferente (semana: 7 dias, quinzena: 15 dias, mês: mês do calendário).
  const periodRange = useMemo(() => {
    if (viewMode === 'semana') {
      const start = startOfWeek(referenceDate, { weekStartsOn: 1 });
      return { start, end: addDays(start, 6) };
    }
    if (viewMode === 'quinzena') {
      return { start: referenceDate, end: addDays(referenceDate, 14) };
    }
    const start = startOfMonth(referenceDate);
    return { start, end: endOfMonth(referenceDate) };
  }, [viewMode, referenceDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(
      viewMode === 'semana' ? referenceDate : selectedDate,
      { weekStartsOn: 1 },
    );
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [viewMode, referenceDate, selectedDate]);

  const quinzenaDays = useMemo(
    () => Array.from({ length: 15 }, (_, i) => addDays(referenceDate, i)),
    [referenceDate],
  );

  const fetchPeriod = useCallback(async () => {
    try {
      const data = await apiClient.get<Schedule[]>('/schedules/my', {
        date_from: dateKey(periodRange.start),
        date_to: dateKey(periodRange.end),
      });
      setPeriodSchedules(data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      Alert.alert('Erro', 'Não foi possível carregar a agenda.');
    }
  }, [periodRange]);

  // Próximos Agendamentos independe do período navegado (spec item 10) —
  // busca à parte, sempre a partir de hoje.
  const fetchUpcoming = useCallback(async () => {
    try {
      const today = new Date();
      const data = await apiClient.get<Schedule[]>('/schedules/my', {
        date_from: dateKey(today),
        date_to: dateKey(addDays(today, 60)),
      });
      setUpcomingSchedules(
        data
          .filter(s => s.status !== ScheduleStatus.CANCELLED)
          .slice(0, 5),
      );
    } catch (error) {
      console.error('Error fetching upcoming schedules:', error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchPeriod(), fetchUpcoming()]);
  }, [fetchPeriod, fetchUpcoming]);

  useEffect(() => {
    setIsLoading(true);
    fetchPeriod().finally(() => setIsLoading(false));
  }, [fetchPeriod]);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  // Re-busca toda vez que a tela ganha foco (trocar de aba e voltar) —
  // sem isso, agendamentos criados depois do primeiro mount não aparecem
  // até fechar/reabrir o app.
  useFocusEffect(
    useCallback(() => {
      fetchAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchAll]),
  );

  useSchedulesRealtime({ onChange: fetchAll });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  };

  // Bug Jessica 16/06: new Date("2026-06-17") era interpretado como UTC
  // midnight e isSameDay caía 1 dia atrás. Comparamos por string
  // yyyy-MM-dd, gerada localmente — bate exato com s.date do banco.
  const selectedDateStr = dateKey(selectedDate);
  const filteredSchedules = periodSchedules.filter(
    s => s.date === selectedDateStr,
  );

  // Contagem por dia — alimenta os indicadores de ponto (semana/quinzena)
  // e os marcadores do calendário mensal.
  const countByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of periodSchedules) {
      map[s.date] = (map[s.date] ?? 0) + 1;
    }
    return map;
  }, [periodSchedules]);

  const weekGrouped = useMemo(() => {
    const groups: { date: Date; items: Schedule[] }[] = weekDays.map(d => ({
      date: d,
      items: periodSchedules
        .filter(s => s.date === dateKey(d))
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    }));
    return groups.filter(g => g.items.length > 0);
  }, [weekDays, periodSchedules]);

  function navigatePeriod(direction: number) {
    if (viewMode === 'semana') {
      setReferenceDate(prev => addDays(prev, direction * 7));
    } else if (viewMode === 'quinzena') {
      setReferenceDate(prev => addDays(prev, direction * 15));
    } else {
      setReferenceDate(prev =>
        direction > 0 ? addMonths(prev, 1) : subMonths(prev, 1),
      );
    }
  }

  function goToday() {
    const today = new Date();
    setReferenceDate(today);
    setSelectedDate(today);
  }

  function periodLabel(): string {
    if (viewMode === 'semana') {
      return `${format(periodRange.start, 'dd MMM', { locale: ptBR })} - ${format(
        periodRange.end,
        'dd MMM yyyy',
        { locale: ptBR },
      )}`;
    }
    if (viewMode === 'quinzena') {
      return `${format(periodRange.start, 'dd MMM', { locale: ptBR })} - ${format(
        periodRange.end,
        'dd MMM yyyy',
        { locale: ptBR },
      )}`;
    }
    return format(referenceDate, 'MMMM yyyy', { locale: ptBR });
  }

  function renderDots(count: number, size = 4) {
    const n = Math.min(count, 3);
    if (n === 0) return null;
    return (
      <View style={styles.dotsRow}>
        {Array.from({ length: n }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ))}
      </View>
    );
  }

  const renderScheduleCard = (item: Schedule) => {
    const statusColor = getStatusColor(item.status);
    return (
      <TouchableOpacity
        key={item.id}
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
              {item.start_time ? item.start_time.substring(0, 5) : '--:--'}
              {' - '}
              {item.end_time ? item.end_time.substring(0, 5) : '--:--'}
            </Text>
          </View>

          {item.service_order && (
            <>
              <Text style={styles.scheduleTitle} numberOfLines={1}>
                {item.service_order.title}
              </Text>
              {!!item.service_order.client_name && (
                <Text style={styles.clientText} numberOfLines={1}>
                  Cliente: {item.service_order.client_name}
                </Text>
              )}
              <View style={styles.addressRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.addressText} numberOfLines={1}>
                  {formatAddress(item.service_order)}
                </Text>
              </View>
            </>
          )}

          <View style={styles.statusRow}>
            <View
              style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}
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

  const renderUpcomingRow = (item: Schedule) => {
    const statusColor = getStatusColor(item.status);
    const d = parseISO(item.date);
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.upcomingRow}
        onPress={() => {
          if (item.service_order_id) {
            navigation.navigate('OsDetail', { id: item.service_order_id });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.upcomingLeft}>
          <View style={[styles.upcomingDot, { backgroundColor: statusColor }]} />
          <View>
            <Text style={styles.upcomingDate}>
              {format(d, 'EEE, dd MMM', { locale: ptBR })}
              {item.start_time ? ` - ${item.start_time.substring(0, 5)}` : ''}
            </Text>
            <Text style={styles.upcomingTitle} numberOfLines={1}>
              {item.service_order?.title ?? 'Serviço'}
            </Text>
            {!!item.service_order?.client_name && (
              <Text style={styles.upcomingClient} numberOfLines={1}>
                Cliente: {item.service_order.client_name}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {SCHEDULE_STATUS_LABELS[item.status]}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ---- Cabeçalho da FlatList: abas de período, navegação, tira de dias /
  // quinzena / calendário mensal, e o cabeçalho do dia selecionado.
  const ListHeader = () => (
    <View>
      <View style={styles.periodTabs}>
        {PERIOD_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.periodTab,
              viewMode === tab.key && styles.periodTabActive,
            ]}
            onPress={() => setViewMode(tab.key)}
          >
            <Text
              style={[
                styles.periodTabText,
                viewMode === tab.key && styles.periodTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.todayButton} onPress={goToday}>
          <Text style={styles.todayButtonText}>Hoje</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.periodNav}>
        <TouchableOpacity onPress={() => navigatePeriod(-1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.periodLabel}>{periodLabel()}</Text>
        <TouchableOpacity onPress={() => navigatePeriod(1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {viewMode === 'semana' && (
        <View style={styles.daySelector}>
          {weekDays.map(day => {
            const isSelected = isSameDay(day, selectedDate);
            const today = isToday(day);
            const count = countByDate[dateKey(day)] ?? 0;
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
                <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
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
                {renderDots(count)}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {viewMode === 'quinzena' && (
        <>
          <Text style={styles.quinzenaSummary}>
            {periodSchedules.length} agendamento(s) nos próximos 15 dias
          </Text>
          <View style={styles.quinzenaGrid}>
            {quinzenaDays.map(day => {
              const isSelected = isSameDay(day, selectedDate);
              const today = isToday(day);
              const count = countByDate[dateKey(day)] ?? 0;
              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={[
                    styles.quinzenaCell,
                    isSelected && styles.dayButtonSelected,
                    today && !isSelected && styles.dayButtonToday,
                    count > 0 && !isSelected && styles.quinzenaCellHasEvent,
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
                  {renderDots(count, 3)}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {viewMode === 'mes' && (
        <Calendar
          key={format(referenceDate, 'yyyy-MM')}
          current={dateKey(referenceDate)}
          hideArrows
          firstDay={1}
          onDayPress={(d: DateData) => setSelectedDate(parseISO(d.dateString))}
          renderHeader={() => null}
          markingType="multi-dot"
          markedDates={Object.fromEntries(
            Object.entries(countByDate).map(([date, count]) => [
              date,
              {
                dots: Array.from({ length: Math.min(count, 3) }).map(() => ({
                  color: colors.primary,
                })),
                selected: date === selectedDateStr,
                selectedColor: colors.primary + '30',
              },
            ]),
          )}
          theme={{
            calendarBackground: colors.background,
            dayTextColor: colors.text,
            monthTextColor: colors.text,
            textDisabledColor: colors.textDark,
            todayTextColor: colors.primary,
            selectedDayBackgroundColor: colors.primary + '30',
            selectedDayTextColor: colors.text,
            arrowColor: colors.text,
            textSectionTitleColor: colors.textMuted,
            dotColor: colors.primary,
          }}
          style={styles.monthCalendar}
        />
      )}

      <View style={styles.dateHeader}>
        <Text style={styles.dateHeaderText}>
          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </Text>
        <Text style={styles.scheduleCount}>
          {filteredSchedules.length} agendamento(s)
        </Text>
      </View>
    </View>
  );

  // ---- Rodapé: "Ver todos da semana" (só no modo semana) + Próximos
  // Agendamentos (sempre visível, independente do período navegado).
  const ListFooter = () => (
    <View>
      {viewMode === 'semana' && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.weekToggle}
            onPress={() => setShowWeekExpanded(v => !v)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.weekToggleText}>
              Ver todos os agendamentos da semana
            </Text>
            <Ionicons
              name={showWeekExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>
          {showWeekExpanded && (
            <View style={styles.weekExpanded}>
              {weekGrouped.length === 0 ? (
                <Text style={styles.emptyInlineText}>
                  Nenhum agendamento nesta semana.
                </Text>
              ) : (
                weekGrouped.map(group => (
                  <View key={dateKey(group.date)} style={styles.weekGroup}>
                    <Text style={styles.weekGroupDate}>
                      {format(group.date, "EEEE, dd/MM", { locale: ptBR })}
                    </Text>
                    {group.items.map(item => (
                      <View key={item.id} style={styles.weekGroupItem}>
                        <Text style={styles.weekGroupTime}>
                          {item.start_time ? item.start_time.substring(0, 5) : '--:--'}
                        </Text>
                        <Text style={styles.weekGroupTitle} numberOfLines={1}>
                          {item.service_order?.title ?? 'Serviço'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Próximos agendamentos</Text>
        </View>
        {upcomingSchedules.length === 0 ? (
          <Text style={styles.emptyInlineText}>Nada agendado nos próximos dias.</Text>
        ) : (
          upcomingSchedules.map(renderUpcomingRow)
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredSchedules}
            keyExtractor={item => item.id}
            renderItem={({ item }) => renderScheduleCard(item)}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            contentContainerStyle={styles.listContent}
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
                message="Não há agendamentos para este dia."
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  periodTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  periodTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  periodTabActive: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  periodTabTextActive: {
    color: colors.black,
  },
  todayButton: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  periodNav: {
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
  periodLabel: {
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
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    height: 6,
  },
  dot: {
    backgroundColor: colors.primary,
  },
  quinzenaSummary: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  quinzenaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quinzenaCell: {
    width: '18%',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  quinzenaCellHasEvent: {
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  monthCalendar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
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
  scheduleCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
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
  clientText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  weekToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekToggleText: {
    ...typography.bodySmBold,
    color: colors.primary,
    flex: 1,
  },
  weekExpanded: {
    marginTop: 10,
    gap: 12,
  },
  weekGroup: {
    gap: 4,
  },
  weekGroupDate: {
    ...typography.captionBold,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  weekGroupItem: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  weekGroupTime: {
    ...typography.caption,
    color: colors.primary,
    width: 44,
  },
  weekGroupTitle: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  emptyInlineText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  upcomingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  upcomingDate: {
    ...typography.captionBold,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  upcomingTitle: {
    ...typography.bodySmBold,
    color: colors.text,
    marginTop: 2,
  },
  upcomingClient: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
});
