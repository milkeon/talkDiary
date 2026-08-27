import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

interface Props {
  uri: string | null;
  onChange: (uri: string | null, durationMillis: number) => void;
}

export default function VoiceRecorder({ uri, onChange }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(uri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    (async () => {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  async function startRecording() {
    const status = await requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert('마이크 권한이 필요해요', '설정에서 마이크 권한을 허용해주세요.');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    onChange(null, 0);
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording() {
    await recorder.stop();
    if (recorder.uri) {
      onChange(recorder.uri, recorderState.durationMillis ?? 0);
    }
  }

  function togglePlayback() {
    if (playerStatus.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  }

  return (
    <View style={styles.container}>
      {!uri && !recorderState.isRecording && (
        <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
          <Text style={styles.recordBtnText}>🎤 음성으로 답하기</Text>
        </TouchableOpacity>
      )}

      {recorderState.isRecording && (
        <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
          <Text style={styles.stopBtnText}>
            ⏺ 녹음 중... ({Math.round((recorderState.durationMillis ?? 0) / 1000)}초) — 눌러서 정지
          </Text>
        </TouchableOpacity>
      )}

      {uri && !recorderState.isRecording && (
        <View style={styles.previewRow}>
          <TouchableOpacity style={styles.playBtn} onPress={togglePlayback}>
            <Text style={styles.playBtnText}>{playerStatus.playing ? '⏸ 일시정지' : '▶ 재생'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryBtn} onPress={startRecording}>
            <Text style={styles.retryBtnText}>다시 녹음</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  recordBtn: {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#ffb3b3',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  stopBtn: {
    backgroundColor: '#ff5c5c',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  recordBtnText: { color: '#333', fontWeight: '600' },
  stopBtnText: { color: '#fff', fontWeight: '600' },
  previewRow: { flexDirection: 'row', gap: 10 },
  playBtn: {
    flex: 1,
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  playBtnText: { color: '#7c5cff', fontWeight: '600' },
  retryBtn: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  retryBtnText: { color: '#666', fontWeight: '600' },
});
