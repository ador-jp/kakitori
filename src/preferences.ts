const SLOW_DEMO_KEY = 'kakitori-slow-demo';

export function loadSlowDemo(): boolean {
  try { return localStorage.getItem(SLOW_DEMO_KEY) === 'true'; }
  catch { return false; }
}

export function saveSlowDemo(value: boolean): void {
  try { localStorage.setItem(SLOW_DEMO_KEY, String(value)); }
  catch {}
}
