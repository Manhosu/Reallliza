import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { apiClient } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  deadlineSituation,
  daysInCustody,
  DEADLINE_LABEL,
  DEADLINE_COLOR,
  requestStatusLabel,
  requestStatusColor,
  OPEN_REQUEST_STATUSES,
  EVENT_LABEL,
} from '../lib/tools-helpers';
import { useToolsRealtime } from '../lib/hooks/useToolsRealtime';

/**
 * Módulo Ferramentas do app do técnico.
 *
 * Reestruturado conforme o mockup de 06/08: três abas na ordem Pedidos →
 * Custódia → Histórico, que é o fluxo natural (solicitar, receber, usar,
 * consultar). Antes a ordem era Custódia primeiro.
 */

type Tab = 'requests' | 'custody' | 'history';

interface ToolRef {
  id: string;
  name: string;
  photo_url?: string | null;
  serial_number?: string | null;
}

interface UnitRef {
  id: string;
  code: string;
  patrimony_code?: string | null;
}

interface OsRef {
  id: string;
  order_number: string;
  title?: string | null;
}

interface ToolRequest {
  id: string;
  tool_id: string | null;
  unit_id: string | null;
  tool_name: string;
  quantity: number;
  justification: string | null;
  almoxarife_notes?: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  needed_at?: string | null;
  expected_return_at?: string | null;
  service_order_id?: string | null;
  unit?: UnitRef | null;
  service_order?: OsRef | null;
}

interface Custody {
  id: string;
  tool_id: string;
  unit_id: string | null;
  checked_out_at: string;
  checked_in_at: string | null;
  expected_return_at: string | null;
  return_requested_at: string | null;
  damage_reported_at: string | null;
  damage_description: string | null;
  has_pending_extension?: boolean;
  condition_out?: string | null;
  notes_out?: string | null;
  tool?: ToolRef | null;
  unit?: UnitRef | null;
  service_order?: OsRef | null;
}

interface HistoryEvent {
  id: string;
  event_type: string;
  created_at: string;
  notes: string | null;
  tool?: ToolRef | null;
  unit?: UnitRef | null;
  almoxarife?: { id: string; full_name: string } | null;
  service_order?: OsRef | null;
}

const fmt = (v?: string | null, pattern = 'dd/MM/yyyy') =>
  v ? format(new Date(v), pattern) : '—';

