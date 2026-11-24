import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerSW } from 'virtual:pwa-register';
import { registerSafeUpdate } from '../src/safeUpdate';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

let state: { unjudgedAnswer: boolean; activeTest: boolean };
let page: EventTarget & { visibilityState: string };
let reload: ReturnType<typeof vi.fn>;
const updateArrives = () => vi.mocked(registerSW).mock.calls[0][0]!.onNeedReload!();
const interact = (event = 'click') => { page.dispatchEvent(new Event(event)); vi.runAllTimers(); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state = { unjudgedAnswer: false, activeTest: false };
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  reload = vi.fn();
  vi.stubGlobal('document', page);
  vi.stubGlobal('location', { reload });
  registerSafeUpdate(() => state);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps immediate registration and reloads immediately when an idle update arrives', () => {
  expect(registerSW).toHaveBeenCalledWith({ immediate: true, onNeedReload: expect.any(Function) });
  updateArrives();
  expect(reload).toHaveBeenCalledOnce();
});

it('does not reload without a pending update', () => {
  interact();
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  expect(reload).not.toHaveBeenCalled();
});

it.each(['unjudgedAnswer', 'activeTest'] as const)('defers updates while %s, including when hidden', key => {
  state[key] = true;
  updateArrives();
  interact();
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  expect(reload).not.toHaveBeenCalled();
});

it('keeps deferring between test questions even after an answer is saved', () => {
  state = { unjudgedAnswer: true, activeTest: true };
  updateArrives();
  state.unjudgedAnswer = false;
  interact();
  expect(reload).not.toHaveBeenCalled();
  state.activeTest = false;
  interact();
  expect(reload).toHaveBeenCalledOnce();
});

it.each(['click', 'change'])('applies a deferred update after a safe %s interaction', event => {
  state.unjudgedAnswer = true;
  updateArrives();
  page.dispatchEvent(new Event(event));
  expect(reload).not.toHaveBeenCalled();
  state.unjudgedAnswer = false;
  vi.runAllTimers();
  expect(reload).toHaveBeenCalledOnce();
  interact(event);
  expect(reload).toHaveBeenCalledOnce();
});

it('applies a deferred update when the page is hidden with a judged or empty board', () => {
  state.unjudgedAnswer = true;
  updateArrives();
  state.unjudgedAnswer = false;
  page.dispatchEvent(new Event('visibilitychange'));
  expect(reload).not.toHaveBeenCalled();
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  expect(reload).toHaveBeenCalledOnce();
});

it('rechecks live work state before applying a scheduled update', () => {
  state.unjudgedAnswer = true;
  updateArrives();
  state.unjudgedAnswer = false;
  page.dispatchEvent(new Event('click'));
  state.unjudgedAnswer = true;
  vi.runAllTimers();
  expect(reload).not.toHaveBeenCalled();
});
