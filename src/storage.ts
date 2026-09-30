export type Progress = { attempts: number; latest: number; best: number; lowScores: number };
const KEY = 'kakitori-progress-v1';
export const loadProgress = (): Record<string, Progress> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export function saveResult(kanji: string, score: number) { const all = loadProgress(), old = all[kanji] || { attempts: 0, latest: 0, best: 0, lowScores: 0 }; all[kanji] = { attempts: old.attempts + 1, latest: score, best: Math.max(old.best, score), lowScores: old.lowScores + (score < 70 ? 1 : 0) }; localStorage.setItem(KEY, JSON.stringify(all)); }
export const clearProgress = () => localStorage.removeItem(KEY);
