import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigation } from '@react-navigation/native';
import { apiClient, ApiError } from '../lib/api';
import { PaginatedResponse, ServiceOrder, getOsTipo } from '../lib/types';
import { EmptyState } from '../components/EmptyState';
import { FeedVideo } from '../components/FeedVideo';
import { HeaderBellButton } from '../components/HeaderBellButton';
import { useAuthStore } from '../stores/auth-store';
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
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Todos',
  employees: 'Funcionarios',
  partners: 'Parceiros',
};

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.includes(ext));
}

const AUDIENCE_COLORS: Record<string, string> = {
  all: colors.info,
  employees: colors.primary,
  partners: colors.success,
};

// ============================================================
// Component
// ============================================================

export function FeedScreen() {
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const firstName = profile?.full_name?.split(' ')[0] || '';
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [periciasPendentes, setPericiasPendentes] = useState<number>(0);
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

  const fetchPericiasPendentes = useCallback(async () => {
    try {
      const data = await apiClient.get<PaginatedResponse<ServiceOrder>>(
        '/service-orders/my',
        { page: 1, limit: 50 },
      );
      const pendentes = (data?.data || []).filter(
        (o) =>
          getOsTipo(o) === 'PERICIA' &&
          o.status !== 'completed' &&
          o.status !== 'cancelled' &&
          o.status !== 'rejected',
      );
      setPericiasPendentes(pendentes.length);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchPosts(1).finally(() => setIsLoading(false));
    fetchPericiasPendentes();
  }, [fetchPosts, fetchPericiasPendentes]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchPosts(1, true), fetchPericiasPendentes()]);
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

  const handleToggleLike = async (post: FeedPost) => {
    // optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              like_count: p.like_count + (p.liked_by_me ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      const r = await apiClient.post<{ liked: boolean; like_count: number }>(
        `/feed/${post.id}/like`,
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: r.liked, like_count: r.like_count }
            : p,
        ),
      );
    } catch (error) {
      // rollback
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                liked_by_me: post.liked_by_me,
                like_count: post.like_count,
              }
            : p,
        ),
      );
      const msg =
        error instanceof ApiError ? error.message : 'Erro ao curtir';
      Alert.alert('Ops', msg);
    }
  };

  const handleOpenComments = (post: FeedPost) => {
    navigation.navigate('Comments' as never, {
      postId: post.id,
      postTitle: post.title,
    } as never);
  };

  const handleShare = async (post: FeedPost) => {
    try {
      const lines: string[] = [];
      lines.push(`📢 ${post.title}`);
      lines.push('');
      lines.push(post.content);
      if (post.author?.full_name) {
        lines.push('');
        lines.push(`— ${post.author.full_name}`);
      }
      if (post.media_urls && post.media_urls.length > 0) {
        lines.push('');
        lines.push(`Mídia: ${post.media_urls[0]}`);
      }
      await Share.share({
        message: lines.join('\n'),
        title: post.title,
      });
    } catch {
      // user canceled — ignore
    }
  };

  const renderPost = ({ item }: { item: FeedPost }) => {
    const firstMedia = item.media_urls?.[0];
    const hasImage = firstMedia && !isVideoUrl(firstMedia);
    const hasVideo = firstMedia && isVideoUrl(firstMedia);

    return (
      <View style={styles.postCard}>
        {/* Pinned indicator */}
        {item.is_pinned && (
          <View style={styles.pinnedBanner}>
            <Ionicons name="pin" size={14} color={colors.primary} />
            <Text style={styles.pinnedText}>Fixado</Text>
          </View>
        )}

        {/* Imagem grande dominante (estilo social) */}
        {hasImage && (
          <Image
            source={{ uri: firstMedia }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        )}
        {hasVideo && firstMedia && (
          <FeedVideo uri={firstMedia} style={styles.heroVideo} />
        )}

        {/* Header: author + date */}
        <View style={styles.postBody}>
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

            <View
              style={[
                styles.audienceBadge,
                {
                  backgroundColor:
                    (AUDIENCE_COLORS[item.audience] || colors.info) + '20',
                },
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

          <Text style={styles.postTitle}>{item.title}</Text>
          <Text style={styles.postContent} numberOfLines={6}>
            {item.content}
          </Text>

          {/* Mídias adicionais (após a primeira) — thumbnails */}
          {item.media_urls && item.media_urls.length > 1 && (
            <View style={styles.mediaContainer}>
              {item.media_urls.slice(1).map((url, i) =>
                isVideoUrl(url) ? (
                  <FeedVideo
                    key={i}
                    uri={url}
                    style={styles.videoThumbnail}
                  />
                ) : (
                  <Image
                    key={i}
                    source={{ uri: url }}
                    style={styles.mediaThumbnail}
                    resizeMode="cover"
                  />
                ),
              )}
            </View>
          )}

          {/* Contadores */}
          {(item.like_count > 0 || item.comment_count > 0) && (
            <View style={styles.engagementSummary}>
              {item.like_count > 0 && (
                <Text style={styles.engagementSummaryText}>
                  {item.like_count}{' '}
                  {item.like_count === 1 ? 'curtida' : 'curtidas'}
                </Text>
              )}
              {item.comment_count > 0 && (
                <Text style={styles.engagementSummaryText}>
                  {item.comment_count}{' '}
                  {item.comment_count === 1
                    ? 'comentário'
                    : 'comentários'}
                </Text>
              )}
            </View>
          )}

          {/* Ações: curtir / comentar / compartilhar */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleToggleLike(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.liked_by_me ? 'heart' : 'heart-outline'}
                size={22}
                color={item.liked_by_me ? colors.danger : colors.text}
              />
              <Text
                style={[
                  styles.actionLabel,
                  item.liked_by_me && { color: colors.danger },
                ]}
              >
                Curtir
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleOpenComments(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chatbubble-outline"
                size={22}
                color={colors.text}
              />
              <Text style={styles.actionLabel}>Comentar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShare(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="share-social-outline"
                size={22}
                color={colors.text}
              />
              <Text style={styles.actionLabel}>Compartilhar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

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
        {/* Header com saudação personalizada */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {firstName ? firstName : 'Profissional'}
            </Text>
          </View>
          <HeaderBellButton />
        </View>

        {/* Card destaque de chamados de perícia pendentes */}
        {periciasPendentes > 0 && (
          <TouchableOpacity
            style={styles.periciaHighlight}
            onPress={() => navigation.navigate('PericiasTab' as never)}
            activeOpacity={0.85}
          >
            <View style={styles.periciaIconWrap}>
              <Ionicons name="search" size={22} color={colors.black} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.periciaTitle}>
                {periciasPendentes === 1
                  ? 'Você tem 1 chamado de perícia pendente'
                  : `Você tem ${periciasPendentes} chamados de perícia pendentes`}
              </Text>
              <Text style={styles.periciaSubtitle}>
                Toque para ver na aba Serviços
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.black}
            />
          </TouchableOpacity>
        )}

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: -2,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  periciaHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  periciaIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periciaTitle: {
    ...typography.bodySmBold,
    color: colors.black,
  },
  periciaSubtitle: {
    ...typography.tiny,
    color: 'rgba(0,0,0,0.7)',
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  postBody: {
    padding: 16,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.cardAlt,
  },
  heroVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroVideoLabel: {
    ...typography.bodySmBold,
    color: colors.white,
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.primary + '12',
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
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  mediaThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  videoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLabel: {
    ...typography.tiny,
    color: colors.white,
    marginTop: 2,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  engagementSummary: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  engagementSummaryText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  actionLabel: {
    ...typography.bodySmBold,
    color: colors.text,
  },
});
