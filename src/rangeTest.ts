export const emptyRangeMessage = 'テストに出題する漢字がありません。';

export function rangeTestError(length: number, from: number, to: number, count: number): string {
  if (!length) return emptyRangeMessage;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > length || from > to) return `番号は1〜${length}の範囲で、最初の番号を小さくしてください。`;
  if (!Number.isInteger(count) || count < 1 || count > to - from + 1) return `出題数は1〜${to - from + 1}問にしてください。`;
  return '';
}
