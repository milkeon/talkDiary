import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AppUser } from '../types';
import { useAuth } from '../context/AuthContext';

type Mode = 'selection' | 'login' | 'signup';

export default function AuthScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>('selection');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const q = query(collection(db, 'users'), orderBy('userName', 'asc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map((d) => d.data() as AppUser).filter((u) => !u.isDeleted));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  }

  function openLogin(user: AppUser) {
    setSelectedUser(user);
    setPassword('');
    setMode('login');
  }

  async function handleLogin() {
    if (!password) {
      Alert.alert('비밀번호를 입력해주세요.');
      return;
    }
    if (selectedUser?.password.toLowerCase() === password.toLowerCase()) {
      login(selectedUser.userName);
    } else {
      Alert.alert('비밀번호가 일치하지 않습니다.');
    }
  }

  async function handleSignup() {
    const name = signupName.trim();
    const pw = signupPassword.trim();
    if (!name || !pw) {
      Alert.alert('닉네임과 비밀번호를 모두 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const userRef = doc(db, 'users', name);
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        Alert.alert('이미 존재하는 닉네임입니다.');
        return;
      }
      const newUser: AppUser = { userName: name, password: pw, preferredTone: 'banmal' };
      await setDoc(userRef, newUser);
      login(name);
    } catch (e) {
      console.error(e);
      Alert.alert('회원가입 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'login' && selectedUser) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{selectedUser.userName}님으로 로그인</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
          <Text style={styles.primaryBtnText}>대화 시작하기</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('selection')}>
          <Text style={styles.textBtn}>뒤로 가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'signup') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>새로운 이야기 시작</Text>
        <TextInput
          style={styles.input}
          placeholder="닉네임"
          value={signupName}
          onChangeText={setSignupName}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          secureTextEntry
          value={signupPassword}
          onChangeText={setSignupPassword}
          onSubmitEditing={handleSignup}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSignup} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? '처리 중...' : '등록 및 시작'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('selection')}>
          <Text style={styles.textBtn}>취소</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FrienDiary</Text>
      <Text style={styles.subtitle}>당신의 오늘을 기록하는 가장 다정한 방법</Text>

      {loadingUsers ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.userName}
          style={{ maxHeight: 300, marginVertical: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>등록된 이야기가 없습니다.{'\n'}새 이야기를 시작해 보세요!</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userCard} onPress={() => openLogin(item)}>
              <Text style={styles.userCardText}>{item.userName}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('signup')}>
        <Text style={styles.secondaryBtnText}>+ 새로운 이야기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#7c5cff',
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#7c5cff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#7c5cff', fontSize: 16, fontWeight: '600' },
  textBtn: { textAlign: 'center', color: '#888', marginTop: 16 },
  userCard: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#f5f3ff',
    marginBottom: 8,
  },
  userCardText: { fontSize: 16, fontWeight: '500' },
  emptyText: { textAlign: 'center', color: '#888', fontSize: 13 },
});
