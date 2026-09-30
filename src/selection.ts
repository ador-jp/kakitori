export function selectRandom<T>(items: T[], from: number, to: number, count: number, random = Math.random): T[] {
  const pool = items.slice(from - 1, to);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
