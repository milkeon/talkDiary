import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { fetchEntries } from '../services/diaryService';
import { DiaryEntry } from '../types';
import { formatKoreanDate } from '../utils/date';
import { HistoryStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryList'>;

export default function HistoryScreen({ navigation }: Props) {
  const { userName } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userName) return;
      setLoading(true);
      fetchEntries(userName)
        .then(setEntries)
        .finally(() => setLoading(false));
    }, [userName])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.dateKey}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={styles.emptyText}>아직 기록이 없습니다.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('HistoryDetail', { entry: item })}>
            <Text style={styles.dateText}>{formatKoreanDate(item.dateKey)}</Text>
            <Text style={styles.previewText} numberOfLines={2}>
              {item.answers
                .map((a) => (a.type === 'text' ? a.text : '🎤 음성 답변'))
                .join(' · ')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 6 },
  dateText: { fontWeight: '700', fontSize: 15 },
  previewText: { color: '#666', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40 },
});
