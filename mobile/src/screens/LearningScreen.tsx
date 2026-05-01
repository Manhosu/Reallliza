import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Category = 'INSTALACAO' | 'PERICIA' | 'FERRAMENTAS' | 'BOAS_PRATICAS';

interface LearningItem {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  video_url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  order_index: number;
}

const CATEGORIES: Array<{
  key: Category | 'ALL';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { key: 'ALL', label: 'Todos', icon: 'grid-outline', color: colors.text },
  { key: 'INSTALACAO', label: 'Instalação', icon: 'construct-outline', color: colors.info },
  { key: 'PERICIA', label: 'Perícia', icon: 'search-outline', color: colors.primary },
  { key: 'FERRAMENTAS', label: 'Ferramentas', icon: 'hammer-outline', color: colors.warning },
  { key: 'BOAS_PRATICAS', label: 'Boas Práticas', icon: 'ribbon-outline', color: colors.success },
];

const CATEGORY_LABEL: Record<Category, string> = {
  INSTALACAO: 'Instalação',
  PERICIA: 'Perícia',
  FERRAMENTAS: 'Ferramentas',
  BOAS_PRATICAS: 'Boas Práticas',
};

function formatDuration(sec: number | null): string | null {
  if (!sec) return null;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function LearningScreen() {
  const [selected, setSelected] = useState<Category | 'ALL'>('ALL');
  const [items, setItems] = useState<LearningItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const path =
        selected === 'ALL'
          ? '/learning/content'
          : `/learning/content?category=${selected}`;
      const data = await apiClient.get<LearningItem[]>(path);
      setItems(data);
    } catch (error) {
      console.error('Error fetching learning content:', error);
    }
  }, [selected]);

  useEffect(() => {
    setIsLoading(true);
    fetchItems().finally(() => setIsLoading(false));
  }, [fetchItems]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchItems();
    setIsRefreshing(false);
  };

  const handlePlay = async (item: LearningItem) => {
    try {
      const supported = await Linking.canOpenURL(item.video_url);
      if (!supported) {
        Alert.alert('Erro', 'Não foi possível abrir o vídeo.');
        return;
      }
      await Linking.openURL(item.video_url);
    } catch {
      Alert.alert('Erro', 'Falha ao abrir o vídeo.');
    }
  };

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<Category, LearningItem[]>);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Filter chips */}
      <View style={styles.chipBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBarContent}
        >
          {CATEGORIES.map((cat) => {
            const isActive = selected === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.chip,
                  isActive && {
                    backgroundColor: cat.color + '20',
                    borderColor: cat.color,
                  },
                ]}
                onPress={() => setSelected(cat.key)}
              >
                <Ionicons name={cat.icon} size={14} color={isActive ? cat.color : colors.textMuted} />
                <Text
                  style={[
                    styles.chipText,
                    isActive && { color: cat.color, fontWeight: '700' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="film-outline" size={48} color={colors.textDark} />
            <Text style={styles.emptyTitle}>Nenhum conteúdo ainda</Text>
            <Text style={styles.emptyText}>
              A equipe Reallliza está preparando os vídeos. Volte em breve.
            </Text>
          </View>
        ) : selected === 'ALL' ? (
          (Object.keys(grouped) as Category[]).map((cat) => (
            <View key={cat} style={styles.categorySection}>
              <Text style={styles.categoryHeading}>{CATEGORY_LABEL[cat]}</Text>
              {grouped[cat].map((item) => (
                <VideoCard key={item.id} item={item} onPress={() => handlePlay(item)} />
              ))}
            </View>
          ))
        ) : (
          items.map((item) => (
            <VideoCard key={item.id} item={item} onPress={() => handlePlay(item)} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VideoCard({ item, onPress }: { item: LearningItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.thumbWrap}>
        {item.thumbnail_url ? (
          <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="play-circle" size={48} color={colors.primary} />
          </View>
        )}
        <View style={styles.playOverlay}>
          <Ionicons name="play-circle" size={42} color="rgba(255,255,255,0.95)" />
        </View>
        {item.duration_sec && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration_sec)}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chipBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  chipBarContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.captionBold,
    color: colors.textMuted,
  },
  content: {
    padding: 12,
    gap: 12,
  },
  center: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  categorySection: {
    gap: 8,
  },
  categoryHeading: {
    ...typography.bodyBold,
    color: colors.textMuted,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumbWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.cardAlt,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
