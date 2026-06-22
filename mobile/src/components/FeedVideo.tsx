/**
 * Player inline de video pro Feed (Jessica 22/06).
 *
 * Antes o video abria via Linking.openURL — usuario era jogado pro browser
 * externo. Agora roda direto no card com controls nativos (play/pause/seek
 * + fullscreen). Usa expo-video (SDK 54+, substitui o legado expo-av).
 */

import React from 'react';
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
}

export function FeedVideo({
  uri,
  style,
  loop = false,
  autoplay = false,
  muted = false,
}: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (autoplay) p.play();
  });

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
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
