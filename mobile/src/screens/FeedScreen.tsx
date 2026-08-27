import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Share,
  Linking,
  Alert,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiClient, BASE_URL } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { FeedEnquete, type EnqueteFeed } from '../components/FeedEnquete';
import { FeedPedido, type TipoPedido } from '../components/FeedPedido';
import { feedTracker } from '../lib/feed-tracker';
import { FeedCarousel, type MidiaFeed } from '../components/FeedCarousel';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getOsTipo, type ServiceOrder, type PaginatedResponse } from '../lib/types';

/**
 * Feed do profissional.
 *
 * Reconstruído sobre o modelo novo: carrossel de verdade, reações com tipo,
 * salvar, compartilhar contado e botões de ação da publicação.
 *
 * Duas coisas invisíveis, mas centrais:
 *
 * 1. Impressão só conta quando metade do card fica visível por um segundo —
 *    o critério de mercado. Sem isso, rolar rápido inflaria a métrica com
 *    publicações que ninguém leu.
 *
 * 2. Um único vídeo toca por vez, o do card mais visível. Vinte reprodutores
 *    vivos esgotam o decodificador e travam aparelho de entrada.
 */

/**
 * Karol 27/08: mesma normalização de web/src/lib/feed/anexos.ts (sem
 * pacote compartilhado entre mobile/web neste monorepo, replicada aqui
 * como o resto do código já faz). Sem esquema (http/tel/mailto/...),
 * `Linking.openURL` recusa a URL e o botão "não faz nada".
 */
