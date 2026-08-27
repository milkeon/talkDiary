import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import QuestionCard from '../components/QuestionCard';
import { Answer, TemplateQuestion } from '../types';
import { useAuth } from '../context/AuthContext';
import { saveEntry } from '../services/diaryService';
import { getQuestions } from '../services/questionsService';
import { todayKey } from '../utils/date';
import { MainTabParamList } from '../navigation/RootNavigator';

export default function RecordScreen() {
  const { userName } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer | null>>({});
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userName) return;
      let active = true;
      setLoadingQuestions(true);
      getQuestions(userName)
        .then((qs) => {
          if (!active) return;
          setQuestions(qs);
          setIndex(0);
          setAnswers({});
          setSaved(false);
        })
        .finally(() => {
          if (active) setLoadingQuestions(false);
        });
      return () => {
        active = false;
      };
    }, [userName])
  );

  if (loadingQuestions) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const currentAnswer = answers[question.id] ?? null;

  function handleChange(answer: Answer | null) {
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
  }

  function goNext() {
    if (isLast) {
      handleSave();
    } else {
      setIndex((i) => i + 1);
    }
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  async function handleSave() {
    if (!userName) return;
    const finalAnswers = Object.values(answers).filter((a): a is Answer => !!a);
    if (finalAnswers.length === 0) {
      Alert.alert('아직 답변한 질문이 없어요', '적어도 하나는 답해주세요.');
      return;
    }
    setSaving(true);
    try {
      await saveEntry(userName, todayKey(), finalAnswers);
      setSaved(true);
      navigation.navigate('지난 기록', { screen: 'HistoryList' });
    } catch (e) {
      console.error(e);
      Alert.alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function startOver() {
    setAnswers({});
    setIndex(0);
    setSaved(false);
  }

  if (saved) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneText}>오늘 하루도 고생 많았어요!{'\n'}기록이 안전하게 저장됐어요.</Text>
          <TouchableOpacity style={[styles.primaryBtn, styles.doneBtn]} onPress={startOver}>
            <Text style={styles.primaryBtnText}>다시 기록하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.progress}>
            {index + 1} / {questions.length}
          </Text>
          <View style={styles.speedControl}>
            <TouchableOpacity onPress={() => setVoiceSpeed((s) => Math.max(0.5, +(s - 0.1).toFixed(1)))}>
              <Text style={styles.speedBtn}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.speedText}>{voiceSpeed.toFixed(1)}x</Text>
            <TouchableOpacity onPress={() => setVoiceSpeed((s) => Math.min(2.0, +(s + 0.1).toFixed(1)))}>
              <Text style={styles.speedBtn}>▶</Text>
            </TouchableOpacity>
          </View>
        </View>

        <QuestionCard
          key={question.id}
          question={question}
          value={currentAnswer}
          voiceSpeed={voiceSpeed}
          onChange={handleChange}
        />

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, index === 0 && styles.navBtnDisabled]} onPress={goPrev} disabled={index === 0}>
            <Text style={styles.navBtnText}>이전</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isLast ? '저장하기' : '다음'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6fb' },
  scroll: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { fontSize: 14, color: '#888', fontWeight: '600' },
  speedControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speedBtn: { fontSize: 14, color: '#7c5cff', paddingHorizontal: 4 },
  speedText: { fontSize: 13, color: '#666', minWidth: 34, textAlign: 'center' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  navBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { color: '#666', fontWeight: '600' },
  primaryBtn: {
    flex: 2,
    backgroundColor: '#7c5cff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  doneBtn: { flex: 0, paddingHorizontal: 32 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  doneEmoji: { fontSize: 48 },
  doneText: { fontSize: 16, textAlign: 'center', color: '#444', lineHeight: 24 },
});
