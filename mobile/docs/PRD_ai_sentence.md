# PRD: 지난 기록 - AI 문장화 기능 (Gemini 재도입, 범위 한정)

## 1. 배경
- "지난 기록" 상세 화면(`HistoryDetailScreen.tsx`)에는 질문을 꺼서(`showQuestion=false`) 볼 수 있는 "일기 보기" 모드가 있음.
- 현재는 AI 없이 문자열 규칙(`buildSentence`, `src/utils/sentence.ts`)으로 답변을 이어붙이는 방식으로 구현되어 있음.
  - 문장 틀(`template`)이 있으면 `{답변}` 자리에 끼워 넣고, 없으면 `"질문: 답변"` 형태로 표시.
- 사용자 테스트 결과, 문장 틀을 안 만든 질문은 여전히 "질문: 답변" 나열에 가까워서 실제 일기처럼 읽히지 않음.
  - 예: "안녕~밥 먹었어? : 어 / 기분은 어때? : 그냥 / 오늘 별일 없었어? : 철규 취뽀함" → 기대: "밥은 먹음. 기분은 그냥 그럼. 오늘 철규 취뽀함." 같은 자연스러운 문장.
- 사용자가 두 가지 대안(① 규칙 기반 개선 ② AI 재도입) 중 **AI 재도입**을 선택함.

## 2. 목표 (Scope)
- **오직 하나의 기능만** 구현: 질문을 끈 상태에서 보이는 "일기 문단"을 AI(Gemini)가 자연스러운 문장/문단으로 다듬어서 보여준다.
- 웹 버전(`script.js`)에 있던 "AI와 실시간 대화", "AI가 대화 요약해서 자동으로 일기 작성" 기능은 **재도입하지 않음**.
- 질문을 켜서 보는 말풍선(카톡 스타일) 화면은 그대로 유지, 변경 없음.

## 3. Out of Scope (명시적 제외)
- AI 챗봇/자유 대화 기능
- AI가 알아서 오늘의 질문에 답을 생성하는 기능
- 음성 답변의 텍스트 변환(STT)
- 질문 자체를 AI가 생성/추천하는 기능

## 4. 사용자 시나리오
1. 사용자가 "지난 기록"에서 특정 날짜를 눌러 상세 화면으로 들어간다.
2. "질문 보기/끄기" 스위치를 끈다.
3. 기존에는 규칙 기반 문장이 즉시 보였지만, 이제는:
   - 처음 끌 때 "문장 만드는 중..." 같은 로딩 표시 후, AI가 다듬은 자연스러운 일기 문단이 표시된다.
   - 같은 기록을 다시 봐도(같은 문서를 다시 열어도) 매번 API를 다시 부르지 않고, 저장된 결과를 바로 보여준다(캐싱).
4. 음성 답변은 기존처럼 별도 재생 버튼으로 노출(문장화 대상 아님, 텍스트 답변만 AI 문장화 대상).

## 5. 기능 요구사항
| # | 요구사항 | 비고 |
|---|---|---|
| F1 | 텍스트 답변들(질문+답변 쌍)을 Gemini API에 보내 자연스러운 일기 문단으로 변환 | 입력: 질문/답변 배열, 출력: 문단 문자열 |
| F2 | 변환 결과를 Firestore `entries` 문서에 캐싱(예: `aiParagraph` 필드) | 최초 1회만 API 호출, 이후 조회 시 재사용 |
| F3 | API 키는 `.env`의 `EXPO_PUBLIC_GEMINI_API_KEY`로 관리 | Firebase 설정과 동일 패턴 |
| F4 | API 실패/오류 시 기존 규칙 기반(`buildSentence`) 문장으로 자동 대체(fallback) | 네트워크 오류, 키 누락 등 대비 |
| F5 | 로딩 중 상태 표시(스피너 또는 "문장 만드는 중...") | 사용자 대기 경험 |
| F6 | 질문에 이미 문장 틀(`template`)이 있는 항목은 AI 호출 전에 먼저 문장으로 변환한 뒤, 그 결과들을 AI에게 "자연스럽게 다듬어줘" 요청 | 기존 템플릿 자산 재사용 |