function normalizarUrlDeBotao(url: string): string {
  const v = url.trim();
  if (!v) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v}`;
}

interface CtaFeed {
  id: string;
  position: number;
  cta_type: string;
  label: string;
  target_url: string | null;
  target_route: string | null;
  coupon_code: string | null;
}

interface PostFeed {
  id: string;
  title: string;
  content: string;
  media?: MidiaFeed[];
  ctas?: CtaFeed[];
  poll?: EnqueteFeed | null;
  /** Opcoes que ESTA pessoa marcou. Vem da consulta do feed. */
  my_poll_votes?: string[];
  category?: { name: string; color: string | null } | null;
  sponsor?: { name: string; logo_url: string | null; primary_color?: string | null } | null;
  is_sponsored: boolean;
  is_pinned: boolean;
  comments_enabled: boolean;
  reactions_enabled: boolean;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  my_reaction: string | null;
  saved_by_me: boolean;
  created_at: string;
  published_at: string | null;
  author?: { full_name: string; avatar_url: string | null } | null;
}

const REACOES: Array<{ tipo: string; icone: keyof typeof Ionicons.glyphMap; rotulo: string }> = [
  { tipo: 'like', icone: 'thumbs-up', rotulo: 'Curti' },
  { tipo: 'love', icone: 'heart', rotulo: 'Amei' },
  { tipo: 'celebrate', icone: 'trophy', rotulo: 'Parabéns' },
  { tipo: 'insightful', icone: 'bulb', rotulo: 'Aprendi' },
  { tipo: 'support', icone: 'hand-left', rotulo: 'Apoio' },
];

function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function FeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const postIdAlvo: string | undefined = route.params?.postId;
  const alvoAplicadoRef = useRef<string | null>(null);
  const listaRef = useRef<FlatList<PostFeed>>(null);
  const [posts, setPosts] = useState<PostFeed[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [periciasPendentes, setPericiasPendentes] = useState(0);
  const [seletorReacao, setSeletorReacao] = useState<string | null>(null);
  // O `user` do store e o usuario de autenticacao; nome e telefone vivem no
  // perfil, que o store ja carrega.
  const perfil = useAuthStore((e) => e.profile);
  const [cardAtivo, setCardAtivo] = useState<string | null>(null);
  // Pedido aberto pelo botao de acao. Guarda a publicacao junto porque o
  // patrocinador e o titulo vao no registro do lead.
  const [pedido, setPedido] = useState<{ post: PostFeed; cta: CtaFeed; tipo: TipoPedido } | null>(null);

  const buscar = useCallback(async (proxCursor: string | null, substituir: boolean) => {
    try {
      const r = await apiClient.get<{
        data: PostFeed[]; next_cursor: string | null; has_more: boolean;
      }>('/feed', proxCursor ? { cursor: proxCursor, limit: 20 } : { limit: 20 });

      setPosts((atual) => (substituir ? r.data : [...atual, ...r.data]));
      setCursor(r.next_cursor);
      setTemMais(r.has_more);
    } catch {
      if (substituir) setPosts([]);
    }
  }, []);

  const buscarPericias = useCallback(async () => {
    try {
      const data = await apiClient.get<PaginatedResponse<ServiceOrder>>('/service-orders/my', {
        page: 1, limit: 50,
      });
      const pendentes = (data?.data || []).filter(
        (o) =>
          getOsTipo(o) === 'PERICIA' &&
          o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'rejected'
      );
      setPericiasPendentes(pendentes.length);
    } catch {
      // silencioso: o feed não pode sumir porque a lista de perícias falhou
    }
  }, []);

  useEffect(() => {
    feedTracker.iniciar();
    feedTracker.novaSessao();
    Promise.all([buscar(null, true), buscarPericias()]).finally(() => setCarregando(false));
    return () => feedTracker.parar();
  }, [buscar, buscarPericias]);

  /**
   * Post aberto por link compartilhado (Karol 27/08). O feed comum é
   * paginado por data — o post de origem pode estar páginas atrás, ou nem
   * na audiência do primeiro carregamento. Em vez de recriar toda a
   * renderização do card numa tela nova, busca só ESSE post
   * (GET /feed/:id, já respeita audiência/permissão) e finca no topo da
   * mesma lista — reaproveita reação, comentário, CTA e compartilhar como
   * já existem.
   */
  useEffect(() => {
    if (!postIdAlvo || carregando || alvoAplicadoRef.current === postIdAlvo) return;
    alvoAplicadoRef.current = postIdAlvo;

    if (posts.some((p) => p.id === postIdAlvo)) {
      listaRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }

    apiClient
      .get<PostFeed>(`/feed/${postIdAlvo}`)
      .then((post) => {
        setPosts((atual) =>
          atual.some((p) => p.id === post.id) ? atual : [post, ...atual]
        );
        requestAnimationFrame(() => listaRef.current?.scrollToOffset({ offset: 0, animated: true }));
      })
      .catch(() => {
        Alert.alert('Publicação não encontrada', 'Esse link não está mais disponível.');
      });
  }, [postIdAlvo, carregando, posts]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    feedTracker.novaSessao();
    await Promise.all([buscar(null, true), buscarPericias()]);
    setAtualizando(false);
  }, [buscar, buscarPericias]);

  const carregarMais = useCallback(async () => {
    if (!temMais || carregandoMais || !cursor) return;
    setCarregandoMais(true);
    await buscar(cursor, false);
    setCarregandoMais(false);
  }, [temMais, carregandoMais, cursor, buscar]);

  // 50% visível por 1 segundo — o critério de "impressão contável" do mercado.
  const configVisibilidade = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 1000,
  }).current;

  const aoMudarVisiveis = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const v of viewableItems) {
        const p = v.item as PostFeed;
        if (p?.id) feedTracker.registrar('impression', p.id);
      }
      // O primeiro item visível é quem pode tocar vídeo.
      const primeiro = viewableItems[0]?.item as PostFeed | undefined;
      setCardAtivo(primeiro?.id ?? null);
    }
  ).current;

  function atualizarLocal(id: string, patch: Partial<PostFeed>) {
    setPosts((atual) => atual.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function reagir(post: PostFeed, tipo: string | null) {
    setSeletorReacao(null);
    const anterior = { my_reaction: post.my_reaction, like_count: post.like_count };
    // Otimista: o toque precisa responder na hora, mesmo em obra com sinal ruim.
    const desfazendo = post.my_reaction === tipo || tipo === null;
    atualizarLocal(post.id, {
      my_reaction: desfazendo ? null : tipo,
      like_count: post.like_count + (desfazendo ? -1 : post.my_reaction ? 0 : 1),
    });
    try {
      const r = await apiClient.post<{ my_reaction: string | null; like_count: number }>(
        `/feed/${post.id}/react`, { reaction: tipo }
      );
      atualizarLocal(post.id, { my_reaction: r.my_reaction, like_count: r.like_count });
    } catch {
      atualizarLocal(post.id, anterior);
    }
  }

  async function salvar(post: PostFeed) {
    const anterior = { saved_by_me: post.saved_by_me, save_count: post.save_count };
    atualizarLocal(post.id, {
      saved_by_me: !post.saved_by_me,
      save_count: post.save_count + (post.saved_by_me ? -1 : 1),
    });
    try {
      const r = await apiClient.post<{ saved: boolean; save_count: number }>(
        `/feed/${post.id}/save`, {}
      );
      atualizarLocal(post.id, { saved_by_me: r.saved, save_count: r.save_count });
    } catch {
      atualizarLocal(post.id, anterior);
    }
  }

  /**
   * Karol 27/08: "hoje só manda a legenda" — antes compartilhava o texto
   * inteiro do post sem nenhum link, então quem recebia não tinha como
   * chegar na publicação, só ler o texto colado. Agora manda um link real
   * (`/feed/p/:id`, App Link — ver navigation/index.tsx e app.json): quem
   * já tem o app abre direto nela; quem não tem cai numa prévia pública
   * com botão de baixar. É também a peça de aquisição que ela pediu.
   */
  async function compartilhar(post: PostFeed) {
    const link = `${BASE_URL.replace(/\/api\/?$/, '')}/feed/p/${post.id}`;
    try {
      const r = await Share.share({ message: `${post.title}\n\n${link}`, url: link });
      // Só conta se o compartilhamento aconteceu de fato — abrir a folha e
      // desistir não é compartilhar.
      if (r.action === Share.sharedAction) {
        await apiClient.post(`/feed/${post.id}/share`, { channel: 'native' });
        atualizarLocal(post.id, { share_count: post.share_count + 1 });
      }
    } catch {
      // usuário cancelou
    }
  }

  /**
   * Botoes que pedem alguma coisa do fabricante viram PEDIDO, com nome e
   * telefone. Os outros seguem o caminho antigo — link, rota ou cupom.
   *
   * A diferenca importa: clique ninguem cobra, pedido rastreavel sim. E o
   * unico caminho pelo qual "Conversoes" no painel deixa de ser zero.
   */
  const CTA_QUE_VIRA_PEDIDO: Record<string, TipoPedido> = {
    solicitar_contato: 'contato',
    solicitar_amostra: 'amostra',
    encontrar_revendedor: 'revendedor',
    participar_treinamento: 'treinamento',
  };

  async function acionarCta(post: PostFeed, cta: CtaFeed) {
    feedTracker.registrar('click', post.id, { cta_id: cta.id });

    const tipoPedido = CTA_QUE_VIRA_PEDIDO[cta.cta_type];
    if (tipoPedido) {
      setPedido({ post, cta, tipo: tipoPedido });
      return;
    }

    if (cta.coupon_code) {
      Alert.alert('Cupom', `Use o código: ${cta.coupon_code}`);
      return;
    }
    if (cta.target_route) {
      navigation.navigate(cta.target_route as never);
      return;
    }
    if (cta.target_url) {
      feedTracker.registrar('link_open', post.id, { cta_id: cta.id });
      Linking.openURL(normalizarUrlDeBotao(cta.target_url)).catch(() =>
        Alert.alert('Não foi possível abrir', 'O link parece inválido.')
      );
    }
  }

  async function votar(post: PostFeed, opcoes: string[]): Promise<EnqueteFeed | null> {
    if (!post.poll) return null;
    const r = await apiClient.post<{ votou: boolean; resultado: EnqueteFeed | null }>(
      `/feed/polls/${post.poll.id}/vote`,
      { option_ids: opcoes }
    );
    // A lista guarda a resposta para o card nao voltar ao estado "sem voto"
    // quando o feed rerenderizar.
    setPosts((atuais) =>
      atuais.map((p) =>
        p.id === post.id && p.poll
          ? { ...p, poll: { ...p.poll, ...(r.resultado ?? {}) }, my_poll_votes: opcoes }
          : p
      )
    );
    return r.resultado;
  }

  const renderPost = ({ item }: { item: PostFeed }) => {
    const midias = item.media ?? [];
    const ativo = cardAtivo === item.id;
    const reacaoAtual = REACOES.find((r) => r.tipo === item.my_reaction);

    return (
      <View style={estilos.card}>
        {/* cabeçalho */}
        <View style={estilos.cabecalho}>
          {/* O logotipo do patrocinador vinha na consulta e era descartado:
              todo post de fabricante saía com um ícone genérico de pessoa.
              Numa peça patrocinada a marca É a informação — sem ela o
              profissional não sabe de quem está lendo. */}
          {item.sponsor?.logo_url ? (
            <Image
              source={{ uri: item.sponsor.logo_url }}
              style={[
                estilos.avatar,
                item.sponsor.primary_color
                  ? { borderWidth: 1.5, borderColor: item.sponsor.primary_color }
                  : null,
              ]}
              resizeMode="contain"
              accessibilityLabel={`Logotipo de ${item.sponsor.name}`}
            />
          ) : (
            <View style={estilos.avatar}>
              <Ionicons name="person" size={18} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={estilos.autor} numberOfLines={1}>
              {item.sponsor?.name ?? item.author?.full_name ?? 'Reallliza'}
            </Text>
            <View style={estilos.linhaMeta}>
              <Text style={estilos.meta}>
                {tempoRelativo(item.published_at ?? item.created_at)}
              </Text>
              {item.category && (
                <>
                  <Text style={estilos.meta}> · </Text>
                  <Text style={[estilos.meta, { color: item.category.color ?? colors.primary }]}>
                    {item.category.name}
                  </Text>
                </>
              )}
            </View>
          </View>
          {item.is_pinned && <Ionicons name="pin" size={15} color={colors.primary} />}
        </View>

        {item.is_sponsored && (
          <View style={estilos.selo}>
            <Text style={estilos.seloTexto}>PATROCINADO</Text>
          </View>
        )}

        {midias.length > 0 && (
          <FeedCarousel
            midias={midias}
            ativo={ativo}
            onTrocarSlide={(i, m) =>
              feedTracker.registrar('carousel_swipe', item.id, { media_id: m.id, value_num: i })
            }
            onAbrirDocumento={(m) => {
              feedTracker.registrar('download', item.id, { media_id: m.id });
              if (m.public_url) Linking.openURL(m.public_url).catch(() => {});
            }}
            onVideoIniciar={(m) =>
              feedTracker.registrar('video_start', item.id, { media_id: m.id })
            }
            onVideoQuartil={(m, q) =>
              feedTracker.registrar(
                q === 100 ? 'video_complete' : (`video_q${q}` as const),
                item.id,
                { media_id: m.id }
              )
            }
            onVideoTempo={(m, ms) =>
              feedTracker.registrar('video_watch', item.id, { media_id: m.id, value_num: ms })
            }
          />
        )}

        <View style={estilos.corpo}>
          <Text style={estilos.titulo}>{item.title}</Text>
          <Text style={estilos.conteudo}>{item.content}</Text>
        </View>

        {item.poll && (
          <View style={{ paddingHorizontal: 12 }}>
            <FeedEnquete
              enquete={{ ...item.poll, minha_resposta: item.my_poll_votes ?? [] }}
              aoVotar={(opcoes) => votar(item, opcoes)}
            />
          </View>
        )}

        {(item.ctas ?? []).length > 0 && (
          <View style={estilos.ctas}>
            {(item.ctas ?? []).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={estilos.botaoCta}
                onPress={() => acionarCta(item, c)}
                activeOpacity={0.85}
              >
                <Text style={estilos.textoCta}>{c.label}</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.black} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* seletor de reação */}
        {seletorReacao === item.id && (
          <View style={estilos.seletor}>
            {REACOES.map((r) => (
              <TouchableOpacity
                key={r.tipo}
                style={estilos.opcaoReacao}
                onPress={() => reagir(item, r.tipo)}
              >
                <Ionicons
                  name={r.icone}
                  size={20}
                  color={item.my_reaction === r.tipo ? colors.primary : colors.textMuted}
                />
                <Text style={estilos.rotuloReacao}>{r.rotulo}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={estilos.acoes}>
          {item.reactions_enabled && (
            <TouchableOpacity
              style={estilos.acao}
              onPress={() => reagir(item, item.my_reaction ? null : 'like')}
              onLongPress={() => setSeletorReacao(seletorReacao === item.id ? null : item.id)}
              delayLongPress={250}
            >
              <Ionicons
                name={reacaoAtual ? reacaoAtual.icone : 'thumbs-up-outline'}
                size={19}
                color={item.my_reaction ? colors.primary : colors.textMuted}
              />
              <Text style={[estilos.textoAcao, item.my_reaction ? { color: colors.primary } : null]}>
                {item.like_count > 0 ? item.like_count : 'Reagir'}
              </Text>
            </TouchableOpacity>
          )}

          {item.comments_enabled && (
            <TouchableOpacity
              style={estilos.acao}
              onPress={() => {
                feedTracker.registrar('expand', item.id);
                navigation.navigate('Comments' as never, { postId: item.id, postTitle: item.title } as never);
              }}
            >
              <Ionicons name="chatbubble-outline" size={19} color={colors.textMuted} />
              <Text style={estilos.textoAcao}>
                {item.comment_count > 0 ? item.comment_count : 'Comentar'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={estilos.acao} onPress={() => compartilhar(item)}>
            <Ionicons name="share-social-outline" size={19} color={colors.textMuted} />
            <Text style={estilos.textoAcao}>
              {item.share_count > 0 ? item.share_count : 'Enviar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.acao} onPress={() => salvar(item)}>
            <Ionicons
              name={item.saved_by_me ? 'bookmark' : 'bookmark-outline'}
              size={19}
              color={item.saved_by_me ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (carregando) {
    return (
      <SafeAreaView style={estilos.tela} edges={['top']}>
        <View style={estilos.centro}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <FlatList
        ref={listaRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderPost}
        contentContainerStyle={posts.length === 0 ? estilos.vazioContainer : estilos.lista}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={configVisibilidade}
        onViewableItemsChanged={aoMudarVisiveis}
        onEndReached={carregarMais}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          periciasPendentes > 0 ? (
            <TouchableOpacity
              style={estilos.aviso}
              onPress={() => navigation.navigate('PericiasTab' as never)}
              activeOpacity={0.85}
            >
              <View style={estilos.avisoIcone}>
                <Ionicons name="search" size={19} color={colors.black} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.avisoTitulo}>
                  {periciasPendentes === 1
                    ? 'Você tem 1 chamado de perícia pendente'
                    : `Você tem ${periciasPendentes} chamados de perícia pendentes`}
                </Text>
                <Text style={estilos.avisoSubtitulo}>Toque para ver</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.black} />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={estilos.centro}>
            <Ionicons name="newspaper-outline" size={44} color={colors.textMuted} />
            <Text style={estilos.vazioTitulo}>Nada por aqui ainda</Text>
            <Text style={estilos.vazioTexto}>
              Comunicados, treinamentos e novidades aparecem nesta tela.
            </Text>
          </View>
        }
        ListFooterComponent={
          carregandoMais ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />

      {pedido && (
        <FeedPedido
          visivel
          tipo={pedido.tipo}
          tituloDaPublicacao={pedido.post.title}
          perfil={{
            nome: perfil?.full_name ?? null,
            email: perfil?.email ?? null,
            telefone: perfil?.phone ?? null,
          }}
          aoFechar={() => setPedido(null)}
          aoEnviar={async (dados) => {
            await apiClient.post('/feed/leads', {
              post_id: pedido.post.id,
              cta_id: pedido.cta.id,
              kind: pedido.tipo,
              ...dados,
            });
          }}
        />
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  lista: { paddingVertical: 12, gap: 12 },
  vazioContainer: { flexGrow: 1 },
  vazioTitulo: { ...typography.bodyBold, color: colors.text, marginTop: 8 },
  vazioTexto: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
  },
  autor: { ...typography.bodySmBold, color: colors.text },
  linhaMeta: { flexDirection: 'row', alignItems: 'center' },
  meta: { ...typography.tiny, color: colors.textMuted },

  selo: {
    alignSelf: 'flex-start',
    marginLeft: 12, marginBottom: 8,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.cardAlt,
  },
  seloTexto: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, color: colors.textMuted },

  corpo: { paddingHorizontal: 12, paddingTop: 10, gap: 4 },
  titulo: { ...typography.bodyBold, color: colors.text },
  conteudo: { ...typography.bodySm, color: colors.textMuted, lineHeight: 20 },

  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  botaoCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  textoCta: { ...typography.captionBold, color: colors.black },

  seletor: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 10, marginHorizontal: 12,
    backgroundColor: colors.cardAlt, borderRadius: 12,
  },
  opcaoReacao: { alignItems: 'center', gap: 3 },
  rotuloReacao: { fontSize: 10, color: colors.textMuted },

  acoes: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10,
  },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textoAcao: { ...typography.caption, color: colors.textMuted },

  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.primary,
    marginHorizontal: 12, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
  },
  avisoIcone: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  avisoTitulo: { ...typography.bodySmBold, color: colors.black },
  avisoSubtitulo: { ...typography.tiny, color: 'rgba(0,0,0,0.7)' },
});

export default FeedScreen;
