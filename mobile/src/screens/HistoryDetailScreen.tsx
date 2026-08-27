import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HistoryStackParamList } from '../navigation/RootNavigator';
import { formatKoreanDate } from '../utils/date';
import { Answer, TemplateQuestion } from '../types';
import { getQuestions } from '../services/questionsService';
import { buildSentence } from '../utils/sentence';

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryDetail'>;

const SHOW_QUESTION_KEY = 'friendiary:historyShowQuestion';

function VoiceAnswerPlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  function toggle() {
    if (status.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  }

  return (
    <TouchableOpacity onPress={toggle}>
      <Text style={styles.voicePlayText}>{status.playing ? '⏸ 일시정지' : '▶ 음성 답변 재생'}</Text>
    </TouchableOpacity>
  );
}

function QuestionBubbleRow({ text }: { text: string }) {
  return (
    <View style={styles.rowLeft}>
      <View style={[styles.bubble, styles.bubbleLeft]}>
        <Text style={styles.bubbleTextLeft}>{text}</Text>
      </View>
    </View>
  );
}

function AnswerBubbleRow({ answer, displayText }: { answer: Answer; displayText: string }) {
  return (
    <View style={styles.rowRight}>
      <View style={[styles.bubble, styles.bubbleRight]}>
        {answer.type === 'text' ? (
          <Text style={styles.bubbleTextRight}>{displayText}</Text>
        ) : answer.audioUrl ? (
          <VoiceAnswerPlayer url={answer.audioUrl} />
        ) : null}
      </View>
    </View>
  );
}

export default function HistoryDetailScreen({ route }: Props) {
  const { entry } = route.params;
  const [showQuestion, setShowQuestion] = useState(true);
  const [templateMap, setTemplateMap] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    AsyncStorage.getItem(SHOW_QUESTION_KEY).then((v) => {
      if (v !== null) setShowQuestion(v === '1');
    });
    getQuestions(entry.userName).then((qs: TemplateQuestion[]) => {
      const map: Record<string, string | undefined> = {};
      qs.forEach((q) => {
        map[q.id] = q.template;
      });
      setTemplateMap(map);
    });
  }, [entry.userName]);

  function toggleShowQuestion(next: boolean) {
    setShowQuestion(next);
    AsyncStorage.setItem(SHOW_QUESTION_KEY, next ? '1' : '0');
  }

  const textAnswers = entry.answers.filter((a): a is Answer & { text: string } => a.type === 'text' && !!a.text);
  const voiceAnswers = entry.answers.filter((a) => a.type === 'voice');
  const diaryParagraph = textAnswers
    .map((a) => buildSentence(a.question, templateMap[a.questionId], a.text))
    .join(' ');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleText}>질문 {showQuestion ? '보기' : '끄기'}</Text>
        <Switch value={showQuestion} onValueChange={toggleShowQuestion} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.dateTitle}>{formatKoreanDate(entry.dateKey)}</Text>

        {showQuestion ? (
          entry.answers.map((answer) => (
            <View key={answer.questionId} style={styles.pair}>
              <QuestionBubbleRow text={answer.question} />
              <AnswerBubbleRow answer={answer} displayText={answer.text ?? ''} />
            </View>
          ))
        ) : (
          <>
            {diaryParagraph.length > 0 && (
              <View style={styles.diaryCard}>
                <Text style={styles.diaryText}>{diaryParagraph}</Text>
              </View>
            )}
            {voiceAnswers.map((answer) => (
              <View key={answer.questionId} style={styles.pair}>
                <AnswerBubbleRow answer={answer} displayText="" />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#b2c7d9' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  toggleText: { fontSize: 13, color: '#fff' },
  scroll: { padding: 16, gap: 4 },
  dateTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 12 },
  pair: { gap: 8, marginBottom: 12 },
  rowLeft: { flexDirection: 'row', justifyContent: 'flex-start' },
  rowRight: { flexDirection: 'row', justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleLeft: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: '#ffe14d',
    borderBottomRightRadius: 4,
  },
  bubbleTextLeft: { fontSize: 15, color: '#333', lineHeight: 21 },
  bubbleTextRight: { fontSize: 15, color: '#3a2f00', lineHeight: 21 },
  voicePlayText: { fontSize: 15, color: '#3a2f00', fontWeight: '600' },
  diaryCard: {
    backgroundColor: '#fffdf5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  diaryText: { fontSize: 16, color: '#3a2f00', lineHeight: 26 },
});