## 6. 비기능 요구사항
- 초보 개발자도 이해할 수 있도록 함수/파일 단위가 작고 명확해야 함(`src/services/aiService.ts` 단일 파일에 집중).
- API 비용/호출 최소화: 같은 기록은 재호출하지 않음(캐싱 필수).
- 기존 기능(말풍선 보기, 질문 켜기)에 영향 없어야 함.

## 7. 데이터 모델 변경
`DiaryEntry`에 선택적 필드 추가:
```typescript
export interface DiaryEntry {
  userName: string;
  dateKey: string;
  answers: Answer[];
  createdAt: number;
  aiParagraph?: string; // AI가 생성한 일기 문단 (캐시)
}
```
Firestore 문서 업데이트는 `updateDoc(doc(db, 'entries', `${userName}_${dateKey}`), { aiParagraph })`로 처리.

## 8. 기술 방식
- Gemini REST API 직접 호출(`fetch`) 또는 `@google/generative-ai` SDK 중 선택 필요 (아래 체크리스트에서 결정).
- 모델은 웹 버전과 동일하게 `gemma-3-27b-it` 우선 검토, 안 되면 `gemini-1.5-flash` 등 대체.
- 프롬프트(예시):
  > "다음은 질문과 답변 목록입니다. 이를 자연스러운 한국어 일기 문단으로 다듬어 주세요. 없는 내용을 지어내지 마세요.\n[질문: 답변, ...]"

## 9. 성공 기준 (Acceptance Criteria)
- [ ] 질문 끄기 상태에서 텍스트 답변이 자연스러운 문단으로 보인다(사용자가 직접 확인, 예시 케이스로 재검증).
- [ ] 같은 기록을 다시 열어도 API가 다시 호출되지 않는다(Firestore에 `aiParagraph` 저장 확인).
- [ ] API 키가 없거나 호출 실패 시 앱이 죽지 않고 기존 방식 문장이 보인다.
- [ ] `.env`에 실제 키가 커밋되지 않는다.

---

# 체크리스트

## 준비
- [ ] Gemini API 키 발급/확인 (Google AI Studio)
- [ ] `mobile/.env`에 `EXPO_PUBLIC_GEMINI_API_KEY=...` 추가 (실키, 커밋 금지)
- [ ] `mobile/.env.example`에 `EXPO_PUBLIC_GEMINI_API_KEY=` 빈 값 추가
- [ ] SDK 방식(`@google/generative-ai` 패키지) vs REST 직접 호출(fetch) 결정

## 구현
- [ ] `src/types.ts`: `DiaryEntry`에 `aiParagraph?: string` 추가
- [ ] `src/services/aiService.ts` 신규 생성: `generateDiaryParagraph(answers, templateMap): Promise<string>`
  - [ ] 프롬프트 구성 (질문/답변 목록 → 자연스러운 문단 요청)
  - [ ] API 호출 및 응답 텍스트 추출
  - [ ] 실패 시 에러 던지기(호출부에서 fallback 처리)
- [ ] `src/services/diaryService.ts`: `updateAiParagraph(userName, dateKey, paragraph)` 함수 추가 (Firestore `updateDoc`)
- [ ] `src/screens/HistoryDetailScreen.tsx` 수정
  - [ ] `entry.aiParagraph`가 있으면 바로 표시
  - [ ] 없으면 로딩 상태 표시 → `generateDiaryParagraph` 호출 → 성공 시 화면 표시 + Firestore 캐싱
  - [ ] 실패 시 기존 `buildSentence` 기반 문단으로 대체 표시
- [ ] 로딩 스피너 UI 추가 (`ActivityIndicator`)

## 검증
- [ ] `npx tsc --noEmit` 통과
- [ ] `npx expo export --platform android` 번들 성공 (검증 후 `dist` 폴더 삭제)
- [ ] 실기기(Expo Go)에서 질문 끄기 → 로딩 → 자연스러운 문단 확인
- [ ] 같은 기록 재조회 시 API 재호출 안 되는지 확인 (Firestore 콘솔에서 `aiParagraph` 필드 확인)
- [ ] API 키를 임시로 지워서 fallback 동작 확인
- [ ] `git status`로 `.env` 미포함 확인 후 커밋

## 커밋
- [ ] `<feat> 지난 기록에 AI 문장화(Gemini) 기능 추가` 형태로 커밋
