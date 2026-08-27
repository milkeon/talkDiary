import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { TemplateQuestion } from '../types';
import { TEMPLATE_QUESTIONS } from '../constants/questions';
import { getQuestions, saveQuestions, makeQuestionId } from '../services/questionsService';

export default function QuestionSettingsScreen() {
  const { userName, logout } = useAuth();
  const [items, setItems] = useState<TemplateQuestion[]>([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userName) return;
      let active = true;
      setLoading(true);
      getQuestions(userName)
        .then((qs) => {
          if (active) setItems(qs);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [userName])
  );

  function updateText(id: string, text: string) {
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, text } : q)));
  }

  function updateTemplate(id: string, template: string) {
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, template } : q)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((q) => q.id !== id));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addItem() {
    const text = newText.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: makeQuestionId(), text }]);
    setNewText('');
  }

  function resetToDefault() {
    setItems(TEMPLATE_QUESTIONS.map((q) => ({ ...q })));
  }

  function handleLogout() {
    Alert.alert('로그아웃 하시겠어요?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: logout },
    ]);
  }

  async function handleSave() {
    if (!userName) return;
    const cleaned = items.map((q) => ({ ...q, text: q.text.trim() })).filter((q) => q.text.length > 0);
    if (cleaned.length === 0) {
      Alert.alert('질문이 하나도 없어요', '적어도 하나는 있어야 해요.');
      return;
    }
    setSaving(true);
    try {
      await saveQuestions(userName, cleaned);
      setItems(cleaned);
      Alert.alert('저장했어요', '기록하기 화면에서 새 질문으로 물어볼게요.');
    } catch (e) {
      console.error(e);
      Alert.alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <Text style={styles.title}>질문 설정</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>{userName}님으로 로그인 중</Text>
        <Text style={styles.subtitle}>기록할 때 물어볼 질문과 순서를 자유롭게 바꿔보세요.</Text>
        <Text style={styles.subtitle}>
          "지난 기록"에서 질문을 꺼두고 보면, 답변이 아래 문장 틀({'{답변}'} 자리에 끼워짐)을 이용해 완전한 문장으로 보여져요.
        </Text>

        {items.map((item, index) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <View style={styles.orderCol}>
                <TouchableOpacity onPress={() => moveItem(index, -1)} disabled={index === 0}>
                  <Text style={[styles.orderBtn, index === 0 && styles.orderBtnDisabled]}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                  <Text style={[styles.orderBtn, index === items.length - 1 && styles.orderBtnDisabled]}>▼</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.itemInput}
                value={item.text}
                onChangeText={(t) => updateText(item.id, t)}
                multiline
              />
              <TouchableOpacity onPress={() => removeItem(item.id)}>
                <Text style={styles.deleteBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.templateInput}
              placeholder="질문 끌 때 쓸 문장 틀 (예: 오늘 날씨는 {답변}였어.)"
              value={item.template ?? ''}
              onChangeText={(t) => updateTemplate(item.id, t)}
            />
          </View>
        ))}

        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="새 질문 추가하기"
            value={newText}
            onChangeText={setNewText}
            onSubmitEditing={addItem}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addItem}>
            <Text style={styles.addBtnText}>추가</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>저장하기</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resetToDefault}>
          <Text style={styles.resetText}>기본 질문으로 되돌리기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6fb' },
  scroll: { padding: 20, gap: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 8 },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 10, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  templateInput: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    fontSize: 13,
    color: '#666',
  },
  orderCol: { gap: 2 },
  orderBtn: { fontSize: 14, color: '#7c5cff', padding: 4, textAlign: 'center' },
  orderBtnDisabled: { color: '#ddd' },
  itemInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  deleteBtn: { fontSize: 16, color: '#ff5c5c', padding: 6 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  addBtn: { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#666', fontWeight: '600' },
  saveBtn: { backgroundColor: '#7c5cff', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resetText: { textAlign: 'center', color: '#888', marginTop: 12, fontSize: 13 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#ff5c5c',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  logoutBtnText: { color: '#ff5c5c', fontWeight: '600', fontSize: 13 },
});
