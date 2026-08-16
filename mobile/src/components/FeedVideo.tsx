/**
 * Player inline de video pro Feed (Jessica 22/06).
 *
 * Antes o video abria via Linking.openURL — usuario era jogado pro browser
 * externo. Agora roda direto no card com controls nativos (play/pause/seek
 * + fullscreen). Usa expo-video (SDK 54+, substitui o legado expo-av).
 *
 * 15/08: ganhou controle de reproducao por `ativo` e relatorio de progresso.
 *
 * `ativo` existe porque numa lista com vinte publicacoes, vinte players vivos
 * esgotam o decodificador de hardware e travam aparelho de entrada. So o card
 * mais visivel toca; os outros pausam.
 *
 * O progresso alimenta a metrica de quartis (25/50/75/100%), que e uma das
 * informacoes pedidas pro painel de campanha.
 *
 * 16/08: autoplay mudo quando o card esta visivel. O padrao anterior era tap
 * to play, e o callback de criacao do player roda uma unica vez — quando o
 * slide ainda nem entrou em tela. Resultado: o video so tocava se alguem
 * apertasse play, e a metrica de retencao nunca saia do zero. Mudo por
 * padrao porque som sozinho no meio da rolagem e intrusivo; o botao de
 * alto-falante devolve o som, que os controles nativos do Android nao tem.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Toca em loop. Default false. */
  loop?: boolean;
  /** Toca sozinho enquanto o card esta visivel. Default true. */
  autoplay?: boolean;
  /** Comeca sem som. Default true — autoplay com audio e intrusivo. */
  muted?: boolean;
  /** Card visivel na lista. Falso pausa e libera o decodificador. */
  ativo?: boolean;
  /** Chamado no primeiro play efetivo. */
  onIniciar?: () => void;
  /** Chamado uma vez por quartil alcancado. */
  onQuartil?: (quartil: 25 | 50 | 75 | 100) => void;
  /** Milissegundos assistidos, ao pausar ou sair. */
  onTempoAssistido?: (ms: number) => void;
}

export function FeedVideo({
  uri,
  style,
  loop = false,
  autoplay = true,
  muted = true,
  ativo = true,
  onIniciar,
  onQuartil,
  onTempoAssistido,
}: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
  });

  const [semSom, setSemSom] = useState(muted);
  const jaIniciou = useRef(false);
  const quartisVistos = useRef(new Set<number>());
  const acumuladoMs = useRef(0);
  const ultimaAmostra = useRef<number | null>(null);

  // Os callbacks chegam como funcoes anonimas, com identidade nova a cada
  // render do card. Se entrassem nas dependencias do intervalo, cada render
  // reiniciaria o cronometro e o tique de 1s poderia nunca completar.
  const avisos = useRef({ onIniciar, onQuartil, onTempoAssistido });
  avisos.current = { onIniciar, onQuartil, onTempoAssistido };

  // Toca quando o card entra em vista, pausa quando sai. Sem isso o audio
  // continua tocando enquanto o profissional ja rolou para outra publicacao.
  useEffect(() => {
    try {
      if (ativo) {
        if (autoplay) player.play();
        return;
      }
      player.pause();
    } catch {
      /* player pode ja ter sido liberado */
    }
    if (!ativo) {
      if (acumuladoMs.current > 0) {
        avisos.current.onTempoAssistido?.(Math.round(acumuladoMs.current));
        acumuladoMs.current = 0;
      }
      ultimaAmostra.current = null;
    }
  }, [ativo, autoplay, player]);

  // Amostragem de progresso. Um segundo e resolucao suficiente para quartil
  // e barato o bastante para nao pesar na rolagem.
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      try {
        if (!player.playing) {
          ultimaAmostra.current = null;
          return;
        }
        if (!jaIniciou.current) {
          jaIniciou.current = true;
          avisos.current.onIniciar?.();
        }

        const agora = Date.now();
        if (ultimaAmostra.current) {
          acumuladoMs.current += agora - ultimaAmostra.current;
        }
        ultimaAmostra.current = agora;

        const duracao = player.duration;
        if (duracao > 0) {
          const pct = (player.currentTime / duracao) * 100;
          for (const q of [25, 50, 75, 100] as const) {
            if (pct >= q && !quartisVistos.current.has(q)) {
              quartisVistos.current.add(q);
              avisos.current.onQuartil?.(q);
            }
          }
        }
      } catch {
        /* player liberado entre ticks */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [ativo, player]);

  const alternarSom = () => {
    try {
      const novo = !player.muted;
      player.muted = novo;
      setSemSom(novo);
    } catch {
      /* player liberado */
    }
  };

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
        allowsFullscreen
        allowsPictureInPicture
      />
      {/* Os controles nativos do Android nao trazem botao de som. Sem este,
          um video que comeca mudo fica mudo para sempre. */}
      <TouchableOpacity
        style={styles.som}
        onPress={alternarSom}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={semSom ? 'Ativar som do video' : 'Desativar som do video'}
      >
        <Ionicons
          name={semSom ? 'volume-mute' : 'volume-high'}
          size={16}
          color="#fff"
        />
        <Text style={styles.somTexto}>{semSom ? 'Som' : 'Mudo'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  som: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  somTexto: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
