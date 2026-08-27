export function buildSentence(questionText: string, template: string | undefined, rawAnswer: string): string {
  const trimmed = rawAnswer.trim();
  if (template && template.includes('{답변}')) {
    return template.replace('{답변}', trimmed);
  }
  // 문장 틀이 따로 없으면, 답변만 덩그러니 나오지 않도록 질문 내용을 살려서 붙입니다.
  const strippedQuestion = questionText.trim().replace(/[?？!！.\s]+$/, '');
  return `${strippedQuestion}: ${trimmed}`;
}
