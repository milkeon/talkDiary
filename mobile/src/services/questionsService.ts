import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TemplateQuestion } from '../types';
import { TEMPLATE_QUESTIONS } from '../constants/questions';

export function makeQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function getQuestions(userName: string): Promise<TemplateQuestion[]> {
  const snap = await getDoc(doc(db, 'users', userName));
  const saved = snap.data()?.questions as TemplateQuestion[] | undefined;
  return saved && saved.length > 0 ? saved : TEMPLATE_QUESTIONS;
}

export async function saveQuestions(userName: string, questions: TemplateQuestion[]): Promise<void> {
  await updateDoc(doc(db, 'users', userName), { questions });
}
