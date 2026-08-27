export interface TemplateQuestion {
  id: string;
  text: string;
  // 질문을 안 보여주는 모드에서 짧은 답변을 완전한 문장으로 바꿀 때 쓰는 틀.
  // {답변} 자리에 사용자가 입력한 답변이 들어갑니다. (예: "오늘 날씨는 {답변}였어.")
  template?: string;
}

export type AnswerType = 'text' | 'voice';

export interface Answer {
  questionId: string;
  question: string;
  type: AnswerType;
  text?: string;
  audioUrl?: string;
  audioDurationMillis?: number;
}

export interface DiaryEntry {
  userName: string;
  dateKey: string; // YYYY-MM-DD
  answers: Answer[];
  createdAt: number;
}

export interface AppUser {
  userName: string;
  password: string;
  preferredTone: 'banmal' | 'jondaemal';
  questions?: TemplateQuestion[];
  isDeleted?: boolean;
}