export function ToolsScreen() {
  const navigation = useNavigation<never>();
  const [tab, setTab] = useState<Tab>('requests'); // Pedidos é a aba inicial
  const [requests, setRequests] = useState<ToolRequest[]>([]);
  const [custodies, setCustodies] = useState<Custody[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detail, setDetail] = useState<Custody | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // Cada chamada com catch próprio: uma falha não pode zerar as outras abas.
    const [r, c, h] = await Promise.all([
      apiClient
        .get<{ requests: ToolRequest[] } | ToolRequest[]>('/tools/requests?status=all')
        .then((res) => (Array.isArray(res) ? res : (res?.requests ?? [])))
        .catch(() => [] as ToolRequest[]),
      apiClient.get<Custody[]>('/tools/my-custody').catch(() => [] as Custody[]),
      apiClient.get<HistoryEvent[]>('/tools/my-history').catch(() => [] as HistoryEvent[]),
    ]);
    setRequests(r);
    setCustodies(c);
    setHistory(h);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
  }, [fetchData]);

  // "Toda movimentação realizada na plataforma do almoxarifado deverá refletir
  // automaticamente no aplicativo" (spec, regra 10 do app).
  useToolsRealtime({ onRelevantChange: fetchData });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  // A aba Pedidos mostra só o que o técnico ainda não recebeu.
  const openRequests = useMemo(
    () => requests.filter((r) => OPEN_REQUEST_STATUSES.includes(r.status)),
    [requests]
  );

  const summary = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      ready: requests.filter((r) => r.status === 'awaiting_pickup').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    }),
    [requests]
  );

  const custodySummary = useMemo(() => {
    const situations = custodies.map((c) => deadlineSituation(c));
    const next = custodies
      .filter((c) => c.expected_return_at)
      .sort(
        (a, b) =>
          new Date(a.expected_return_at!).getTime() -
          new Date(b.expected_return_at!).getTime()
      )[0];
    return {
      onTime: situations.filter((s) => s === 'on_time' || s === 'due_today').length,
      overdue: situations.filter((s) => s === 'overdue').length,
      next: next?.expected_return_at ?? null,
    };
  }, [custodies]);

  const filteredHistory = useMemo(
    () => (historyFilter ? history.filter((h) => h.tool?.id === historyFilter) : history),
    [history, historyFilter]
  );

  const historyTools = useMemo(() => {
    const map = new Map<string, string>();
    history.forEach((h) => {
      if (h.tool?.id) map.set(h.tool.id, h.tool.name);
    });
    return Array.from(map.entries());
  }, [history]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      Alert.alert('Pronto', ok);
      await fetchData();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha na operação');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Abas: Pedidos → Custódia → Histórico */}
      <View style={styles.tabBar}>
        {([
          ['requests', 'Pedidos', 'clipboard-outline', openRequests.length],
          ['custody', 'Custódia', 'briefcase-outline', custodies.length],
          ['history', 'Histórico', 'time-outline', 0],
        ] as const).map(([key, label, icon, badge]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key as Tab)}
          >
            <Ionicons
              name={icon as never}
              size={16}
              color={tab === key ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
            {badge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {tab === 'requests' && (
            <>
              <SummaryCard title="Resumo dos pedidos" subtitle="Acompanhe suas solicitações">
                <View style={styles.chipRow}>
                  <Chip label="Em análise" value={summary.pending} tint={colors.info} />
                  <Chip label="Aprovados" value={summary.approved} tint={colors.success} />
                  <Chip label="Prontos p/ retirada" value={summary.ready} tint={colors.warning} />
                  <Chip label="Recusados" value={summary.rejected} tint={colors.danger} />
                </View>
              </SummaryCard>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => (navigation as never as { navigate: (s: string) => void }).navigate('ToolRequest')}
              >
                <Ionicons name="add" size={18} color={colors.background} />
                <Text style={styles.primaryButtonText}>Solicitar ferramenta</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Minhas solicitações</Text>

              {openRequests.length === 0 ? (
                <EmptyState
                  icon="clipboard-outline"
                  title="Nenhuma solicitação em aberto"
                  message="Toque em Solicitar ferramenta para pedir ao almoxarifado."
                />
              ) : (
                openRequests.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    onCancel={
                      r.status === 'pending'
                        ? () =>
                            Alert.alert('Cancelar pedido', `Cancelar "${r.tool_name}"?`, [
                              { text: 'Não', style: 'cancel' },
                              {
                                text: 'Sim',
                                onPress: () =>
                                  act(
                                    () =>
                                      apiClient.patch(`/tools/requests/${r.id}`, {
                                        action: 'cancel',
                                      }),
                                    'Pedido cancelado'
                                  ),
                              },
                            ])
                        : undefined
                    }
                  />
                ))
              )}
            </>
          )}

          {tab === 'custody' && (
            <>
              <SummaryCard
                title="Resumo da custódia"
                subtitle={`Você possui ${custodies.length} ferramenta(s) em custódia`}
              >
                <View style={styles.chipRow}>
                  <Chip label="Dentro do prazo" value={custodySummary.onTime} tint={colors.success} />
                  <Chip label="Atrasada" value={custodySummary.overdue} tint={colors.danger} />
                  <Chip
                    label="Próxima devolução"
                    value={custodySummary.next ? fmt(custodySummary.next, 'dd/MM') : '—'}
                    tint={colors.info}
                  />
                </View>
              </SummaryCard>

              <Text style={styles.sectionTitle}>Minhas ferramentas em custódia</Text>

              {custodies.length === 0 ? (
                <EmptyState
                  icon="briefcase-outline"
                  title="Nenhuma ferramenta em custódia"
                  message="Quando o almoxarifado confirmar uma entrega, ela aparece aqui."
                />
              ) : (
                custodies.map((c) => (
                  <CustodyCard
                    key={c.id}
                    custody={c}
                    onDetails={() => setDetail(c)}
                    onRequestReturn={() =>
                      Alert.alert(
                        'Solicitar devolução',
                        'O almoxarifado será avisado. A ferramenta continua com você até a entrega física ser confirmada.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Solicitar',
                            onPress: () =>
                              act(
                                () =>
                                  apiClient.post(
                                    `/tools/custody/${c.id}/request-return`,
                                    {}
                                  ),
                                'Devolução solicitada'
                              ),
                          },
                        ]
                      )
                    }
                  />
                ))
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <SummaryCard
                title="Meu histórico"
                subtitle="Todas as ferramentas que você já utilizou"
              >
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    <FilterChip
                      label="Todos"
                      active={!historyFilter}
                      onPress={() => setHistoryFilter(null)}
                    />
                    {historyTools.map(([id, name]) => (
                      <FilterChip
                        key={id}
                        label={name}
                        active={historyFilter === id}
                        onPress={() => setHistoryFilter(id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </SummaryCard>

              {filteredHistory.length === 0 ? (
                <EmptyState
                  icon="time-outline"
                  title="Sem histórico"
                  message="Suas retiradas e devoluções aparecem aqui."
                />
              ) : (
                <View style={styles.timeline}>
                  {filteredHistory.map((e) => (
                    <TimelineRow key={e.id} event={e} />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {detail && (
        <CustodyDetailModal
          custody={detail}
          onClose={() => setDetail(null)}
          onAction={act}
          onDone={fetchData}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================
// Peças
// ============================================================

function SummaryCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{title}</Text>
      {subtitle && <Text style={styles.summarySubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function Chip({
  label,
  value,
  tint,
}: {
  label: string;
  value: number | string;
  tint: string;
}) {
  return (
    <View style={[styles.chip, { borderColor: tint + '55', backgroundColor: tint + '14' }]}>
      <Text style={[styles.chipValue, { color: tint }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ToolThumb({ uri }: { uri?: string | null }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.thumb} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder]}>
      <Ionicons name="hammer-outline" size={22} color={colors.textMuted} />
    </View>
  );
}

function RequestCard({
  request,
  onCancel,
}: {
  request: ToolRequest;
  onCancel?: () => void;
}) {
  const tint = requestStatusColor(request.status);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ToolThumb uri={undefined} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>
            {request.quantity > 1 ? `${request.quantity}× ` : ''}
            {request.tool_name}
          </Text>
          {request.unit?.code && <Text style={styles.cardCode}>{request.unit.code}</Text>}
          <View style={[styles.statusPill, { backgroundColor: tint + '20' }]}>
            <Text style={[styles.statusPillText, { color: tint }]}>
              {requestStatusLabel(request.status)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <Meta label="Solicitado em" value={fmt(request.created_at, 'dd/MM/yyyy HH:mm')} />
        <Meta label="Retirada prevista" value={fmt(request.needed_at)} />
        <Meta label="Devolução prevista" value={fmt(request.expected_return_at)} />
      </View>

      {request.service_order?.order_number && (
        <Text style={styles.osLine}>
          Obra/OS: OS-{request.service_order.order_number}
          {request.service_order.title ? ` — ${request.service_order.title}` : ''}
        </Text>
      )}

      {request.almoxarife_notes && (
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.noticeText}>{request.almoxarife_notes}</Text>
        </View>
      )}

      {request.status === 'awaiting_pickup' && (
        <View style={styles.noticeBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.noticeText}>
            Sua ferramenta está pronta para retirada no almoxarifado.
          </Text>
        </View>
      )}

      {request.rejection_reason && (
        <Text style={styles.rejectionText}>Motivo: {request.rejection_reason}</Text>
      )}

      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Cancelar pedido</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CustodyCard({
  custody,
  onDetails,
  onRequestReturn,
}: {
  custody: Custody;
  onDetails: () => void;
  onRequestReturn: () => void;
}) {
  const situation = deadlineSituation(custody);
  const tint = DEADLINE_COLOR[situation];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ToolThumb uri={custody.tool?.photo_url} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{custody.tool?.name ?? 'Ferramenta'}</Text>
          {custody.unit?.code && <Text style={styles.cardCode}>{custody.unit.code}</Text>}
        </View>
        <View style={[styles.statusPill, { backgroundColor: tint + '20' }]}>
          <Text style={[styles.statusPillText, { color: tint }]}>
            {DEADLINE_LABEL[situation]}
          </Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <Meta label="Retirada" value={fmt(custody.checked_out_at, 'dd/MM/yyyy HH:mm')} />
        <Meta label="Devolução prevista" value={fmt(custody.expected_return_at)} />
        <Meta
          label="Dias em custódia"
          value={`${daysInCustody(custody.checked_out_at)} dia(s)`}
        />
      </View>

      {custody.service_order?.order_number && (
        <Text style={styles.osLine}>
          Obra/OS: OS-{custody.service_order.order_number}
          {custody.service_order.title ? ` — ${custody.service_order.title}` : ''}
        </Text>
      )}

      {custody.damage_reported_at && (
        <View style={styles.noticeBox}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <Text style={[styles.noticeText, { color: colors.danger }]}>
            Dano comunicado: {custody.damage_description}
          </Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onDetails}>
          <Text style={styles.secondaryButtonText}>Detalhes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButtonSmall,
            !!custody.return_requested_at && styles.buttonDisabled,
          ]}
          onPress={onRequestReturn}
          disabled={!!custody.return_requested_at}
        >
          <Text style={styles.primaryButtonSmallText}>
            {custody.return_requested_at ? 'Devolução solicitada' : 'Solicitar devolução'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function TimelineRow({ event }: { event: HistoryEvent }) {
  const isReturn = event.event_type === 'recebimento';
  const tint = isReturn ? colors.info : colors.success;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <Text style={styles.timelineDate}>{fmt(event.created_at)}</Text>
        <Text style={styles.timelineTime}>{fmt(event.created_at, 'HH:mm')}</Text>
      </View>
      <View style={styles.timelineDotColumn}>
        <View style={[styles.timelineDot, { backgroundColor: tint }]} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.timelineCard}>
        <View style={styles.timelineCardHeader}>
          <ToolThumb uri={event.tool?.photo_url} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{event.tool?.name ?? 'Ferramenta'}</Text>
            {event.unit?.code && <Text style={styles.cardCode}>{event.unit.code}</Text>}
            <Text style={[styles.timelineType, { color: tint }]}>
              {EVENT_LABEL[event.event_type] ?? event.event_type}
            </Text>
            {event.almoxarife?.full_name && (
              <Text style={styles.timelineBy}>
                {isReturn ? 'Recebida por' : 'Entregue por'}: {event.almoxarife.full_name}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// Detalhe da custódia (spec seção 4 do app)
// ============================================================

function CustodyDetailModal({
  custody,
  onClose,
  onAction,
  onDone,
}: {
  custody: Custody;
  onClose: () => void;
  onAction: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'view' | 'damage' | 'extension'>('view');
  const [damage, setDamage] = useState('');
  const [newDate, setNewDate] = useState('');
  const [justification, setJustification] = useState('');
  const situation = deadlineSituation(custody);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalSheet}
        >
          <View style={styles.modalHandle} />
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={styles.cardHeader}>
              <ToolThumb uri={custody.tool?.photo_url} />
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>{custody.tool?.name ?? 'Ferramenta'}</Text>
                {custody.unit?.code && (
                  <Text style={styles.cardCode}>{custody.unit.code}</Text>
                )}
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: DEADLINE_COLOR[situation] + '20' },
                  ]}
                >
                  <Text
                    style={[styles.statusPillText, { color: DEADLINE_COLOR[situation] }]}
                  >
                    {DEADLINE_LABEL[situation]}
                  </Text>
                </View>
              </View>
            </View>

            {mode === 'view' && (
              <>
                <View style={styles.detailList}>
                  <DetailRow
                    label="Entrega"
                    value={fmt(custody.checked_out_at, 'dd/MM/yyyy HH:mm')}
                  />
                  <DetailRow
                    label="Devolução prevista"
                    value={fmt(custody.expected_return_at)}
                  />
                  <DetailRow
                    label="Dias em custódia"
                    value={`${daysInCustody(custody.checked_out_at)} dia(s)`}
                  />
                  <DetailRow
                    label="Obra/OS"
                    value={
                      custody.service_order?.order_number
                        ? `OS-${custody.service_order.order_number}`
                        : '—'
                    }
                  />
                  <DetailRow
                    label="Condição na entrega"
                    value={custody.condition_out ?? '—'}
                  />
                  {custody.notes_out && (
                    <DetailRow label="Observações" value={custody.notes_out} />
                  )}
                </View>

                <TouchableOpacity
                  style={styles.secondaryButtonFull}
                  onPress={() => setMode('damage')}
                >
                  <Ionicons name="warning-outline" size={16} color={colors.danger} />
                  <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>
                    Comunicar dano
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButtonFull}
                  onPress={() => setMode('extension')}
                  disabled={custody.has_pending_extension}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.warning} />
                  <Text style={[styles.secondaryButtonText, { color: colors.warning }]}>
                    {custody.has_pending_extension
                      ? 'Prorrogação em análise'
                      : 'Solicitar prorrogação'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'damage' && (
              <View style={styles.formBlock}>
                <Text style={styles.formLabel}>Descreva o dano</Text>
                <TextInput
                  value={damage}
                  onChangeText={setDamage}
                  multiline
                  numberOfLines={4}
                  style={styles.textArea}
                  placeholder="O que aconteceu com a ferramenta?"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={async () => {
                    if (!damage.trim()) {
                      Alert.alert('Atenção', 'Descreva o dano');
                      return;
                    }
                    await onAction(
                      () =>
                        apiClient.post(`/tools/custody/${custody.id}/report-damage`, {
                          description: damage.trim(),
                        }),
                      'Dano comunicado ao almoxarifado'
                    );
                    onClose();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Enviar</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'extension' && (
              <View style={styles.formBlock}>
                <Text style={styles.formLabel}>Nova data de devolução</Text>
                <TextInput
                  value={newDate}
                  onChangeText={setNewDate}
                  style={styles.input}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.formLabel}>Justificativa</Text>
                <TextInput
                  value={justification}
                  onChangeText={setJustification}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                  placeholder="Por que precisa de mais prazo?"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={async () => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                      Alert.alert('Atenção', 'Informe a data no formato AAAA-MM-DD');
                      return;
                    }
                    await onAction(
                      () =>
                        apiClient.post(`/tools/custody/${custody.id}/extension`, {
                          requested_return_at: new Date(`${newDate}T18:00:00`).toISOString(),
                          justification: justification.trim() || undefined,
                        }),
                      'Prorrogação solicitada'
                    );
                    onClose();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Solicitar</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.linkButton} onPress={onClose}>
              <Text style={styles.linkButtonText}>Fechar</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ============================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.bodySm, color: colors.textMuted },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { ...typography.tiny, color: colors.background, fontWeight: '700' },

  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  summaryTitle: { ...typography.bodyBold, color: colors.text },
  summarySubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexGrow: 1,
    minWidth: 74,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  chipValue: { ...typography.h4, fontWeight: '700' },
  chipLabel: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },

  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { ...typography.captionBold, color: colors.textSecondary },
  filterChipTextActive: { color: colors.background },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  primaryButtonText: { ...typography.button, color: colors.background, fontWeight: '700' },
  primaryButtonSmall: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonSmallText: {
    ...typography.buttonSm,
    color: colors.background,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.5 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 10,
  },
  secondaryButtonText: { ...typography.buttonSm, color: colors.text },
  linkButton: { alignItems: 'center', paddingVertical: 12 },
  linkButtonText: { ...typography.bodySm, color: colors.textMuted },

  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 10,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardHeaderText: { flex: 1, gap: 3 },
  cardTitle: { ...typography.bodyBold, color: colors.text },
  cardCode: { ...typography.caption, color: colors.textMuted },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.cardAlt },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: { ...typography.tiny, fontWeight: '700' },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaItem: { minWidth: 92 },
  metaLabel: { ...typography.tiny, color: colors.textMuted },
  metaValue: { ...typography.captionBold, color: colors.text },

  osLine: { ...typography.caption, color: colors.textSecondary, marginTop: 10 },

  noticeBox: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  noticeText: { ...typography.caption, color: colors.warning, flex: 1 },
  rejectionText: { ...typography.caption, color: colors.danger, marginTop: 8 },

  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  timeline: { paddingLeft: 4 },
  timelineRow: { flexDirection: 'row', gap: 10 },
  timelineLeft: { width: 62, paddingTop: 14 },
  timelineDate: { ...typography.tiny, color: colors.textSecondary },
  timelineTime: { ...typography.tiny, color: colors.textMuted },
  timelineDotColumn: { alignItems: 'center', width: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
  },
  timelineCardHeader: { flexDirection: 'row', gap: 10 },
  timelineType: { ...typography.captionBold, marginTop: 2 },
  timelineBy: { ...typography.tiny, color: colors.textMuted, marginTop: 1 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '88%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  detailList: { marginTop: 14, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { ...typography.caption, color: colors.textMuted },
  detailValue: { ...typography.captionBold, color: colors.text, flexShrink: 1, textAlign: 'right' },

  formBlock: { marginTop: 16, gap: 8 },
  formLabel: { ...typography.captionBold, color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.card,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
