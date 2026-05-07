import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ToolInventory } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface ToolCatalogCardProps {
  tool: ToolInventory;
  cartQuantity: number;
  onAdd: () => void;
  onChangeQuantity: (qty: number) => void;
}

export function ToolCatalogCard({
  tool,
  cartQuantity,
  onAdd,
  onChangeQuantity,
}: ToolCatalogCardProps) {
  const photo = tool.photo_url || tool.image_url || null;
  const available = tool.quantity_available ?? 1;
  const inCart = cartQuantity > 0;

  return (
    <View style={styles.card}>
      <View style={styles.imageWrapper}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="construct" size={36} color={colors.textDark} />
          </View>
        )}
        <View style={styles.availableBadge}>
          <Text style={styles.availableText}>Disp.: {available}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {tool.name}
        </Text>
        {tool.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {tool.description}
          </Text>
        ) : (
          <Text style={[styles.description, { color: colors.textDark }]} numberOfLines={2}>
            Sem descricao
          </Text>
        )}

        {inCart ? (
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={styles.qtyButton}
              onPress={() => onChangeQuantity(cartQuantity - 1)}
              accessibilityLabel="Diminuir quantidade"
            >
              <Ionicons name="remove" size={16} color={colors.text} />
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              keyboardType="number-pad"
              value={String(cartQuantity)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/\D/g, '') || '0', 10);
                onChangeQuantity(n);
              }}
            />
            <TouchableOpacity
              style={styles.qtyButton}
              onPress={() => onChangeQuantity(cartQuantity + 1)}
              accessibilityLabel="Aumentar quantidade"
            >
              <Ionicons name="add" size={16} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.addedTag}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.addedText}>No carrinho</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addButton} onPress={onAdd}>
            <Ionicons name="add-circle" size={16} color={colors.black} />
            <Text style={styles.addButtonText}>Adicionar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    margin: 6,
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: colors.cardAlt,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availableBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  availableText: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  body: {
    padding: 10,
    gap: 6,
  },
  name: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  description: {
    ...typography.caption,
    color: colors.textMuted,
    minHeight: 28,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  addButtonText: {
    ...typography.buttonSm,
    color: colors.black,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  qtyInput: {
    width: 36,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 0,
    ...typography.bodySmBold,
  },
  addedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  addedText: {
    ...typography.caption,
    color: colors.success,
  },
});
