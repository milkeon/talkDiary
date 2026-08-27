import { doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { Directory, File, Paths } from 'expo-file-system';
import { db } from '../firebase';
import { Answer, DiaryEntry } from '../types';

function localizeVoiceAnswer(userName: string, dateKey: string, answer: Answer): Answer {
  if (answer.type !== 'voice' || !answer.audioUrl) {
    return answer;
  }
  const dir = new Directory(Paths.document, 'voice-answers', userName, dateKey);
  dir.create({ intermediates: true, idempotent: true });

  const destFile = new File(dir, `${answer.questionId}.m4a`);
  if (destFile.uri === answer.audioUrl) {
    // 이미 저장 위치에 있는 파일이면 다시 복사할 필요 없음
    return answer;
  }
  if (destFile.exists) {
    destFile.delete();
  }

  const sourceFile = new File(answer.audioUrl);
  sourceFile.copy(destFile);
  return { ...answer, audioUrl: destFile.uri };
}

export async function saveEntry(userName: string, dateKey: string, answers: Answer[]): Promise<void> {
  const localizedAnswers = answers.map((a) => localizeVoiceAnswer(userName, dateKey, a));
  const entry: DiaryEntry = {
    userName,
    dateKey,
    answers: localizedAnswers,
    createdAt: Date.now(),
  };
  const docId = `${userName}_${dateKey}`;
  await setDoc(doc(db, 'entries', docId), entry);
}

export async function fetchEntries(userName: string): Promise<DiaryEntry[]> {
  const q = query(collection(db, 'entries'), where('userName', '==', userName));
  const snap = await getDocs(q);
  const entries = snap.docs.map((d) => d.data() as DiaryEntry);
  entries.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return entries;
}
