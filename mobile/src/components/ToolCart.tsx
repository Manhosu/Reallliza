import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useToolCart } from '../stores/tool-cart';
import { apiClient } from '../lib/api';

interface ToolCartProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ToolCart({ visible, onClose, onSubmitted }: ToolCartProps) {
  const items = useToolCart((s) => s.items);
  const setQuantity = useToolCart((s) => s.setQuantity);
  const remove = useToolCart((s) => s.remove);
  const clear = useToolCart((s) => s.clear);

  const [justification, setJustification] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(
    'medium',
  );
  const [submitting, setSubmitting] = useState(false);

  const lines = Object.values(items);
  const totalCount = lines.reduce((acc, l) => acc + l.quantity, 0);

  const handleSubmit = async () => {
    if (lines.length === 0) {
      Alert.alert('Carrinho vazio', 'Adicione ferramentas antes de enviar.');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        items: lines.map((l) => ({
          tool_id: l.tool.id,
          quantity: l.quantity,
        })),
        shared_justification: justification.trim() || undefined,
        priority,
      };
      await apiClient.post('/tools/requests/batch', payload);
      clear();
      setJustification('');
      setPriority('medium');
      Alert.alert('Sucesso', 'Solicitacao enviada para analise.');
      onSubmitted();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Erro ao enviar';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Carrinho de Solicitacao</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
              {totalCount} {totalCount === 1 ? 'unidade' : 'unidades'} em {lines.length}{' '}
              {lines.length === 1 ? 'ferramenta' : 'ferramentas'}
            </Text>
          </View>

          {/* List */}
          {lines.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={48} color={colors.textDark} />
              <Text style={styles.emptyText}>Nenhuma ferramenta no carrinho</Text>
              <Text style={styles.emptySubtext}>
                Volte ao catalogo e adicione itens.
              </Text>
            </View>
          ) : (
            <FlatList
              data={lines}
              keyExtractor={(item) => item.tool.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item }) => {
                const photo = item.tool.photo_url || item.tool.image_url || null;
                return (
                  <View style={styles.lineCard}>
                    <View style={styles.lineImageWrapper}>
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.lineImage} />
                      ) : (
                        <Ionicons name="construct" size={24} color={colors.textDark} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {item.tool.name}
                      </Text>
                      <Text style={styles.lineMeta} numberOfLines={1}>
                        Disp.: {item.tool.quantity_available ?? 1}
                      </Text>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => setQuantity(item.tool.id, item.quantity - 1)}
                        >
                          <Ionicons name="remove" size={14} color={colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="number-pad"
                          value={String(item.quantity)}
                          onChangeText={(t) => {
                            const n = parseInt(t.replace(/\D/g, '') || '0', 10);
                            setQuantity(item.tool.id, n);
                          }}
                        />
                        <TouchableOpacity
                          style={styles.qtyButton}
                          onPress={() => setQuantity(item.tool.id, item.quantity + 1)}
                        >
                          <Ionicons name="add" size={14} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => remove(item.tool.id)}
                      hitSlop={8}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.label}>Prioridade</Text>
            <View style={styles.priorityRow}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                const labels = {
                  low: 'Baixa',
                  medium: 'Media',
                  high: 'Alta',
                  urgent: 'Urgente',
                };
                const tintByPriority = {
                  low: '#71717A',
                  medium: '#EAB308',
                  high: '#F97316',
                  urgent: '#EF4444',
                };
                const isActive = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[
                      styles.priorityChip,
                      {
                        borderColor: isActive
                          ? tintByPriority[p]
                          : colors.border,
                        backgroundColor: isActive
                          ? tintByPriority[p] + '22'
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityChipText,
                        {
                          color: isActive ? tintByPriority[p] : colors.textDark,
                          fontWeight: isActive ? '700' : '500',
                        },
                      ]}
                    >
                      {labels[p]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Justificativa (opcional para todos os itens)</Text>
            <TextInput
              style={styles.justificationInput}
              multiline
              placeholder="Para qual servico/OS voce precisa?"
              placeholderTextColor={colors.textDark}
              value={justification}
              onChangeText={setJustification}
            />
            <TouchableOpacity
              style={[
                styles.submitButton,
                (submitting || lines.length === 0) && { opacity: 0.5 },
              ]}
              onPress={handleSubmit}
              disabled={submitting || lines.length === 0}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color={colors.white} />
                  <Text style={styles.submitButtonText}>Enviar Solicitacao</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '60%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 6,
  },
  emptyText: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineImageWrapper: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lineImage: {
    width: '100%',
    height: '100%',
  },
  lineName: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  lineMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  qtyButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  qtyInput: {
    width: 36,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 0,
    ...typography.bodySmBold,
  },
  removeBtn: {
    padding: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
    backgroundColor: colors.background,
  },
  label: {
    ...typography.bodySmBold,
    color: colors.textMuted,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  priorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  priorityChipText: {
    ...typography.bodySm,
  },
  justificationInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 60,
    textAlignVertical: 'top',
    ...typography.bodySm,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.success,
    marginTop: 4,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
