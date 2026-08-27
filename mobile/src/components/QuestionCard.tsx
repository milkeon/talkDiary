import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';
import VoiceRecorder from './VoiceRecorder';
import { Answer, TemplateQuestion } from '../types';

interface Props {
  question: TemplateQuestion;
  value: Answer | null;
  voiceSpeed: number;
  onChange: (answer: Answer | null) => void;
}

export default function QuestionCard({ question, value, voiceSpeed, onChange }: Props) {
  const [mode, setMode] = useState<'text' | 'voice'>(value?.type ?? 'text');
  const [text, setText] = useState(value?.text ?? '');

  useEffect(() => {
    Speech.speak(question.text, { language: 'ko-KR', rate: voiceSpeed });
    return () => {
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  function handleTextChange(t: string) {
    setText(t);
    onChange(t.trim() ? { questionId: question.id, question: question.text, type: 'text', text: t } : null);
  }

  function handleVoiceChange(uri: string | null, durationMillis: number) {
    onChange(
      uri
        ? {
            questionId: question.id,
            question: question.text,
            type: 'voice',
            audioUrl: uri,
            audioDurationMillis: durationMillis,
          }
        : null
    );
  }

  function switchMode(next: 'text' | 'voice') {
    setMode(next);
    onChange(null);
    setText('');
  }

  return (
    <View style={styles.card}>
      <View style={styles.questionRow}>
        <Text style={styles.questionText}>{question.text}</Text>
        <TouchableOpacity onPress={() => Speech.speak(question.text, { language: 'ko-KR', rate: voiceSpeed })}>
          <Text style={styles.speakerIcon}>🔊</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
          onPress={() => switchMode('text')}
        >
          <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>텍스트</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]}
          onPress={() => switchMode('voice')}
        >
          <Text style={[styles.modeBtnText, mode === 'voice' && styles.modeBtnTextActive]}>음성</Text>
        </TouchableOpacity>
      </View>

      {mode === 'text' ? (
        <TextInput
          style={styles.input}
          placeholder="편하게 적어줘..."
          multiline
          value={text}
          onChangeText={handleTextChange}
        />
      ) : (
        <VoiceRecorder uri={value?.audioUrl ?? null} onChange={handleVoiceChange} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 16, gap: 12 },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questionText: { fontSize: 18, fontWeight: '600', flex: 1 },
  speakerIcon: { fontSize: 20, marginLeft: 8 },
  modeSwitch: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
  },
  modeBtnActive: { backgroundColor: '#7c5cff' },
  modeBtnText: { color: '#666', fontWeight: '500' },
  modeBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
