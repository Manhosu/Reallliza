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
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Toca em loop. Default false. */
  loop?: boolean;
  /** Comeca tocando assim que aparece. Default false (tap to play). */
  autoplay?: boolean;
  /** Comeca mutado. Util pra autoplay sem incomodar. */
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
  autoplay = false,
  muted = false,
  ativo = true,
  onIniciar,
  onQuartil,
  onTempoAssistido,
}: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (autoplay && ativo) p.play();
  });

  const jaIniciou = useRef(false);
  const quartisVistos = useRef(new Set<number>());
  const acumuladoMs = useRef(0);
  const ultimaAmostra = useRef<number | null>(null);

  // Pausa quando o card sai de vista. Sem isso o audio continua tocando
  // enquanto o profissional ja rolou para outra publicacao.
  useEffect(() => {
    if (!ativo) {
      try {
        player.pause();
      } catch {
        /* player pode ja ter sido liberado */
      }
      if (acumuladoMs.current > 0) {
        onTempoAssistido?.(Math.round(acumuladoMs.current));
        acumuladoMs.current = 0;
      }
      ultimaAmostra.current = null;
    }
  }, [ativo, player, onTempoAssistido]);

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
          onIniciar?.();
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
              onQuartil?.(q);
            }
          }
        }
      } catch {
        /* player liberado entre ticks */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [ativo, player, onIniciar, onQuartil]);

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
});
