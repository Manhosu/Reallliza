import React, { useRef, useState } from 'react';
import {
  View, Image, ScrollView, Dimensions, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedVideo } from './FeedVideo';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface MidiaFeed {
  id: string;
  position: number;
  kind: 'image' | 'video' | 'document';
  public_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  alt_text: string | null;
  file_name: string | null;
}

interface Props {
  midias: MidiaFeed[];
  ativo: boolean;
  onTrocarSlide?: (indice: number, midia: MidiaFeed) => void;
  onAbrirDocumento?: (midia: MidiaFeed) => void;
}

const LARGURA = Dimensions.get('window').width;

/**
 * Carrossel de mídia da publicação.
 *
 * A versão anterior mostrava o primeiro item grande e o resto como
 * miniaturas de 80 pixels embaixo do texto — o que não é carrossel, é uma
 * galeria escondida. Aqui todos os itens têm o mesmo peso e a rolagem é
 * horizontal, como o profissional espera.
 *
 * `ativo` vem de fora: só a publicação mais visível na lista monta o
 * reprodutor de vídeo. Vinte reprodutores vivos ao mesmo tempo esgotam o
 * decodificador de hardware e travam o aparelho de entrada.
 */
export function FeedCarousel({ midias, ativo, onTrocarSlide, onAbrirDocumento }: Props) {
  const [indice, setIndice] = useState(0);
  const jaVistos = useRef(new Set<number>([0]));

  if (midias.length === 0) return null;

  const unica = midias.length === 1;

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!unica}
        onMomentumScrollEnd={(e) => {
          const novo = Math.round(e.nativeEvent.contentOffset.x / LARGURA);
          if (novo === indice) return;
          setIndice(novo);
          // Só avisa a primeira vez que o slide é alcançado: ir e voltar não
          // deve contar como dois avanços.
          if (!jaVistos.current.has(novo)) {
            jaVistos.current.add(novo);
            onTrocarSlide?.(novo, midias[novo]);
          }
        }}
        scrollEventThrottle={16}
      >
        {midias.map((m, i) => (
          <View key={m.id} style={{ width: LARGURA, aspectRatio: 1, backgroundColor: '#000' }}>
            {m.kind === 'image' && m.public_url ? (
              <Image
                source={{ uri: m.public_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                accessibilityLabel={m.alt_text ?? undefined}
              />
            ) : m.kind === 'video' && m.public_url ? (
              <FeedVideo uri={m.public_url} ativo={ativo && i === indice} />
            ) : (
              <TouchableOpacity
                style={styles.documento}
                onPress={() => onAbrirDocumento?.(m)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={44} color={colors.primary} />
                <Text style={{ ...typography.bodySmBold, color: colors.text, marginTop: 8 }}>
                  {m.file_name ?? 'Documento'}
                </Text>
                <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                  Toque para abrir
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {!unica && (
        <>
          <View style={styles.contador}>
            <Text style={styles.contadorTexto}>
              {indice + 1}/{midias.length}
            </Text>
          </View>
          <View style={styles.pontos}>
            {midias.map((m, i) => (
              <View
                key={m.id}
                style={[styles.ponto, i === indice && styles.pontoAtivo]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  documento: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    padding: 24,
  },
  contador: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  contadorTexto: { color: '#fff', fontSize: 11, fontWeight: '600' },
  pontos: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
  },
  pontoAtivo: { opacity: 1, backgroundColor: colors.primary },
});
