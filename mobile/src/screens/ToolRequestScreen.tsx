import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { ToolInventory, PaginatedResponse } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ToolCatalogCard } from '../components/ToolCatalogCard';
import { ToolCart } from '../components/ToolCart';
import { useToolCart } from '../stores/tool-cart';

/**
 * Tela de catalogo de ferramentas com carrinho de solicitacao.
 * Tecnico ve todas as ferramentas (foto + descricao + qtde disponivel),
 * adiciona ao carrinho e envia uma solicitacao em batch.
 */
export function ToolRequestScreen() {
  const navigation = useNavigation<any>();
  const [catalog, setCatalog] = useState<ToolInventory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const items = useToolCart((s) => s.items);
  const add = useToolCart((s) => s.add);
  const setQuantity = useToolCart((s) => s.setQuantity);
  const totalCount = useToolCart((s) => s.getTotalCount());

  const loadCatalog = useCallback(async () => {
    try {
      // Endpoint pode retornar paginado { data, meta } ou array direto
      const response = await apiClient
        .get<PaginatedResponse<ToolInventory> | ToolInventory[]>('/tools', {
          available: 'true',
          limit: 100,
        })
        .catch(() => [] as ToolInventory[]);
      const list = Array.isArray(response)
        ? response
        : (response as PaginatedResponse<ToolInventory>).data ?? [];
      setCatalog(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCatalog();
  }, [loadCatalog]);

  const filteredCatalog = catalog.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  });

  const handleSubmitted = () => {
    setCartOpen(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}
    >
      {/* Top bar: search + cart */}
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textDark} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar ferramenta..."
            placeholderTextColor={colors.textDark}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity
          style={styles.cartButton}
          onPress={() => setCartOpen(true)}
          accessibilityLabel="Abrir carrinho"
        >
          <Ionicons name="cart" size={20} color={colors.black} />
          <Text style={styles.cartButtonText}>
            Carrinho ({totalCount})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredCatalog.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="construct-outline" size={48} color={colors.textDark} />
          <Text style={styles.emptyTitle}>
            {catalog.length === 0
              ? 'Nenhuma ferramenta cadastrada'
              : 'Nada encontrado'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {catalog.length === 0
              ? 'Aguarde o admin cadastrar ferramentas no catalogo.'
              : 'Tente outro termo de busca.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCatalog}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ToolCatalogCard
              tool={item}
              cartQuantity={items[item.id]?.quantity ?? 0}
              onAdd={() => add(item, 1)}
              onChangeQuantity={(qty) => {
                if (qty <= 0) {
                  setQuantity(item.id, 0);
                } else if (items[item.id]) {
                  setQuantity(item.id, qty);
                } else {
                  add(item, qty);
                }
              }}
            />
          )}
        />
      )}

      <ToolCart
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        onSubmitted={handleSubmitted}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
    ...typography.bodySm,
  },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  cartButtonText: {
    ...typography.bodySmBold,
    color: colors.black,
  },
  listContent: {
    padding: 6,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 4,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
