export type Progress = { attempts: number; latest: number; best: number; lowScores: number };
const KEY = 'kakitori-progress-v1';
export const loadProgress = (): Record<string, Progress> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export function saveResult(kanji: string, score: number) { const all = loadProgress(), old = all[kanji] || { attempts: 0, latest: 0, best: 0, lowScores: 0 }; all[kanji] = { attempts: old.attempts + 1, latest: score, best: Math.max(old.best, score), lowScores: old.lowScores + (score < 70 ? 1 : 0) }; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 採点結果の表示を端末の保存可否に依存させない */ } }
export const clearProgress = () => localStorage.removeItem(KEY);
