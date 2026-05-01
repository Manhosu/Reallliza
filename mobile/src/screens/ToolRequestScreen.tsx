import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { ToolInventory } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function ToolRequestScreen() {
  const navigation = useNavigation<any>();
  const [catalog, setCatalog] = useState<ToolInventory[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolInventory | null>(null);
  const [customName, setCustomName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const items = await apiClient
        .get<ToolInventory[]>('/tools')
        .catch(() => [] as ToolInventory[]);
      setCatalog(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredCatalog = catalog.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSubmit = async () => {
    const toolName = selectedTool?.name || customName.trim();
    if (!toolName) {
      Alert.alert('Erro', 'Escolha uma ferramenta ou digite o nome.');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      Alert.alert('Erro', 'Quantidade inválida.');
      return;
    }
    try {
      setSubmitting(true);
      await apiClient.post('/tools/requests', {
        tool_id: selectedTool?.id,
        tool_name: toolName,
        quantity: qty,
        justification: justification.trim() || undefined,
      });
      Alert.alert('Sucesso', 'Solicitação enviada para análise.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Solicitar Ferramenta</Text>
          <Text style={styles.subheading}>
            Selecione um item do catálogo ou digite o nome livremente.
          </Text>

          {/* Catálogo */}
          <View style={styles.section}>
            <Text style={styles.label}>Catálogo</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar..."
              placeholderTextColor={colors.textDark}
              value={search}
              onChangeText={setSearch}
            />
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />
            ) : filteredCatalog.length > 0 ? (
              <View style={styles.catalogList}>
                {filteredCatalog.slice(0, 8).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.catalogItem,
                      selectedTool?.id === t.id && styles.catalogItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedTool(t);
                      setCustomName('');
                    }}
                  >
                    <Ionicons
                      name={selectedTool?.id === t.id ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selectedTool?.id === t.id ? colors.primary : colors.textDark}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catalogName}>{t.name}</Text>
                      {t.serial_number && (
                        <Text style={styles.catalogMeta}>S/N: {t.serial_number}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>Nenhum item no catálogo.</Text>
            )}
          </View>

          {/* Campo livre */}
          <View style={styles.section}>
            <Text style={styles.label}>...ou digite o nome</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Espátula 30cm"
              placeholderTextColor={colors.textDark}
              value={customName}
              onChangeText={(t) => {
                setCustomName(t);
                if (t) setSelectedTool(null);
              }}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Quantidade</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Justificativa (opcional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Para qual serviço/OS você precisa?"
              placeholderTextColor={colors.textDark}
              value={justification}
              onChangeText={setJustification}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color={colors.black} />
                <Text style={styles.submitButtonText}>Enviar Solicitação</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  heading: {
    ...typography.h2,
    color: colors.text,
  },
  subheading: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginBottom: 4,
  },
  section: {
    gap: 6,
  },
  label: {
    ...typography.bodySmBold,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.bodySm,
  },
  catalogList: {
    gap: 6,
    marginTop: 6,
  },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catalogItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  catalogName: {
    ...typography.bodySm,
    color: colors.text,
  },
  catalogMeta: {
    ...typography.caption,
    color: colors.textDark,
  },
  empty: {
    ...typography.caption,
    color: colors.textDark,
    paddingVertical: 16,
    textAlign: 'center',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.black,
  },
});
