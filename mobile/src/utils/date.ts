export function todayKey(): string {
  const now = new Date();
  const kr = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return kr.toISOString().split('T')[0];
}

export function formatKoreanDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
