import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '../lib/api';
import { PaginatedResponse } from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// ============================================================
// Types
// ============================================================

interface FeedAuthor {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface FeedPost {
  id: string;
  title: string;
  content: string;
  audience: 'all' | 'employees' | 'partners';
  is_pinned: boolean;
  is_published: boolean;
  media_urls: string[] | null;
  author_id: string;
  author: FeedAuthor;
  created_at: string;
  updated_at: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Todos',
  employees: 'Funcionarios',
  partners: 'Parceiros',
};

const AUDIENCE_COLORS: Record<string, string> = {
  all: colors.info,
  employees: colors.primary,
  partners: colors.success,
};

// ============================================================
// Component
// ============================================================

export function FeedScreen() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchPosts = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        const response = await apiClient.get<PaginatedResponse<FeedPost>>(
          '/feed',
          { page: pageNum, limit: 20 },
        );

        if (isRefresh || pageNum === 1) {
          setPosts(response.data);
        } else {
          setPosts(prev => [...prev, ...response.data]);
        }

        setHasMore(pageNum < response.meta.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('Error fetching feed:', error);
      }
    },
    [],
  );

  useEffect(() => {
    setIsLoading(true);
    fetchPosts(1).finally(() => setIsLoading(false));
  }, [fetchPosts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts(1, true);
    setIsRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    await fetchPosts(page + 1);
    setIsLoadingMore(false);
  };

  const formatDate = (dateStr: string): string => {
    try {
      return format(new Date(dateStr), "dd 'de' MMM, HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateStr;
    }
  };

  const renderPost = ({ item }: { item: FeedPost }) => (
    <View style={styles.postCard}>
      {/* Pinned indicator */}
      {item.is_pinned && (
        <View style={styles.pinnedBanner}>
          <Ionicons name="pin" size={14} color={colors.primary} />
          <Text style={styles.pinnedText}>Fixado</Text>
        </View>
      )}

      {/* Header: author + date */}
      <View style={styles.postHeader}>
        <View style={styles.authorInfo}>
          <View style={styles.authorAvatar}>
            <Ionicons name="person" size={16} color={colors.textMuted} />
          </View>
          <View>
            <Text style={styles.authorName}>
              {item.author?.full_name ?? 'Autor desconhecido'}
            </Text>
            <Text style={styles.postDate}>{formatDate(item.created_at)}</Text>
          </View>
        </View>

        {/* Audience badge */}
        <View
          style={[
            styles.audienceBadge,
            { backgroundColor: (AUDIENCE_COLORS[item.audience] || colors.info) + '20' },
          ]}
        >
          <Text
            style={[
              styles.audienceBadgeText,
              { color: AUDIENCE_COLORS[item.audience] || colors.info },
            ]}
          >
            {AUDIENCE_LABELS[item.audience] || item.audience}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.postTitle}>{item.title}</Text>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={6}>
        {item.content}
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feed</Text>
        </View>

        {/* Posts List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={item => item.id}
            renderItem={renderPost}
            contentContainerStyle={
              posts.length === 0
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
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              <EmptyState
                icon="newspaper-outline"
                title="Nenhuma publicacao"
                message="Nao existem publicacoes no feed no momento."
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
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
    gap: 12,
  },
  postCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pinnedText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  authorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorName: {
    ...typography.bodySmBold,
    color: colors.text,
  },
  postDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  audienceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  audienceBadgeText: {
    ...typography.captionBold,
  },
  postTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 6,
  },
  postContent: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
