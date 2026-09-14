import React, { useEffect } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  onFinish?: () => void;
}

/**
 * Player inline de aula em video. Mesma base do FeedVideo (expo-video),
 * mas sem autoplay/mudo/quartis: aqui o aluno decide quando assistir, com
 * som ligado por padrao -- e' conteudo educacional, nao rolagem de feed.
 *
 * Jessica (14/09): o video de aula abria por fora via Linking, jogando o
 * profissional pro navegador ou app de video do aparelho. Pediu pra tocar
 * dentro da propria tela, igual Feed/Hotmart. `onFinish` dispara ao chegar
 * no fim -- usado pra so liberar o botao "Concluir" depois que o aluno
 * assistiu de verdade, e nao antes.
 */
export function LessonVideo({ uri, style, onFinish }: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      onFinish?.();
    });
    return () => sub.remove();
  }, [player, onFinish]);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
        allowsFullscreen
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 10,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
