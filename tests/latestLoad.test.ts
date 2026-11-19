import { describe, expect, it, vi } from 'vitest';
import { createLatestLoad } from '../src/latestLoad';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const first = deferred<string[]>(), second = deferred<string[]>();
  const apply = vi.fn(), onError = vi.fn();
  const loader = createLatestLoad((char: string) => char === '一' ? first.promise : second.promise, apply, onError);
  return { first, second, apply, onError, loader };
}

describe('latest reference load', () => {
  it('ignores an earlier reference that resolves after the current kanji', async () => {
    const { first, second, apply, onError, loader } = setup();
    const older = loader.run('一'), newer = loader.run('二');
    second.resolve(['二']);
    await newer;
    first.resolve(['一']);
    await older;
    expect(apply.mock.calls).toEqual([[['二']]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores stale errors', async () => {
    const { first, second, apply, onError, loader } = setup();
    const older = loader.run('一'), newer = loader.run('二');
    second.resolve(['二']);
    await newer;
    first.reject(new Error('old request failed'));
    await older;
    expect(apply).toHaveBeenCalledExactlyOnceWith(['二']);
    expect(onError).not.toHaveBeenCalled();
  });

  it('applies an empty current reference', async () => {
    const { first, apply, loader } = setup();
    const pending = loader.run('一');
    first.resolve([]);
    await pending;
    expect(apply).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('reports current errors', async () => {
    const { first, apply, onError, loader } = setup();
    const pending = loader.run('一');
    const error = new Error('request failed');
    first.reject(error);
    await pending;
    expect(apply).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it.each(['resolve', 'reject'] as const)('ignores a pending %s after navigation', async outcome => {
    const { first, apply, onError, loader } = setup();
    const pending = loader.run('一');
    loader.invalidate();
    if (outcome === 'resolve') first.resolve(['一']);
    else first.reject(new Error('request failed'));
    await pending;
    expect(apply).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
