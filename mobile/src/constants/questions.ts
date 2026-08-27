import { TemplateQuestion } from '../types';

// 기존 웹 버전 AI 시스템 프롬프트의 "필수 확인" 항목을 그대로 계승했습니다.
// AI 대화 기능을 다시 붙일 때는 이 배열 대신 대화 흐름으로 교체하면 됩니다.
export const TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  { id: 'weather', text: '오늘 날씨(풍경)는 어땠어?', template: '오늘 날씨(풍경)는 {답변}였어.' },
  { id: 'meal', text: '오늘 먹은 것 중에 기억에 남는 게 있어?', template: '오늘 먹은 것 중에 기억에 남는 건 {답변}야.' },
  { id: 'mood', text: '오늘 기분은 어땠어?', template: '오늘 기분은 {답변}였어.' },
  { id: 'event', text: '오늘 있었던 일 중에 이야기하고 싶은 게 있어?', template: '오늘 있었던 일: {답변}' },
];
